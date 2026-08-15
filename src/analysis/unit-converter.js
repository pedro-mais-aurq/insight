import { ANALYSIS_WARNING_CODES } from "./analysis-errors.js";

export const UNIT_FACTORS_TO_MM = Object.freeze({
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4
});

export function createUnknownUnit() {
  return {
    value: null,
    source: "unknown",
    confirmed: false
  };
}

export function createFileUnit(value) {
  if (!isSupportedUnit(value)) {
    return createUnknownUnit();
  }

  return {
    value,
    source: "file",
    confirmed: true
  };
}

export function createUserUnit(value) {
  if (!isSupportedUnit(value)) {
    return createUnknownUnit();
  }

  return {
    value,
    source: "user",
    confirmed: true
  };
}

export function buildPhysicalMetrics(rawMetrics, unit) {
  const factor = UNIT_FACTORS_TO_MM[unit?.value];

  if (!factor) {
    return null;
  }

  return {
    dimensionsMm: {
      x: rawMetrics.dimensions.x * factor,
      y: rawMetrics.dimensions.y * factor,
      z: rawMetrics.dimensions.z * factor
    },
    surfaceAreaMm2: rawMetrics.surfaceArea * factor ** 2,
    volumeMm3: rawMetrics.volume * factor ** 3
  };
}

export function withUnitWarning(warnings, unit) {
  const filtered = warnings.filter(
    (code) => code !== ANALYSIS_WARNING_CODES.UNIT_UNKNOWN
  );

  return unit?.value
    ? filtered
    : [ANALYSIS_WARNING_CODES.UNIT_UNKNOWN, ...filtered];
}

export function isSupportedUnit(value) {
  return Object.hasOwn(UNIT_FACTORS_TO_MM, value);
}
