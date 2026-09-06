export const MANUFACTURING_ENGINE = "OrcaSlicer";
export const MANUFACTURING_ENGINE_VERSION = "2.4.2";
export const MANUFACTURING_PROFILE_KEY = "insight-a1m-pla-020-v1";
export const SIGNED_MODEL_URL_TTL_SECONDS = 300;

const UNIT_SCALES = Object.freeze({
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4
});

export type SourceUnit = keyof typeof UNIT_SCALES;

export function parseManufacturingInput(value: unknown) {
  const input = value as Record<string, unknown> | null;
  const allowedKeys = new Set(["uploadId", "profileKey", "unit"]);
  const sourceUnit = input?.unit;
  const uploadId = input?.uploadId;
  const profileKey = input?.profileKey ?? MANUFACTURING_PROFILE_KEY;

  if (
    typeof uploadId !== "string"
    || !input
    || Object.keys(input).some((key) => !allowedKeys.has(key))
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)
    || typeof sourceUnit !== "string"
    || !Object.hasOwn(UNIT_SCALES, sourceUnit)
    || profileKey !== MANUFACTURING_PROFILE_KEY
  ) {
    throw new Error("INVALID_MANUFACTURING_INPUT");
  }

  return Object.freeze({
    uploadId,
    sourceUnit: sourceUnit as SourceUnit,
    unitScale: UNIT_SCALES[sourceUnit as SourceUnit],
    profileKey
  });
}

export async function createManufacturingCacheKey(input: {
  uploadId: string;
  profileKey: string;
  profileVersion: number;
  slicerVersion: string;
  sourceUnit: SourceUnit;
  unitScale: number;
}) {
  const canonical = [
    input.uploadId,
    input.profileKey,
    input.profileVersion,
    input.slicerVersion,
    input.sourceUnit,
    input.unitScale
  ].join("\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidEstimateId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeManufacturingError(code: unknown) {
  const aliases = new Map([
    ["MANUFACTURING_WORKER_UNAVAILABLE", "SLICER_UNAVAILABLE"],
    ["MODEL_DOWNLOAD_FAILED", "SLICER_DOWNLOAD_FAILED"],
    ["MODEL_TOO_LARGE", "MODEL_TOO_COMPLEX"],
    ["MODEL_EMPTY", "MODEL_NOT_SLICEABLE"],
    ["SLICER_EXECUTION_FAILED", "SLICER_UNAVAILABLE"],
    ["PROFILE_FINGERPRINT_MISMATCH", "SLICER_PROFILE_MISMATCH"],
    ["THREE_MF_INVALID", "MODEL_NOT_SLICEABLE"],
    ["THREE_MF_GEOMETRY_MISSING", "MODEL_NOT_SLICEABLE"],
    ["THREE_MF_PATH_INVALID", "MODEL_NOT_SLICEABLE"],
    ["THREE_MF_UNIT_MISMATCH", "MODEL_UNIT_INVALID"],
    ["THREE_MF_CANONICALIZATION_FAILED", "MODEL_NOT_SLICEABLE"],
    ["SLICER_OUTPUT_MISSING", "SLICER_OUTPUT_INVALID"],
    ["SLICER_OUTPUT_OUT_OF_RANGE", "SLICER_OUTPUT_INVALID"],
    ["SLICER_OUTPUT_AMBIGUOUS", "SLICER_OUTPUT_INVALID"]
  ]);
  const normalized = typeof code === "string" ? (aliases.get(code) ?? code) : "";
  const known = new Set([
    "MODEL_UNIT_REQUIRED",
    "MODEL_UNIT_INVALID",
    "MODEL_NOT_SLICEABLE",
    "MODEL_OUTSIDE_BUILD_VOLUME",
    "MODEL_TOO_COMPLEX",
    "SLICER_PROFILE_INVALID",
    "SLICER_PROFILE_MISMATCH",
    "SLICER_OUTPUT_INVALID",
    "SLICER_UNAVAILABLE",
    "SLICER_TIMEOUT",
    "SLICER_DOWNLOAD_FAILED",
    "MANUFACTURING_START_FAILED",
    "MANUFACTURING_SAVE_FAILED",
    "WORKER_BUSY",
    "RATE_LIMITED"
  ]);
  if (known.has(normalized)) return normalized;
  return "MANUFACTURING_ESTIMATION_FAILED";
}
