import { createAdminClient } from "../_shared/admin-client.ts";
import { validateAnalysisSavePayload } from "../_shared/analysis-result.ts";
import {
  errorResponse,
  handlePreflight,
  isOriginAllowed,
  jsonResponse
} from "../_shared/cors.ts";
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
    return errorResponse(request, "ANALYSIS_SAVE_FAILED", 500);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    supabase,
    "save-model-analysis"
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

  const validation = validateAnalysisSavePayload(payload);

  if (!validation.valid) {
    return errorResponse(request, validation.error.code, 400);
  }

  const input = validation.value;
  const { data: upload, error: uploadError } = await supabase
    .from("model_uploads")
    .select("id, upload_status")
    .eq("id", input.uploadId)
    .single();

  if (uploadError || !upload) {
    return errorResponse(request, "UPLOAD_NOT_FOUND", 404);
  }

  if (upload.upload_status !== "uploaded") {
    return errorResponse(request, "UPLOAD_STATE_INVALID", 409);
  }

  const update = input.status === "completed"
    ? {
      analysis_status: "completed",
      result: input.result,
      error_code: null
    }
    : {
      analysis_status: "failed",
      result: null,
      error_code: input.errorCode
    };
  const { data: analysis, error: analysisError } = await supabase
    .from("model_analyses")
    .update(update)
    .eq("model_upload_id", input.uploadId)
    .in("analysis_status", ["processing", "completed", "failed"])
    .select("id")
    .maybeSingle();

  if (analysisError || !analysis) {
    return errorResponse(request, "ANALYSIS_SAVE_FAILED", 500);
  }

  return jsonResponse(request, {
    uploadId: input.uploadId,
    analysisStatus: input.status
  });
});
