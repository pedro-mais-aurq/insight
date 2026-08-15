import {
  ALLOWED_EXTENSIONS,
  type AllowedExtension
} from "./constants.ts";

export const MAX_ANALYSIS_RESULT_BYTES = 64 * 1024;

export const ANALYSIS_ERROR_CODES = Object.freeze([
  "PARSE_FAILED",
  "NO_GEOMETRY",
  "NO_TRIANGLES",
  "UNSUPPORTED_STRUCTURE",
  "INVALID_COORDINATES",
  "ANALYSIS_WORKER_FAILED",
  "ANALYSIS_START_FAILED",
  "ANALYSIS_SAVE_FAILED",
  "RATE_LIMITED",
  "UPLOAD_EXPIRED",
  "UPLOAD_STATE_INVALID"
]);

export const ANALYSIS_WARNING_CODES = Object.freeze([
  "UNIT_UNKNOWN",
  "DEGENERATE_TRIANGLES",
  "OPEN_EDGES",
  "NON_MANIFOLD_EDGES",
  "MULTIPLE_COMPONENTS",
  "TOPOLOGY_SKIPPED_COMPLEXITY",
  "VOLUME_UNRELIABLE"
]);

const TOP_LEVEL_KEYS = [
  "version",
  "source",
  "format",
  "unit",
  "rawMetrics",
  "physicalMetrics",
  "geometry",
  "topology",
  "volumeRaw",
  "volumeReliable",
  "warnings",
  "analyzedAt"
];

export function validateAnalysisSavePayload(input: unknown) {
  if (!isRecord(input) || !isUuid(input.uploadId)) {
    return invalid("INVALID_REQUEST");
  }

  if (input.status === "failed") {
    return typeof input.errorCode === "string"
      && ANALYSIS_ERROR_CODES.includes(input.errorCode)
      && hasOnlyKeys(input, ["uploadId", "status", "errorCode"])
      ? valid({
        uploadId: input.uploadId,
        status: "failed" as const,
        errorCode: input.errorCode
      })
      : invalid("INVALID_ANALYSIS_ERROR");
  }

  if (input.status !== "completed" || !hasOnlyKeys(input, [
    "uploadId",
    "status",
    "result"
  ])) {
    return invalid("INVALID_REQUEST");
  }

  if (!isValidModelAnalysis(input.result)) {
    return invalid("INVALID_ANALYSIS_RESULT");
  }

  const serialized = JSON.stringify(input.result);

  if (new TextEncoder().encode(serialized).byteLength > MAX_ANALYSIS_RESULT_BYTES) {
    return invalid("ANALYSIS_RESULT_TOO_LARGE");
  }

  return valid({
    uploadId: input.uploadId,
    status: "completed" as const,
    result: input.result
  });
}

export function isValidModelAnalysis(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, TOP_LEVEL_KEYS)) {
    return false;
  }

  return value.version === 1
    && value.source === "client"
    && isAllowedFormat(value.format)
    && isValidUnit(value.unit)
    && isValidRawMetrics(value.rawMetrics)
    && isValidPhysicalMetrics(value.physicalMetrics)
    && isValidGeometrySummary(value.geometry)
    && isValidTopology(value.topology)
    && isNonNegativeFinite(value.volumeRaw)
    && typeof value.volumeReliable === "boolean"
    && isValidWarnings(value.warnings)
    && typeof value.analyzedAt === "string"
    && Number.isFinite(Date.parse(value.analyzedAt))
    && isSemanticallyConsistent(value);
}

function isSemanticallyConsistent(value: Record<string, unknown>) {
  const unit = value.unit as Record<string, unknown>;
  const rawMetrics = value.rawMetrics as Record<string, unknown>;
  const geometry = value.geometry as Record<string, unknown>;
  const topology = value.topology as Record<string, unknown>;
  const warnings = value.warnings as string[];
  const hasPhysicalMetrics = value.physicalMetrics !== null;
  const hasKnownUnit = unit.value !== null;
  const expectedVolumeReliability = topology.performed === true
    && topology.watertight === true;

  return hasKnownUnit === hasPhysicalMetrics
    && (hasKnownUnit
      ? !warnings.includes("UNIT_UNKNOWN")
      : warnings.includes("UNIT_UNKNOWN"))
    && value.volumeReliable === expectedVolumeReliability
    && (expectedVolumeReliability
      ? !warnings.includes("VOLUME_UNRELIABLE")
      : warnings.includes("VOLUME_UNRELIABLE"))
    && rawMetrics.volume === value.volumeRaw
    && Number(topology.degenerateTriangleCount) <= Number(geometry.triangleCount);
}

