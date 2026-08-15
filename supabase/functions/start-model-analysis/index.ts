import { createAdminClient } from "../_shared/admin-client.ts";
import {
  errorResponse,
  handlePreflight,
  isOriginAllowed,
  jsonResponse
} from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { isValidUploadId } from "../_shared/upload-metadata.ts";

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
    return errorResponse(request, "ANALYSIS_START_FAILED", 500);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    supabase,
    "start-model-analysis"
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

  if (!isValidUploadId(payload.uploadId)) {
    return errorResponse(request, "INVALID_UPLOAD_ID", 400);
  }

  const uploadId = payload.uploadId;
  const { data: upload, error: uploadError } = await supabase
    .from("model_uploads")
    .select("id, upload_status, uploaded_at")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload) {
    return errorResponse(request, "UPLOAD_NOT_FOUND", 404);
  }

  if (upload.upload_status !== "uploaded") {
    return errorResponse(request, "UPLOAD_STATE_INVALID", 409);
  }

  const uploadedAt = Date.parse(upload.uploaded_at ?? "");

  if (!Number.isFinite(uploadedAt) || Date.now() - uploadedAt > 7 * 24 * 60 * 60 * 1000) {
    return errorResponse(request, "UPLOAD_EXPIRED", 410);
  }

  const { data: analysis, error: analysisError } = await supabase
    .from("model_analyses")
    .upsert({
      model_upload_id: uploadId,
      analysis_status: "processing",
      result: null,
      error_code: null
    }, { onConflict: "model_upload_id" })
    .select("id")
    .single();

  if (analysisError || !analysis) {
    return errorResponse(request, "ANALYSIS_START_FAILED", 500);
  }

  return jsonResponse(request, {
    uploadId,
    analysisStatus: "processing"
  });
});
