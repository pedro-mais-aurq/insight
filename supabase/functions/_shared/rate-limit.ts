import type { createAdminClient } from "./admin-client.ts";
import { errorResponse } from "./cors.ts";
import { extractClientIp, hashClientIp } from "./request-identity.ts";
import {
  RATE_LIMIT_POLICIES,
  type RateLimitScope
} from "./rate-limit-policy.ts";

export async function consumeRateLimit(
  request: Request,
  supabase: ReturnType<typeof createAdminClient>,
  scope: RateLimitScope
) {
  const policy = RATE_LIMIT_POLICIES[scope];
  const salt = Deno.env.get("INSIGHT_RATE_LIMIT_SALT");
  const clientIp = extractClientIp(request.headers);

  if (!policy || !salt || !clientIp) {
    return failure("RATE_LIMIT_UNAVAILABLE", 503);
  }

  let keyHash: string;

  try {
    keyHash = await hashClientIp(clientIp, salt);
  } catch {
    return failure("RATE_LIMIT_UNAVAILABLE", 503);
  }

  const { data, error } = await supabase.rpc("consume_insight_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds
  });

  const result = Array.isArray(data) ? data[0] : data;

  if (error || typeof result?.allowed !== "boolean") {
    return failure("RATE_LIMIT_UNAVAILABLE", 503);
  }

  if (!result.allowed) {
    return {
      allowed: false,
      code: "RATE_LIMITED",
      status: 429,
      retryAfter: Math.max(Number(result.retry_after_seconds) || 1, 1)
    };
  }

  return { allowed: true, code: null, status: 200, retryAfter: 0 };
}

export async function enforceRateLimit(
  request: Request,
  supabase: ReturnType<typeof createAdminClient>,
  scope: RateLimitScope
) {
  const result = await consumeRateLimit(request, supabase, scope);

  if (result.allowed) {
    return null;
  }

  const headers = result.retryAfter > 0
    ? { "Retry-After": String(result.retryAfter) }
    : {};

  return errorResponse(request, result.code, result.status, headers);
}

function failure(code: string, status: number) {
  return { allowed: false, code, status, retryAfter: 0 };
}
