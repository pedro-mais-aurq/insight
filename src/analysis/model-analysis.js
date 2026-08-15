import {
  buildPhysicalMetrics,
  createUserUnit,
  withUnitWarning
} from "./unit-converter.js";

export function buildModelAnalysis({
  parsed,
  normalized,
  measured,
  analyzedAt
}) {
  const unit = parsed.unit;
  const warnings = withUnitWarning(measured.warnings, unit);

  return {
    version: 1,
    source: "client",
    format: parsed.format,
    unit,
    rawMetrics: measured.rawMetrics,
    physicalMetrics: buildPhysicalMetrics(measured.rawMetrics, unit),
    geometry: {
      meshCount: normalized.meshCount,
      rawVertexCount: normalized.rawVertexCount,
      triangleCount: normalized.triangleCount
    },
    topology: measured.topology,
    volumeRaw: measured.volumeRaw,
    volumeReliable: measured.volumeReliable,
    warnings,
    analyzedAt
  };
}

export function applyUserUnit(analysis, unitValue) {
  const unit = createUserUnit(unitValue);

  return {
    ...analysis,
    unit,
    physicalMetrics: buildPhysicalMetrics(analysis.rawMetrics, unit),
    warnings: withUnitWarning(analysis.warnings, unit)
  };
}
