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
    logError("remove-model-upload", "SERVER_CONFIGURATION_ERROR");
    return errorResponse(request, "REMOVE_FAILED", 500);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    supabase,
    "remove-model-upload"
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
    .select("id, extension, storage_bucket, storage_path, upload_status")
    .eq("id", uploadId)
    .single();

  if (lookupError || !upload) {
    logError("remove-model-upload", "UPLOAD_NOT_FOUND", uploadId);
    return errorResponse(request, "UPLOAD_NOT_FOUND", 404);
  }

  if (upload.upload_status === "removed") {
    return jsonResponse(request, {
      uploadId,
      uploadStatus: "removed"
    });
  }

  if (upload.storage_path !== null) {
    const expectedPath = buildStoragePath(upload.id, upload.extension);

    if (upload.storage_bucket !== UPLOAD_BUCKET || upload.storage_path !== expectedPath) {
      logError("remove-model-upload", "SERVER_STATE_INVALID", uploadId);
      return errorResponse(request, "REMOVE_FAILED", 409);
    }

    const pathParts = splitStoragePath(expectedPath);

    if (!pathParts) {
      return errorResponse(request, "REMOVE_FAILED", 409);
    }

    const { data: objects, error: listError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .list(pathParts.folder, {
        limit: 10,
        search: pathParts.fileName
      });

    if (listError) {
      await supabase
        .from("model_uploads")
        .update({ error_code: "REMOVE_FAILED" })
        .eq("id", uploadId);
      logError("remove-model-upload", "STORAGE_LOOKUP_FAILED", uploadId);
      return errorResponse(request, "REMOVE_FAILED", 500);
    }

    const objectExists = objects?.some(
      (object) => object.name === pathParts.fileName
    );

    if (objectExists) {
      const { error: removeError } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .remove([expectedPath]);

      if (removeError) {
        await supabase
          .from("model_uploads")
          .update({ error_code: "REMOVE_FAILED" })
          .eq("id", uploadId);
        logError("remove-model-upload", "STORAGE_REMOVE_FAILED", uploadId);
        return errorResponse(request, "REMOVE_FAILED", 500);
      }
    }
  }

  const { data: removed, error: updateError } = await supabase
    .from("model_uploads")
    .update({
      upload_status: "removed",
      error_code: null,
      removed_at: new Date().toISOString()
    })
    .eq("id", uploadId)
    .select("id")
    .maybeSingle();

  if (updateError || !removed) {
    logError("remove-model-upload", "DATABASE_REMOVE_FAILED", uploadId);
    return errorResponse(request, "REMOVE_FAILED", 500);
  }

  return jsonResponse(request, {
    uploadId,
    uploadStatus: "removed"
  });
});

function logError(event: string, errorCode: string, uploadId?: string) {
  console.error(JSON.stringify({ event, errorCode, uploadId: uploadId ?? null }));
}
