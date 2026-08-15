export const ANALYSIS_CONFIG = Object.freeze({
  topologyTriangleLimit: 500_000,
  topologyRelativeTolerance: 1e-6,
  topologyMinimumTolerance: 1e-9,
  degenerateAreaEpsilon: 1e-12,
  maxResultBytes: 64 * 1024,
  supportedUnits: Object.freeze(["mm", "cm", "m", "inch"])
});
