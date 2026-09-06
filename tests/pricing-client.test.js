import { describe, expect, it, vi } from "vitest";
import { createPricingClient } from "../src/pricing/pricing-client.js";

const input = { weightGrams: 100, printTimeHours: 5, quantity: 1 };

function clientWithResponse(response) {
  const invoke = vi.fn().mockResolvedValue(response);
  return {
    invoke,
    pricing: createPricingClient({
      getClient: () => ({ functions: { invoke } })
    })
  };
}

describe("pricing client", () => {
  it("chama a Edge Function e normaliza a resposta pública", async () => {
    const test = clientWithResponse({
      data: {
        unitPrice: 102.81,
        totalPrice: 102.81,
        quantity: 1,
        currency: "BRL",
        protectedCost: 35.9835
      },
      error: null
    });

    await expect(test.pricing.estimatePrice(input)).resolves.toEqual({
      unitPrice: 102.81,
      totalPrice: 102.81,
      quantity: 1,
      currency: "BRL"
    });
    expect(test.invoke).toHaveBeenCalledWith("estimate-model-price", { body: input });
  });

  it("preserva códigos públicos conhecidos", async () => {
    const test = clientWithResponse({
      data: { error: { code: "RATE_LIMITED" } },
      error: null
    });

    await expect(test.pricing.estimatePrice(input)).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
  });

  it("lê erro estruturado do contexto da função", async () => {
    const test = clientWithResponse({
      data: null,
      error: {
        context: {
          json: vi.fn().mockResolvedValue({
            error: { code: "INVALID_PRICING_INPUT" }
          })
        }
      }
    });

    await expect(test.pricing.estimatePrice(input)).rejects.toMatchObject({
      code: "INVALID_PRICING_INPUT"
    });
  });

  it("normaliza resposta malformada e códigos desconhecidos", async () => {
    const malformed = clientWithResponse({ data: { unitPrice: "102.81" }, error: null });
    await expect(malformed.pricing.estimatePrice(input)).rejects.toMatchObject({
      code: "PRICE_ESTIMATION_FAILED"
    });

    const unknown = clientWithResponse({
      data: { error: { code: "INTERNAL_DATABASE_DETAIL" } },
      error: null
    });
    await expect(unknown.pricing.estimatePrice(input)).rejects.toMatchObject({
      code: "PRICE_ESTIMATION_FAILED"
    });
  });
});