function isValidRawMetrics(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, [
      "boundingBox",
      "dimensions",
      "center",
      "surfaceArea",
      "volume"
    ])
    && isRecord(value.boundingBox)
    && hasOnlyKeys(value.boundingBox, ["min", "max"])
    && isVector(value.boundingBox.min, false)
    && isVector(value.boundingBox.max, false)
    && isVector(value.dimensions, true)
    && isVector(value.center, false)
    && isNonNegativeFinite(value.surfaceArea)
    && isNonNegativeFinite(value.volume);
}

function isValidPhysicalMetrics(value: unknown) {
  if (value === null) {
    return true;
  }

  return isRecord(value)
    && hasOnlyKeys(value, ["dimensionsMm", "surfaceAreaMm2", "volumeMm3"])
    && isVector(value.dimensionsMm, true)
    && isNonNegativeFinite(value.surfaceAreaMm2)
    && isNonNegativeFinite(value.volumeMm3);
}

function isValidGeometrySummary(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["meshCount", "rawVertexCount", "triangleCount"])
    && isPositiveInteger(value.meshCount)
    && isPositiveInteger(value.rawVertexCount)
    && isPositiveInteger(value.triangleCount);
}

function isValidTopology(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "performed",
    "tolerance",
    "degenerateTriangleCount",
    "openEdgeCount",
    "nonManifoldEdgeCount",
    "connectedComponentCount",
    "watertight"
  ])) {
    return false;
  }

  const nullableCount = (count: unknown) => count === null || isCount(count);

  return typeof value.performed === "boolean"
    && isNonNegativeFinite(value.tolerance)
    && isCount(value.degenerateTriangleCount)
    && nullableCount(value.openEdgeCount)
    && nullableCount(value.nonManifoldEdgeCount)
    && nullableCount(value.connectedComponentCount)
    && [true, false, null].includes(value.watertight as boolean | null)
    && (value.performed
      ? value.openEdgeCount !== null
        && value.nonManifoldEdgeCount !== null
        && value.connectedComponentCount !== null
        && typeof value.watertight === "boolean"
      : value.openEdgeCount === null
        && value.nonManifoldEdgeCount === null
        && value.connectedComponentCount === null
        && value.watertight === null);
}

function isValidUnit(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, ["value", "source", "confirmed"])) {
    return false;
  }

  return [null, "mm", "cm", "m", "inch"].includes(value.value as string | null)
    && ["unknown", "file", "user"].includes(String(value.source))
    && typeof value.confirmed === "boolean"
    && (value.value === null
      ? value.source === "unknown" && value.confirmed === false
      : value.confirmed === true);
}

function isValidWarnings(value: unknown) {
  return Array.isArray(value)
    && value.length <= ANALYSIS_WARNING_CODES.length
    && new Set(value).size === value.length
    && value.every((warning) => (
      typeof warning === "string"
      && ANALYSIS_WARNING_CODES.includes(warning)
    ));
}

function isVector(value: unknown, nonNegative: boolean) {
  if (!isRecord(value) || !hasOnlyKeys(value, ["x", "y", "z"])) {
    return false;
  }

  const validator = nonNegative ? isNonNegativeFinite : isFiniteNumber;
  return validator(value.x) && validator(value.y) && validator(value.z);
}

function isAllowedFormat(value: unknown): value is AllowedExtension {
  return typeof value === "string"
    && (ALLOWED_EXTENSIONS as readonly string[]).includes(value);
}

function isPositiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isCount(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isNonNegativeFinite(value: unknown) {
  return isFiniteNumber(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUuid(value: unknown) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
  const keys = Object.keys(value);
  return keys.length === allowedKeys.length
    && keys.every((key) => allowedKeys.includes(key));
}

function valid<T>(value: T) {
  return { valid: true as const, value, error: null };
}

function invalid(code: string) {
  return { valid: false as const, value: null, error: { code } };
}
