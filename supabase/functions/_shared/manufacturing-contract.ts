export const MANUFACTURING_ENGINE = "OrcaSlicer";
export const MANUFACTURING_ENGINE_VERSION = "2.4.2";
export const MANUFACTURING_PROFILE_KEY = "insight-estimation-a1m-pla-020-v1";
export const SIGNED_MODEL_URL_TTL_SECONDS = 300;
export const ESTIMATION_BUILD_VOLUME_MM = Object.freeze({ x: 2_000, y: 2_000, z: 2_000 });
export const MANUFACTURING_RESULT_LIMITS = Object.freeze({
  maxWeightGrams: 100_000,
  maxPrintTimeSeconds: 36_000_000
});

const UNIT_SCALES = Object.freeze({
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4
});

export type SourceUnit = keyof typeof UNIT_SCALES;

export function parseManufacturingInput(value: unknown) {
  const input = value as Record<string, unknown> | null;
  const allowedKeys = new Set(["uploadId", "profileKey"]);
  const uploadId = input?.uploadId;
  const profileKey = input?.profileKey ?? MANUFACTURING_PROFILE_KEY;

  if (
    typeof uploadId !== "string"
    || !input
    || Object.keys(input).some((key) => !allowedKeys.has(key))
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)
    || profileKey !== MANUFACTURING_PROFILE_KEY
  ) {
    throw new Error("INVALID_MANUFACTURING_INPUT");
  }

  return Object.freeze({
    uploadId,
    profileKey
  });
}

export function resolveAuthoritativeManufacturingUnit(analysis: unknown) {
  const row = analysis as Record<string, unknown> | null;
  const result = row?.result as Record<string, unknown> | null;
  const unit = result?.unit as Record<string, unknown> | null;
  const physicalMetrics = result?.physicalMetrics as Record<string, unknown> | null;
  const dimensions = physicalMetrics?.dimensionsMm as Record<string, unknown> | null;

  if (row?.analysis_status !== "completed" || unit?.confirmed !== true) {
    throw new Error("MODEL_UNIT_REQUIRED");
  }
  const sourceUnit = unit.value;
  if (typeof sourceUnit !== "string" || !Object.hasOwn(UNIT_SCALES, sourceUnit)) {
    throw new Error("MODEL_UNIT_INVALID");
  }
  if (!isDimensionsMm(dimensions)) throw new Error("MODEL_UNIT_INVALID");

  return Object.freeze({
    sourceUnit: sourceUnit as SourceUnit,
    unitScale: UNIT_SCALES[sourceUnit as SourceUnit],
    dimensionsMm: Object.freeze({
      x: Number(dimensions.x),
      y: Number(dimensions.y),
      z: Number(dimensions.z)
    })
  });
}

export function exceedsEstimationBuildVolume(dimensionsMm: { x: number; y: number; z: number }) {
  return (["x", "y", "z"] as const).some(
    (axis) => dimensionsMm[axis] > ESTIMATION_BUILD_VOLUME_MM[axis]
  );
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
    "ORCA_FILE_VERSION_UNSUPPORTED",
    "ORCA_NO_SUITABLE_OBJECTS",
    "ORCA_SLICING_ERROR",
    "ORCA_PROCESS_CRASH",
    "MANUFACTURING_START_FAILED",
    "MANUFACTURING_SAVE_FAILED",
    "WORKER_BUSY",
    "RATE_LIMITED"
  ]);
  if (known.has(normalized)) return normalized;
  return "MANUFACTURING_ESTIMATION_FAILED";
}

function isDimensionsMm(value: Record<string, unknown> | null): value is { x: number; y: number; z: number } {
  if (!value || Object.keys(value).length !== 3) return false;
  return (["x", "y", "z"] as const).every((axis) => {
    const coordinate = value[axis];
    return typeof coordinate === "number"
      && Number.isFinite(coordinate)
      && coordinate >= 0;
  });
}
