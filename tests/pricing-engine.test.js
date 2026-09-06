import { describe, expect, it } from "vitest";
import {
  PRICING_INPUT_LIMITS,
  calculatePriceEstimate,
  parsePriceEstimateInput,
  toPublicPriceEstimate
} from "../supabase/functions/_shared/pricing-engine.ts";

const profile = Object.freeze({
  filamentPricePerKg: 90,
  electricityPricePerKwh: 0.9,
  printerAverageConsumptionKw: 0.06,
  printerPurchasePrice: 3000,
  printerLifetimeHours: 5000,
  additionalWearPerHour: 0,
  maintenancePerHour: 0.4,
  effectiveLaborPerHour: 4,
  targetMarginRate: 0.65,
  lossReserveRate: 0.05,
  paymentFeeRate: 0,
  packagingPerPiece: 0,
  finishingPerPiece: 0
});

describe("pricing engine", () => {
  it("reproduz 100 g / 5 h / 1 peça da planilha", () => {
    const result = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 1 },
      profile
    );

    expect(result.materialCost).toBeCloseTo(9, 10);
    expect(result.operationalCost).toBeCloseTo(25.27, 10);
    expect(result.baseCost).toBeCloseTo(34.27, 10);
    expect(result.riskReserve).toBeCloseTo(1.7135, 10);
    expect(result.protectedCost).toBeCloseTo(35.9835, 10);
    expect(result.unitPrice).toBe(102.81);
    expect(result.totalPrice).toBe(102.81);
  });

  it.each([
    [1, 50, 28.66],
    [2, 50, 43.82],
    [3, 100, 72.49],
    [5, 100, 102.81],
    [10, 250, 219.12],
    [20, 500, 438.24]
  ])("reproduz %s h + %s g como R$ %s", (hours, grams, expected) => {
    const result = calculatePriceEstimate(
      { weightGrams: grams, printTimeHours: hours, quantity: 1 },
      profile
    );
    expect(result.unitPrice).toBe(expected);
  });

  it("reproduz os indicadores da seção Referência rápida", () => {
    const oneHourFiftyGrams = calculatePriceEstimate(
      { weightGrams: 50, printTimeHours: 1, quantity: 1 },
      profile
    );
    const fiveHoursHundredGrams = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 1 },
      profile
    );
    const marginDivisor = 1 - profile.targetMarginRate;
    const fixedCostPerHour = oneHourFiftyGrams.operationalCost;
    const filamentCostPerGram = oneHourFiftyGrams.materialCost / 50;

    expect(fixedCostPerHour / marginDivisor).toBeCloseTo(14.44, 2);
    expect(filamentCostPerGram / marginDivisor).toBeCloseTo(0.2571428571, 8);
    expect(oneHourFiftyGrams.baseCost / marginDivisor).toBeCloseTo(27.2971428571, 8);
    expect(fiveHoursHundredGrams.baseCost / marginDivisor).toBeCloseTo(97.9142857143, 8);
  });

  it("mantém preço unitário e multiplica somente o total pela quantidade", () => {
    const one = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 1 },
      profile
    );
    const four = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 4 },
      profile
    );

    expect(four.unitPrice).toBe(one.unitPrice);
    expect(four.totalPrice).toBe(one.unitPrice * 4);
  });

  it("aplica embalagem e acabamento uma vez por peça", () => {
    const result = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 3 },
      { ...profile, packagingPerPiece: 2, finishingPerPiece: 1 }
    );

    expect(result.packagingCost).toBe(2);
    expect(result.finishingCost).toBe(1);
    expect(result.baseCost).toBeCloseTo(37.27, 10);
    expect(result.unitPrice).toBe(111.81);
    expect(result.totalPrice).toBe(335.43);
  });

  it("implementa margem como divisor e não como markup", () => {
    const result = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 1 },
      profile
    );

    expect(result.priceBeforePaymentFee).toBeCloseTo(
      result.protectedCost / (1 - profile.targetMarginRate),
      12
    );
    expect(result.priceBeforePaymentFee).not.toBeCloseTo(
      result.protectedCost * (1 + profile.targetMarginRate),
      2
    );
  });

  it("recupera a taxa de pagamento e calcula lucro sobre receita líquida", () => {
    const result = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 1 },
      { ...profile, paymentFeeRate: 0.05 }
    );

    expect(result.grossUnitPrice).toBeCloseTo(
      result.priceBeforePaymentFee / 0.95,
      12
    );
    expect(result.netRevenue).toBeCloseTo(result.grossUnitPrice - result.paymentFee, 12);
    expect(result.estimatedProfit).toBeCloseTo(result.netRevenue - result.protectedCost, 12);
  });

  it.each([
    [{ weightGrams: 0, printTimeHours: 1, quantity: 1 }],
    [{ weightGrams: -1, printTimeHours: 1, quantity: 1 }],
    [{ weightGrams: 1, printTimeHours: 0, quantity: 1 }],
    [{ weightGrams: 1, printTimeHours: -1, quantity: 1 }],
    [{ weightGrams: 1, printTimeHours: 1, quantity: 0 }],
    [{ weightGrams: 1, printTimeHours: 1, quantity: 1.5 }],
    [{ weightGrams: Number.NaN, printTimeHours: 1, quantity: 1 }],
    [{ weightGrams: Number.POSITIVE_INFINITY, printTimeHours: 1, quantity: 1 }],
    [{ weightGrams: 1, printTimeHours: Number.POSITIVE_INFINITY, quantity: 1 }],
    [{ weightGrams: "1", printTimeHours: 1, quantity: 1 }],
    [{ weightGrams: 1, printTimeHours: 1, quantity: 1, extra: true }],
    [null],
    [[]]
  ])("rejeita entrada inválida %#", (input) => {
    expect(() => parsePriceEstimateInput(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_PRICING_INPUT" })
    );
  });

  it("rejeita entradas acima dos limites antiabuso", () => {
    expect(() => parsePriceEstimateInput({
      weightGrams: PRICING_INPUT_LIMITS.maxWeightGrams + 1,
      printTimeHours: 1,
      quantity: 1
    })).toThrow();
    expect(() => parsePriceEstimateInput({
      weightGrams: 1,
      printTimeHours: PRICING_INPUT_LIMITS.maxPrintTimeHours + 1,
      quantity: 1
    })).toThrow();
    expect(() => parsePriceEstimateInput({
      weightGrams: 1,
      printTimeHours: 1,
      quantity: PRICING_INPUT_LIMITS.maxQuantity + 1
    })).toThrow();
  });

  it.each([
    [{ ...profile, targetMarginRate: 1 }],
    [{ ...profile, targetMarginRate: -0.01 }],
    [{ ...profile, lossReserveRate: 1 }],
    [{ ...profile, paymentFeeRate: 1 }],
    [{ ...profile, printerLifetimeHours: 0 }],
    [{ ...profile, filamentPricePerKg: -1 }],
    [{ ...profile, maintenancePerHour: Number.NaN }]
  ])("rejeita perfil inválido %#", (invalidProfile) => {
    expect(() => calculatePriceEstimate(
      { weightGrams: 10, printTimeHours: 1, quantity: 1 },
      invalidProfile
    )).toThrowError(expect.objectContaining({ code: "INVALID_PRICING_PROFILE" }));
  });

  it("expõe apenas o contrato público e valores em centavos", () => {
    const internal = calculatePriceEstimate(
      { weightGrams: 100, printTimeHours: 5, quantity: 2 },
      profile
    );
    const publicResult = toPublicPriceEstimate(internal);

    expect(publicResult).toEqual({
      unitPrice: 102.81,
      totalPrice: 205.62,
      quantity: 2,
      currency: "BRL"
    });
    expect(Object.keys(publicResult).sort()).toEqual([
      "currency",
      "quantity",
      "totalPrice",
      "unitPrice"
    ]);
    expect(JSON.stringify(publicResult)).not.toMatch(
      /targetMarginRate|laborCost|printerPurchasePrice|estimatedProfit|protectedCost/
    );
    expect(Number.isInteger(publicResult.unitPrice * 100)).toBe(true);
    expect(Number.isInteger(publicResult.totalPrice * 100)).toBe(true);
  });
});
