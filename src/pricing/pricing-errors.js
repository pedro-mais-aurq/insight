export const PRICING_ERROR_CODES = Object.freeze({
  INVALID_PRICING_INPUT: "INVALID_PRICING_INPUT",
  PRICING_PROFILE_UNAVAILABLE: "PRICING_PROFILE_UNAVAILABLE",
  PRICE_ESTIMATION_FAILED: "PRICE_ESTIMATION_FAILED",
  RATE_LIMITED: "RATE_LIMITED"
});

export class PricingClientError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = "PricingClientError";
    this.code = code;
  }
}
