export const RATE_LIMIT_POLICIES = Object.freeze({
  "create-model-upload": Object.freeze({ limit: 10, windowSeconds: 600 }),
  "complete-model-upload": Object.freeze({ limit: 30, windowSeconds: 600 }),
  "remove-model-upload": Object.freeze({ limit: 30, windowSeconds: 600 }),
  "start-model-analysis": Object.freeze({ limit: 20, windowSeconds: 600 }),
  "save-model-analysis": Object.freeze({ limit: 20, windowSeconds: 600 })
});

export type RateLimitScope = keyof typeof RATE_LIMIT_POLICIES;

export function isRateLimitAllowed(requestCount: number, limit: number) {
  return Number.isSafeInteger(requestCount)
    && Number.isSafeInteger(limit)
    && requestCount <= limit;
}
