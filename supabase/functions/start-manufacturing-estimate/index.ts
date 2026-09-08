import { createAdminClient } from "../_shared/admin-client.ts";
import { UPLOAD_BUCKET } from "../_shared/constants.ts";
import {
  errorResponse,
  handlePreflight,
  isOriginAllowed,
  jsonResponse
} from "../_shared/cors.ts";
import {
  createManufacturingCacheKey,
  MANUFACTURING_ENGINE,
  MANUFACTURING_ENGINE_VERSION,
  MANUFACTURING_PROFILE_KEY,
  parseManufacturingInput,
  resolveAuthoritativeManufacturingUnit,
  safeManufacturingError,
  SIGNED_MODEL_URL_TTL_SECONDS,
  exceedsEstimationBuildVolume
} from "../_shared/manufacturing-contract.ts";
import { requestSlice } from "../_shared/manufacturing-worker-client.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

Deno.serve(async (request: Request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;
  if (!isOriginAllowed(request)) return errorResponse(request, "ORIGIN_NOT_ALLOWED", 403);
  if (request.method !== "POST") return errorResponse(request, "METHOD_NOT_ALLOWED", 405);

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return errorResponse(request, "MANUFACTURING_ESTIMATION_FAILED", 500);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    supabase,
    "start-manufacturing-estimate"
  );
  if (rateLimitResponse) return rateLimitResponse;

  let input;
  try {
    input = parseManufacturingInput(await request.json());
  } catch {
    return errorResponse(request, "INVALID_MANUFACTURING_INPUT", 400);
  }

  const [
    { data: upload, error: uploadError },
    { data: profile, error: profileError },
    { data: analysis, error: analysisError }
  ] = await Promise.all([
    supabase
      .from("model_uploads")
      .select("id, extension, storage_bucket, storage_path, upload_status, uploaded_at")
      .eq("id", input.uploadId)
      .maybeSingle(),
    supabase
      .from("manufacturing_profiles")
      .select("id, profile_key, version, slicer_engine, slicer_version, profile_fingerprint")
      .eq("profile_key", input.profileKey)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("model_analyses")
      .select("analysis_status, result")
      .eq("model_upload_id", input.uploadId)
      .maybeSingle()
  ]);

  if (uploadError || !upload) return errorResponse(request, "UPLOAD_NOT_FOUND", 404);
  if (
    upload.upload_status !== "uploaded"
    || upload.storage_bucket !== UPLOAD_BUCKET
    || typeof upload.storage_path !== "string"
  ) {
    return errorResponse(request, "UPLOAD_STATE_INVALID", 409);
  }
  const uploadedAt = Date.parse(upload.uploaded_at ?? "");
  if (!Number.isFinite(uploadedAt) || Date.now() - uploadedAt > 7 * 24 * 60 * 60 * 1000) {
    return errorResponse(request, "UPLOAD_EXPIRED", 410);
  }
  if (
    profileError
    || !profile
    || profile.profile_key !== MANUFACTURING_PROFILE_KEY
    || profile.slicer_engine !== MANUFACTURING_ENGINE
    || profile.slicer_version !== MANUFACTURING_ENGINE_VERSION
    || typeof profile.profile_fingerprint !== "string"
    || !/^[0-9a-f]{64}$/.test(profile.profile_fingerprint)
  ) {
    return errorResponse(request, "MANUFACTURING_PROFILE_UNAVAILABLE", 503);
  }
  if (analysisError) return errorResponse(request, "MANUFACTURING_ESTIMATION_FAILED", 500);

  let authoritativeUnit;
  try {
    authoritativeUnit = resolveAuthoritativeManufacturingUnit(analysis);
  } catch (error) {
    const code = safeManufacturingError((error as Error)?.message);
    return errorResponse(request, code, code === "MODEL_UNIT_REQUIRED" ? 409 : 400);
  }

  const cacheKey = await createManufacturingCacheKey({
    uploadId: input.uploadId,
    profileKey: profile.profile_key,
    profileVersion: profile.version,
    slicerVersion: profile.slicer_version,
    sourceUnit: authoritativeUnit.sourceUnit,
    unitScale: authoritativeUnit.unitScale
  });
  const { data: claimedRows, error: claimError } = await supabase.rpc(
    "claim_manufacturing_estimate",
    {
      p_model_upload_id: input.uploadId,
      p_manufacturing_profile_id: profile.id,
      p_profile_version: profile.version,
      p_slicer_version: profile.slicer_version,
      p_source_unit: authoritativeUnit.sourceUnit,
      p_unit_scale: authoritativeUnit.unitScale,
      p_cache_key: cacheKey
    }
  );
  const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
  if (claimError || !claimed?.estimate_id) {
    return errorResponse(request, "MANUFACTURING_ESTIMATION_FAILED", 500);
  }

  if (claimed.should_dispatch && exceedsEstimationBuildVolume(authoritativeUnit.dimensionsMm)) {
    await markFailed(supabase, claimed.estimate_id, "MODEL_OUTSIDE_BUILD_VOLUME");
    console.error(JSON.stringify({
      event: "manufacturing_estimate_failed",
      jobId: claimed.estimate_id,
      estimateId: claimed.estimate_id,
      uploadId: input.uploadId,
      engineVersion: profile.slicer_version,
      profileVersion: profile.version,
      durationMs: 0,
      exitCode: null,
      signal: null,
      errorCode: "MODEL_OUTSIDE_BUILD_VOLUME",
      orcaReturnCode: null,
      stdoutTail: "",
      stderrTail: "",
      outputTruncated: false
    }));
    return jsonResponse(request, {
      estimateId: claimed.estimate_id,
      estimateStatus: "failed",
      pollAfterMs: 1500
    }, 202);
  }

  if (claimed.should_dispatch) {
    const { data: signed, error: signedError } = await supabase.storage
      .from(UPLOAD_BUCKET)
      .createSignedUrl(upload.storage_path, SIGNED_MODEL_URL_TTL_SECONDS);
    if (signedError || !signed?.signedUrl) {
      await markFailed(supabase, claimed.estimate_id, "SLICER_DOWNLOAD_FAILED");
      return errorResponse(request, "MANUFACTURING_ESTIMATION_FAILED", 503);
    }

    EdgeRuntime.waitUntil(processEstimate({
      supabase,
      estimateId: claimed.estimate_id,
      uploadId: input.uploadId,
      profile,
      signedUrl: signed.signedUrl,
      extension: upload.extension,
      sourceUnit: authoritativeUnit.sourceUnit,
      unitScale: authoritativeUnit.unitScale
    }));
  }

  return jsonResponse(request, {
    estimateId: claimed.estimate_id,
    estimateStatus: claimed.estimate_status,
    pollAfterMs: 1500
  }, 202);
});

