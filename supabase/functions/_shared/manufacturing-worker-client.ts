import {
  MANUFACTURING_ENGINE,
  MANUFACTURING_ENGINE_VERSION,
  MANUFACTURING_RESULT_LIMITS,
  safeManufacturingError
} from "./manufacturing-contract.ts";

export async function requestSlice(input: {
  jobId: string;
  uploadId: string;
  modelUrl: string;
  extension: string;
  sourceUnit: string;
  unitScale: number;
  profileKey: string;
  profileVersion: number;
  expectedProfileFingerprint: string;
}) {
  const workerUrl = readWorkerUrl();
  const secret = Deno.env.get("MANUFACTURING_WORKER_HMAC_SECRET");
  if (!secret || secret.length < 32) throw new Error("MANUFACTURING_WORKER_UNAVAILABLE");

  const body = JSON.stringify(input);
  const timestamp = String(Date.now());
  const signature = await signPayload(secret, timestamp, body);
  const timeoutMs = readTimeout();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(new URL("/v1/slice", workerUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Insight-Timestamp": timestamp,
        "X-Insight-Signature": signature
      },
      body,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("SLICER_TIMEOUT");
    throw new Error("MANUFACTURING_WORKER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }

  const responseBody = await response.text();
  if (responseBody.length > 16_384) throw new Error("MANUFACTURING_WORKER_UNAVAILABLE");
  const responseTimestamp = response.headers.get("X-Insight-Timestamp");
  const responseSignature = response.headers.get("X-Insight-Signature");
  if (
    !responseTimestamp
    || !responseSignature
    || Math.abs(Date.now() - Number(responseTimestamp)) > 300_000
    || !await verifyPayload(secret, responseTimestamp, responseBody, responseSignature)
  ) {
    throw new Error("MANUFACTURING_WORKER_UNAVAILABLE");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(responseBody);
  } catch {
    throw new Error("MANUFACTURING_WORKER_UNAVAILABLE");
  }

  if (!response.ok) throw new Error(safeManufacturingError((payload.error as Record<string, unknown>)?.code));
  assertWorkerResult(payload, input);
  return payload as {
    jobId: string;
    status: "completed";
    weightGrams: number;
    printTimeSeconds: number;
    supportUsed: boolean | null;
    warnings: string[];
    resultSource: string;
    slicerEngine: string;
    slicerVersion: string;
    profileKey: string;
    profileFingerprint: string;
  };
}

export async function signPayload(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  );
  return toHex(new Uint8Array(signature));
}

async function verifyPayload(secret: string, timestamp: string, body: string, signature: string) {
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = await signPayload(secret, timestamp, body);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

function assertWorkerResult(payload: Record<string, unknown>, input: { jobId: string; profileKey: string }) {
  if (
    payload.jobId !== input.jobId
    || payload.status !== "completed"
    || payload.slicerEngine !== MANUFACTURING_ENGINE
    || payload.slicerVersion !== MANUFACTURING_ENGINE_VERSION
    || payload.profileKey !== input.profileKey
    || typeof payload.profileFingerprint !== "string"
    || !/^[0-9a-f]{64}$/.test(payload.profileFingerprint)
    || typeof payload.weightGrams !== "number"
    || !Number.isFinite(payload.weightGrams)
    || payload.weightGrams <= 0
    || payload.weightGrams > MANUFACTURING_RESULT_LIMITS.maxWeightGrams
    || !Number.isSafeInteger(payload.printTimeSeconds)
    || payload.printTimeSeconds <= 0
    || payload.printTimeSeconds > MANUFACTURING_RESULT_LIMITS.maxPrintTimeSeconds
    || !(payload.supportUsed === null || typeof payload.supportUsed === "boolean")
    || !Array.isArray(payload.warnings)
    || payload.warnings.some((warning) => typeof warning !== "string" || warning.length > 200)
    || !["slice_info.config", "gcode-comments"].includes(String(payload.resultSource))
  ) {
    throw new Error("SLICER_OUTPUT_OUT_OF_RANGE");
  }
}

function readWorkerUrl() {
  const value = Deno.env.get("MANUFACTURING_WORKER_URL");
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("MANUFACTURING_WORKER_UNAVAILABLE");
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("MANUFACTURING_WORKER_UNAVAILABLE");
  }
  return url;
}

function readTimeout() {
  const value = Number(Deno.env.get("MANUFACTURING_WORKER_TIMEOUT_MS") ?? "120000");
  return Number.isSafeInteger(value) && value >= 10_000 && value <= 120_000 ? value : 120_000;
}

function toHex(value: Uint8Array) {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
