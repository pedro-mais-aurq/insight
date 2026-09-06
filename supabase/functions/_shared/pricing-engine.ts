export const PRICING_ENGINE_VERSION = "1.0.0";
export const PRICING_CURRENCY = "BRL";

export const PRICING_INPUT_LIMITS = Object.freeze({
  maxWeightGrams: 100_000,
  maxPrintTimeHours: 10_000,
  maxQuantity: 1_000
});

export type PricingProfile = {
  filamentPricePerKg: number;
  electricityPricePerKwh: number;
  printerAverageConsumptionKw: number;
  printerPurchasePrice: number;
  printerLifetimeHours: number;
  additionalWearPerHour: number;
  maintenancePerHour: number;
  effectiveLaborPerHour: number;
  targetMarginRate: number;
  lossReserveRate: number;
  paymentFeeRate: number;
  packagingPerPiece: number;
  finishingPerPiece: number;
};

export type PriceEstimateInput = {
  weightGrams: number;
  printTimeHours: number;
  quantity: number;
};

export class PricingValidationError extends Error {
  code: "INVALID_PRICING_INPUT" | "INVALID_PRICING_PROFILE";

  constructor(
    code: "INVALID_PRICING_INPUT" | "INVALID_PRICING_PROFILE",
    detail: string
  ) {
    super(detail);
    this.name = "PricingValidationError";
    this.code = code;
  }
}

export function parsePriceEstimateInput(value: unknown): PriceEstimateInput {
  if (!isRecord(value)) {
    throw invalidInput("payload");
  }

  const allowedKeys = new Set(["weightGrams", "printTimeHours", "quantity"]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw invalidInput("unexpected_field");
  }

  const weightGrams = positiveFinite(value.weightGrams, "weightGrams");
  const printTimeHours = positiveFinite(value.printTimeHours, "printTimeHours");
  const quantity = positiveFinite(value.quantity, "quantity");

  if (weightGrams > PRICING_INPUT_LIMITS.maxWeightGrams) {
    throw invalidInput("weightGrams_max");
  }
  if (printTimeHours > PRICING_INPUT_LIMITS.maxPrintTimeHours) {
    throw invalidInput("printTimeHours_max");
  }
  if (!Number.isInteger(quantity) || quantity > PRICING_INPUT_LIMITS.maxQuantity) {
    throw invalidInput("quantity_integer_or_max");
  }

  return { weightGrams, printTimeHours, quantity };
}

export function calculatePriceEstimate(
  inputValue: PriceEstimateInput,
  profileValue: PricingProfile
) {
  const input = parsePriceEstimateInput(inputValue);
  const profile = parsePricingProfile(profileValue);

  const materialCost = input.weightGrams * (profile.filamentPricePerKg / 1_000);
  const electricityCost = input.printTimeHours
    * profile.electricityPricePerKwh
    * profile.printerAverageConsumptionKw;
  const depreciationCost = input.printTimeHours
    * (profile.printerPurchasePrice / profile.printerLifetimeHours);
  const additionalWearCost = input.printTimeHours * profile.additionalWearPerHour;
  const maintenanceCost = input.printTimeHours * profile.maintenancePerHour;
  const laborCost = input.printTimeHours * profile.effectiveLaborPerHour;
  const packagingCost = profile.packagingPerPiece;
  const finishingCost = profile.finishingPerPiece;

  const operationalCost = electricityCost
    + depreciationCost
    + additionalWearCost
    + maintenanceCost
    + laborCost;
  const baseCost = materialCost
    + operationalCost
    + packagingCost
    + finishingCost;
  const riskReserve = baseCost * profile.lossReserveRate;
  const protectedCost = baseCost + riskReserve;

  // Margem-alvo sobre receita, não markup sobre custo.
  const priceBeforePaymentFee = protectedCost / (1 - profile.targetMarginRate);
  const grossUnitPrice = priceBeforePaymentFee / (1 - profile.paymentFeeRate);
  const paymentFee = grossUnitPrice * profile.paymentFeeRate;
  const netRevenue = grossUnitPrice - paymentFee;
  const estimatedProfit = netRevenue - protectedCost;

  // Somente os valores comerciais finais são arredondados a centavos.
  const unitPrice = roundCurrency(grossUnitPrice);
  const totalPrice = roundCurrency(unitPrice * input.quantity);

  return {
    engineVersion: PRICING_ENGINE_VERSION,
    input,
    materialCost,
    electricityCost,
    depreciationCost,
    additionalWearCost,
    maintenanceCost,
    laborCost,
    packagingCost,
    finishingCost,
    operationalCost,
    baseCost,
    riskReserve,
    protectedCost,
    priceBeforePaymentFee,
    grossUnitPrice,
    paymentFee,
    netRevenue,
    estimatedProfit,
    unitPrice,
    totalPrice
  };
}

export function toPublicPriceEstimate(
  estimate: ReturnType<typeof calculatePriceEstimate>
) {
  return {
    unitPrice: estimate.unitPrice,
    totalPrice: estimate.totalPrice,
    quantity: estimate.input.quantity,
    currency: PRICING_CURRENCY
  } as const;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parsePricingProfile(value: unknown): PricingProfile {
  if (!isRecord(value)) {
    throw invalidProfile("profile");
  }

  const profile = {
    filamentPricePerKg: nonNegativeFinite(value.filamentPricePerKg, "filamentPricePerKg"),
    electricityPricePerKwh: nonNegativeFinite(value.electricityPricePerKwh, "electricityPricePerKwh"),
    printerAverageConsumptionKw: nonNegativeFinite(value.printerAverageConsumptionKw, "printerAverageConsumptionKw"),
    printerPurchasePrice: nonNegativeFinite(value.printerPurchasePrice, "printerPurchasePrice"),
    printerLifetimeHours: positiveProfileFinite(value.printerLifetimeHours, "printerLifetimeHours"),
    additionalWearPerHour: nonNegativeFinite(value.additionalWearPerHour, "additionalWearPerHour"),
    maintenancePerHour: nonNegativeFinite(value.maintenancePerHour, "maintenancePerHour"),
    effectiveLaborPerHour: nonNegativeFinite(value.effectiveLaborPerHour, "effectiveLaborPerHour"),
    targetMarginRate: rate(value.targetMarginRate, "targetMarginRate"),
    lossReserveRate: rate(value.lossReserveRate, "lossReserveRate"),
    paymentFeeRate: rate(value.paymentFeeRate, "paymentFeeRate"),
    packagingPerPiece: nonNegativeFinite(value.packagingPerPiece, "packagingPerPiece"),
    finishingPerPiece: nonNegativeFinite(value.finishingPerPiece, "finishingPerPiece")
  };

  return profile;
}

function positiveFinite(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw invalidInput(field);
  }
  return value;
}

function nonNegativeFinite(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw invalidProfile(field);
  }
  return value;
}

function positiveProfileFinite(value: unknown, field: string) {
  const parsed = nonNegativeFinite(value, field);
  if (parsed === 0) throw invalidProfile(field);
  return parsed;
}

function rate(value: unknown, field: string) {
  const parsed = nonNegativeFinite(value, field);
  if (parsed >= 1) throw invalidProfile(field);
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInput(detail: string) {
  return new PricingValidationError("INVALID_PRICING_INPUT", detail);
}

function invalidProfile(detail: string) {
  return new PricingValidationError("INVALID_PRICING_PROFILE", detail);
}
