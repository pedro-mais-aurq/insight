import { createHmac, timingSafeEqual } from "node:crypto";

export function signPayload(secret, timestamp, body) {
  assertSecret(secret);
  return createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
}

export function verifyPayload(secret, timestamp, body, signature) {
  if (!/^[0-9]{10,16}$/.test(String(timestamp)) || !/^[0-9a-f]{64}$/.test(signature ?? "")) {
    return false;
  }

  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function assertSecret(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("WORKER_HMAC_SECRET_INVALID");
  }
}

export class ReplayGuard {
  constructor({ maxSkewMs = 300_000, now = Date.now } = {}) {
    this.maxSkewMs = maxSkewMs;
    this.now = now;
    this.seen = new Map();
  }

  accept(timestamp, signature) {
    const requestTime = Number(timestamp);
    const currentTime = this.now();
    if (!Number.isSafeInteger(requestTime) || Math.abs(currentTime - requestTime) > this.maxSkewMs) {
      return false;
    }

    this.prune(currentTime);
    if (this.seen.has(signature)) return false;
    this.seen.set(signature, currentTime + this.maxSkewMs);
    return true;
  }

  prune(now) {
    for (const [signature, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(signature);
    }
  }
}
