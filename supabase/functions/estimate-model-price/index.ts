import { createAdminClient } from "../_shared/admin-client.ts";
import {
  errorResponse,
  handlePreflight,
  isOriginAllowed,
  jsonResponse
} from "../_shared/cors.ts";
import {
  calculatePriceEstimate,
  parsePriceEstimateInput,
  toPublicPriceEstimate
} from "../_shared/pricing-engine.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const PROFILE_FIELDS = [
  "filament_price_per_kg",
  "electricity_price_per_kwh",
  "printer_average_consumption_kw",
  "printer_purchase_price",
  "printer_lifetime_hours",
  "additional_wear_per_hour",
  "maintenance_per_hour",
  "effective_labor_per_hour",
  "target_margin_rate",
  "loss_reserve_rate",
  "payment_fee_rate",
  "packaging_per_piece",
  "finishing_per_piece"
].join(", ");

Deno.serve(async (request: Request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

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
    return errorResponse(request, "PRICE_ESTIMATION_FAILED", 500);
  }

  const rateLimitResponse = await enforceRateLimit(
    request,
    supabase,
    "estimate-model-price"
  );
  if (rateLimitResponse) return rateLimitResponse;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(request, "INVALID_PRICING_INPUT", 400);
  }

  let input;
  try {
    input = parsePriceEstimateInput(payload);
  } catch {
    return errorResponse(request, "INVALID_PRICING_INPUT", 400);
  }

  const { data: row, error } = await supabase
    .from("pricing_profiles")
    .select(PROFILE_FIELDS)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !row) {
    return errorResponse(request, "PRICING_PROFILE_UNAVAILABLE", 503);
  }

  try {
    const estimate = calculatePriceEstimate(input, {
      filamentPricePerKg: Number(row.filament_price_per_kg),
      electricityPricePerKwh: Number(row.electricity_price_per_kwh),
      printerAverageConsumptionKw: Number(row.printer_average_consumption_kw),
      printerPurchasePrice: Number(row.printer_purchase_price),
      printerLifetimeHours: Number(row.printer_lifetime_hours),
      additionalWearPerHour: Number(row.additional_wear_per_hour),
      maintenancePerHour: Number(row.maintenance_per_hour),
      effectiveLaborPerHour: Number(row.effective_labor_per_hour),
      targetMarginRate: Number(row.target_margin_rate),
      lossReserveRate: Number(row.loss_reserve_rate),
      paymentFeeRate: Number(row.payment_fee_rate),
      packagingPerPiece: Number(row.packaging_per_piece),
      finishingPerPiece: Number(row.finishing_per_piece)
    });

    return jsonResponse(request, toPublicPriceEstimate(estimate));
  } catch {
    return errorResponse(request, "PRICING_PROFILE_UNAVAILABLE", 503);
  }
});
