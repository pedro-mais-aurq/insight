import { createAdminClient } from "../_shared/admin-client.ts";
import {
  errorResponse,
  handlePreflight,
  isOriginAllowed,
  jsonResponse
} from "../_shared/cors.ts";
import { isValidEstimateId, safeManufacturingError } from "../_shared/manufacturing-contract.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

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
    "get-manufacturing-estimate"
  );
  if (rateLimitResponse) return rateLimitResponse;

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, "INVALID_REQUEST", 400);
  }
  if (!isValidEstimateId(payload.estimateId)) {
    return errorResponse(request, "INVALID_ESTIMATE_ID", 400);
  }

  const { data: estimate, error } = await supabase
    .from("manufacturing_estimates")
    .select(`
      id,
      estimate_status,
      weight_grams,
      print_time_seconds,
      support_used,
      warnings,
      error_code,
      manufacturing_profiles!inner (
        label,
        printer_model,
        nozzle_diameter_mm,
        material_label,
        layer_height_mm,
        orientation_policy,
        slicer_engine,
        slicer_version
      )
    `)
    .eq("id", payload.estimateId)
    .maybeSingle();
  if (error || !estimate) return errorResponse(request, "ESTIMATE_NOT_FOUND", 404);

  const profile = Array.isArray(estimate.manufacturing_profiles)
    ? estimate.manufacturing_profiles[0]
    : estimate.manufacturing_profiles;
  const response: Record<string, unknown> = {
    estimateId: estimate.id,
    estimateStatus: estimate.estimate_status,
    profile: {
      label: profile.label,
      printerModel: profile.printer_model,
      nozzleDiameterMm: Number(profile.nozzle_diameter_mm),
      material: profile.material_label,
      layerHeightMm: Number(profile.layer_height_mm),
      slicerEngine: profile.slicer_engine,
      slicerVersion: profile.slicer_version
    }
  };

  if (estimate.estimate_status === "completed") {
    response.weightGrams = Number(estimate.weight_grams);
    response.printTimeSeconds = Number(estimate.print_time_seconds);
    response.printTimeHours = Number(estimate.print_time_seconds) / 3600;
    response.supportUsed = estimate.support_used;
    response.warnings = Array.isArray(estimate.warnings) ? estimate.warnings : [];
    response.assumptions = {
      printer: profile.printer_model,
      nozzleDiameterMm: Number(profile.nozzle_diameter_mm),
      material: profile.material_label,
      layerHeightMm: Number(profile.layer_height_mm),
      orientation: profile.orientation_policy === "preserve" ? "preserved" : profile.orientation_policy
    };
  }
  if (estimate.estimate_status === "failed") {
    response.errorCode = safeManufacturingError(estimate.error_code);
  }

  return jsonResponse(request, response);
});