async function processEstimate({
  supabase,
  estimateId,
  uploadId,
  profile,
  signedUrl,
  extension,
  sourceUnit,
  unitScale
}: Record<string, any>) {
  const startedAt = Date.now();
  try {
    const result = await requestSlice({
      jobId: estimateId,
      uploadId,
      modelUrl: signedUrl,
      extension,
      sourceUnit,
      unitScale,
      profileKey: profile.profile_key,
      profileVersion: profile.version,
      expectedProfileFingerprint: profile.profile_fingerprint
    });

    if (result.profileFingerprint !== profile.profile_fingerprint) {
      throw new Error("SLICER_PROFILE_MISMATCH");
    }

    const { error } = await supabase
      .from("manufacturing_estimates")
      .update({
        estimate_status: "completed",
        weight_grams: result.weightGrams,
        print_time_seconds: result.printTimeSeconds,
        support_used: result.supportUsed,
        warnings: result.warnings,
        profile_fingerprint: result.profileFingerprint,
        result_source: result.resultSource,
        error_code: null,
        heartbeat_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        failed_at: null
      })
      .eq("id", estimateId)
      .eq("estimate_status", "processing");
    if (error) throw new Error("MANUFACTURING_SAVE_FAILED");
    console.log(JSON.stringify({
      event: "manufacturing_estimate_completed",
      jobId: estimateId,
      estimateId,
      uploadId,
      engineVersion: profile.slicer_version,
      profileVersion: profile.version,
      durationMs: Date.now() - startedAt,
      exitCode: 0,
      errorCode: null
    }));
  } catch (error) {
    const code = safeManufacturingError((error as Error)?.message);
    await markFailed(supabase, estimateId, code);
    console.error(JSON.stringify({
      event: "manufacturing_estimate_failed",
      jobId: estimateId,
      estimateId,
      uploadId,
      engineVersion: profile.slicer_version,
      profileVersion: profile.version,
      durationMs: Date.now() - startedAt,
      exitCode: null,
      errorCode: code
    }));
  }
}

async function markFailed(supabase: any, estimateId: string, code: string) {
  await supabase
    .from("manufacturing_estimates")
    .update({
      estimate_status: "failed",
      weight_grams: null,
      print_time_seconds: null,
      support_used: null,
      warnings: [],
      profile_fingerprint: null,
      result_source: null,
      error_code: safeManufacturingError(code),
      heartbeat_at: new Date().toISOString(),
      completed_at: null,
      failed_at: new Date().toISOString()
    })
    .eq("id", estimateId)
    .eq("estimate_status", "processing");
}
