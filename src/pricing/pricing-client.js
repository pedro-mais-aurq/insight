import { APP_CLIENT } from "../config/client.config.js";
import { getSupabaseClient } from "../lib/supabase.js";
import {
  PRICING_ERROR_CODES,
  PricingClientError
} from "./pricing-errors.js";

const KNOWN_CODES = new Set(Object.values(PRICING_ERROR_CODES));

export function createPricingClient({ getClient = getSupabaseClient } = {}) {
  if (typeof getClient !== "function") {
    throw new TypeError("getClient deve ser uma função.");
  }

  async function estimatePrice(input) {
    let response;

    try {
      response = await getClient().functions.invoke("estimate-model-price", {
        body: { ...input, clientSlug: APP_CLIENT.slug }
      });
    } catch (error) {
      throw new PricingClientError(PRICING_ERROR_CODES.PRICE_ESTIMATION_FAILED, {
        cause: error
      });
    }

    if (response.error) {
      throw await toFunctionError(response.error);
    }
    if (response.data?.error?.code) {
      throw new PricingClientError(normalizeCode(response.data.error.code));
    }

    return normalizeEstimate(response.data);
  }

  return Object.freeze({ estimatePrice });
}

export function estimatePrice(input) {
  return createPricingClient().estimatePrice(input);
}

function normalizeEstimate(value) {
  const valid = value
    && typeof value.unitPrice === "number"
    && Number.isFinite(value.unitPrice)
    && value.unitPrice >= 0
    && typeof value.totalPrice === "number"
    && Number.isFinite(value.totalPrice)
    && value.totalPrice >= 0
    && Number.isInteger(value.quantity)
    && value.quantity >= 1
    && value.currency === "BRL";

  if (!valid) {
    throw new PricingClientError(PRICING_ERROR_CODES.PRICE_ESTIMATION_FAILED);
  }

  return Object.freeze({
    unitPrice: value.unitPrice,
    totalPrice: value.totalPrice,
    quantity: value.quantity,
    currency: value.currency
  });
}

async function toFunctionError(error) {
  try {
    const body = await error.context?.json();
    if (typeof body?.error?.code === "string") {
      return new PricingClientError(normalizeCode(body.error.code), {
        cause: error
      });
    }
  } catch {
    // Infraestrutura pode responder sem JSON estruturado.
  }

  return new PricingClientError(PRICING_ERROR_CODES.PRICE_ESTIMATION_FAILED, {
    cause: error
  });
}

function normalizeCode(code) {
  return KNOWN_CODES.has(code)
    ? code
    : PRICING_ERROR_CODES.PRICE_ESTIMATION_FAILED;
}
