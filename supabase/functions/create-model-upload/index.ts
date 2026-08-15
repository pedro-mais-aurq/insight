import { createAdminClient } from "../_shared/admin-client.ts";
import { UPLOAD_BUCKET } from "../_shared/constants.ts";
import {
  errorResponse,
  handlePreflight,
  isOriginAllowed,
  jsonResponse
} from "../_shared/cors.ts";
import {
  buildStoragePath,
  validateUploadMetadata
} from "../_shared/upload-metadata.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (request: Request) => {
  const preflight = handlePreflight(request);

  if (preflight) {
    return preflight;
  }

  if (!isOriginAllowed(request)) {
    return errorResponse(request, "ORIGIN_NOT_ALLOWED", 403);
  }

  if (request.method !== "POST") {
    return errorResponse(request, "METHOD_NOT_ALLOWED", 405);
  }

  let supabase;

  try {
    supabase = createAdminClient();
  } catch {
    logError("create-model-upload", "SERVER_CONFIGURATION_ERROR");
    return errorResponse(request, "REQUEST_FAILED", 500);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    supabase,
    "create-model-upload"
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, "INVALID_REQUEST", 400);
  }

  const validation = validateUploadMetadata(payload);

  if (!validation.valid) {
    return errorResponse(request, validation.error.code, 400);
  }

  const metadata = validation.value;
  const { data: created, error: createError } = await supabase
    .from("model_uploads")
    .insert({
      original_name: metadata.originalName,
      extension: metadata.extension,
      mime_type: metadata.mimeType,
      size_bytes: metadata.sizeBytes,
      storage_bucket: UPLOAD_BUCKET,
      storage_path: null,
      upload_status: "pending",
      error_code: null
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    logError("create-model-upload", "DATABASE_CREATE_FAILED");
    return errorResponse(request, "REQUEST_FAILED", 500);
  }

  const uploadId = created.id;
  const storagePath = buildStoragePath(uploadId, metadata.extension);
  const { data: pathUpdated, error: pathError } = await supabase
    .from("model_uploads")
    .update({
      storage_path: storagePath,
      upload_status: "uploading",
      error_code: null
    })
    .eq("id", uploadId)
    .eq("upload_status", "pending")
    .select("id")
    .maybeSingle();

  if (pathError || !pathUpdated) {
    await markFailed(supabase, uploadId, "STORAGE_PATH_FAILED");
    logError("create-model-upload", "STORAGE_PATH_FAILED", uploadId);
    return errorResponse(request, "REQUEST_FAILED", 500);
  }

  const { data: signedUpload, error: signedUploadError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (signedUploadError || !signedUpload?.token) {
    await markFailed(supabase, uploadId, "SIGNED_UPLOAD_FAILED");
    logError("create-model-upload", "SIGNED_UPLOAD_FAILED", uploadId);
    return errorResponse(request, "REQUEST_FAILED", 500);
  }

  return jsonResponse(request, {
    uploadId,
    bucket: UPLOAD_BUCKET,
    storagePath,
    signedUpload: {
      token: signedUpload.token,
      path: signedUpload.path
    }
  }, 201);
});

async function markFailed(supabase: ReturnType<typeof createAdminClient>, uploadId: string, code: string) {
  await supabase
    .from("model_uploads")
    .update({ upload_status: "failed", error_code: code })
    .eq("id", uploadId);
}

function logError(event: string, errorCode: string, uploadId?: string) {
  console.error(JSON.stringify({ event, errorCode, uploadId: uploadId ?? null }));
}
