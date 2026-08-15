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
  isValidUploadId,
  splitStoragePath
} from "../_shared/upload-metadata.ts";
import {
  COMPLETE_UPLOAD_ACTIONS,
  getCompleteUploadAction
} from "../_shared/upload-status.ts";
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
    logError("complete-model-upload", "SERVER_CONFIGURATION_ERROR");
    return errorResponse(request, "COMPLETE_FAILED", 500);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    supabase,
    "complete-model-upload"
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let payload: Record<string, unknown>;

  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, "INVALID_REQUEST", 400);
  }

  if (!isValidUploadId(payload?.uploadId)) {
    return errorResponse(request, "INVALID_UPLOAD_ID", 400);
  }

  const uploadId = payload.uploadId;
  const { data: upload, error: lookupError } = await supabase
    .from("model_uploads")
    .select("id, extension, size_bytes, storage_bucket, storage_path, upload_status")
    .eq("id", uploadId)
    .single();

  if (lookupError || !upload) {
    logError("complete-model-upload", "UPLOAD_NOT_FOUND", uploadId);
    return errorResponse(request, "UPLOAD_NOT_FOUND", 404);
  }

  const completeAction = getCompleteUploadAction(upload.upload_status);

  if (completeAction === COMPLETE_UPLOAD_ACTIONS.REJECT_REMOVED) {
    return errorResponse(request, "UPLOAD_REMOVED", 409);
  }

  if (completeAction === COMPLETE_UPLOAD_ACTIONS.RETURN_UPLOADED) {
    return jsonResponse(request, {
      uploadId,
      uploadStatus: "uploaded"
    });
  }

  if (completeAction !== COMPLETE_UPLOAD_ACTIONS.VERIFY_OBJECT) {
    return errorResponse(request, "UPLOAD_STATE_INVALID", 409);
  }

  const expectedPath = buildStoragePath(upload.id, upload.extension);

  if (upload.storage_bucket !== UPLOAD_BUCKET || upload.storage_path !== expectedPath) {
    logError("complete-model-upload", "SERVER_STATE_INVALID", uploadId);
    return errorResponse(request, "COMPLETE_FAILED", 409);
  }

  const pathParts = splitStoragePath(expectedPath);

  if (!pathParts) {
    return errorResponse(request, "COMPLETE_FAILED", 409);
  }

  const { data: objects, error: listError } = await supabase.storage
    .from(UPLOAD_BUCKET)
    .list(pathParts.folder, {
      limit: 10,
      search: pathParts.fileName
    });

  if (listError) {
    logError("complete-model-upload", "STORAGE_LOOKUP_FAILED", uploadId);
    return errorResponse(request, "COMPLETE_FAILED", 500);
  }

  const storedObject = objects?.find((object) => object.name === pathParts.fileName);

  if (!storedObject) {
    await markFailed(supabase, uploadId, "OBJECT_NOT_FOUND");
    return errorResponse(request, "OBJECT_NOT_FOUND", 409);
  }

  const storedSize = readStoredSize(storedObject.metadata);

  if (storedSize === null || storedSize !== upload.size_bytes) {
    await supabase.storage.from(UPLOAD_BUCKET).remove([expectedPath]);
    await markFailed(supabase, uploadId, "SIZE_MISMATCH");
    return errorResponse(request, "SIZE_MISMATCH", 409);
  }

  const { data: completed, error: completeError } = await supabase
    .from("model_uploads")
    .update({
      upload_status: "uploaded",
      error_code: null,
      uploaded_at: new Date().toISOString()
    })
    .eq("id", uploadId)
    .eq("upload_status", "uploading")
    .select("id")
    .maybeSingle();

  if (completeError || !completed) {
    logError("complete-model-upload", "DATABASE_COMPLETE_FAILED", uploadId);
    return errorResponse(request, "COMPLETE_FAILED", 500);
  }

  return jsonResponse(request, {
    uploadId,
    uploadStatus: "uploaded"
  });
});

function readStoredSize(metadata: Record<string, unknown> | null | undefined) {
  const rawSize = metadata?.size ?? metadata?.contentLength;
  const size = typeof rawSize === "number" ? rawSize : Number(rawSize);

  return Number.isSafeInteger(size) && size > 0 ? size : null;
}

async function markFailed(supabase: ReturnType<typeof createAdminClient>, uploadId: string, code: string) {
  await supabase
    .from("model_uploads")
    .update({ upload_status: "failed", error_code: code })
    .eq("id", uploadId);
}

function logError(event: string, errorCode: string, uploadId?: string) {
  console.error(JSON.stringify({ event, errorCode, uploadId: uploadId ?? null }));
}
