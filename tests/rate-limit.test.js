import { describe, expect, it } from "vitest";
import {
  RATE_LIMIT_POLICIES,
  isRateLimitAllowed
} from "../supabase/functions/_shared/rate-limit-policy.ts";

describe("rate limit", () => {
  it("mantém os limites oficiais por janela de dez minutos", () => {
    expect(RATE_LIMIT_POLICIES).toMatchObject({
      "create-model-upload": { limit: 10, windowSeconds: 600 },
      "complete-model-upload": { limit: 30, windowSeconds: 600 },
      "remove-model-upload": { limit: 30, windowSeconds: 600 },
      "start-model-analysis": { limit: 20, windowSeconds: 600 },
      "save-model-analysis": { limit: 20, windowSeconds: 600 }
    });
  });

  it.each([
    [10, 10, true],
    [11, 10, false],
    [30, 30, true],
    [31, 30, false]
  ])("contagem %s com limite %s resulta em %s", (count, limit, allowed) => {
    expect(isRateLimitAllowed(count, limit)).toBe(allowed);
  });
});
