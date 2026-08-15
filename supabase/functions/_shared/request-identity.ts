export function extractClientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for") ?? "";

  for (const candidate of forwarded.split(",")) {
    const normalized = normalizeIp(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return normalizeIp(headers.get("x-real-ip"));
}

export async function hashClientIp(clientIp: string, salt: string) {
  if (!isValidIp(clientIp) || typeof salt !== "string" || salt.length < 16) {
    throw new Error("RATE_LIMIT_IDENTITY_INVALID");
  }

  const payload = new TextEncoder().encode(`${salt}${clientIp}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isValidIp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const candidate = value.trim();
  return isValidIpv4(candidate) || isValidIpv6(candidate);
}

function normalizeIp(value: unknown) {
  return isValidIp(value) ? value.trim().toLowerCase() : null;
}

function isValidIpv4(value: string) {
  const parts = value.split(".");

  return parts.length === 4 && parts.every((part) => (
    /^\d{1,3}$/.test(part)
    && Number(part) >= 0
    && Number(part) <= 255
  ));
}

function isValidIpv6(value: string) {
  if (
    value.length < 2
    || value.length > 45
    || !value.includes(":")
    || value.includes(":::")
    || (value.startsWith(":") && !value.startsWith("::"))
    || (value.endsWith(":") && !value.endsWith("::"))
    || !/^[0-9a-f:.]+$/i.test(value)
  ) {
    return false;
  }

  let normalized = value;
  const lastColon = value.lastIndexOf(":");
  const possibleIpv4 = value.slice(lastColon + 1);

  if (possibleIpv4.includes(".")) {
    if (!isValidIpv4(possibleIpv4)) {
      return false;
    }

    normalized = `${value.slice(0, lastColon)}:0:0`;
  }

  const compressionParts = normalized.split("::");

  if (compressionParts.length > 2) {
    return false;
  }

  const hextets = compressionParts
    .flatMap((part) => part.split(":").filter(Boolean));

  if (!hextets.every((part) => /^[0-9a-f]{1,4}$/i.test(part))) {
    return false;
  }

  return compressionParts.length === 2
    ? hextets.length < 8
    : hextets.length === 8;
}
