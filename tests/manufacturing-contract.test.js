import { describe, expect, it } from "vitest";
import {
  exceedsEstimationBuildVolume,
  MANUFACTURING_PROFILE_KEY,
  parseManufacturingInput,
  resolveAuthoritativeManufacturingUnit,
  safeManufacturingError
} from "../supabase/functions/_shared/manufacturing-contract.ts";

const uploadId = "550e8400-e29b-41d4-a716-446655440000";

function completedAnalysis(unit = "mm", confirmed = true) {
  return {
    analysis_status: "completed",
    result: {
      unit: { value: unit, source: "user", confirmed },
      physicalMetrics: { dimensionsMm: { x: 140, y: 30, z: 6 } }
    }
  };
}

describe("manufacturing contract autoritativo", () => {
  it("aceita apenas upload/profile e não recebe unidade do navegador", () => {
    expect(parseManufacturingInput({ uploadId })).toEqual({
      uploadId,
      profileKey: MANUFACTURING_PROFILE_KEY
    });
    expect(() => parseManufacturingInput({ uploadId, unit: "cm" })).toThrow("INVALID_MANUFACTURING_INPUT");
    expect(() => parseManufacturingInput({ uploadId, profileKey: "insight-a1m-pla-020-v1" })).toThrow("INVALID_MANUFACTURING_INPUT");
  });

  it("deriva sourceUnit/unitScale somente da análise concluída", () => {
    expect(resolveAuthoritativeManufacturingUnit(completedAnalysis("mm"))).toEqual({
      sourceUnit: "mm",
      unitScale: 1,
      dimensionsMm: { x: 140, y: 30, z: 6 }
    });
    expect(resolveAuthoritativeManufacturingUnit(completedAnalysis("cm"))).toMatchObject({
      sourceUnit: "cm",
      unitScale: 10
    });
  });

  it("nunca cria estimate em cm quando a análise confirmada é mm", () => {
    expect(() => parseManufacturingInput({ uploadId, unit: "cm" })).toThrow("INVALID_MANUFACTURING_INPUT");
    expect(resolveAuthoritativeManufacturingUnit(completedAnalysis("mm"))).toMatchObject({
      sourceUnit: "mm",
      unitScale: 1
    });
  });

  it("não autoriza slicing sem unidade confirmada", () => {
    expect(() => resolveAuthoritativeManufacturingUnit(completedAnalysis(null, false))).toThrow("MODEL_UNIT_REQUIRED");
    expect(() => resolveAuthoritativeManufacturingUnit({ ...completedAnalysis(), analysis_status: "processing" })).toThrow("MODEL_UNIT_REQUIRED");
  });

  it("pré-valida somente o limite virtual finito", () => {
    expect(exceedsEstimationBuildVolume({ x: 2_000, y: 2_000, z: 2_000 })).toBe(false);
    expect(exceedsEstimationBuildVolume({ x: 2_000.001, y: 1, z: 1 })).toBe(true);
  });

  it("preserva códigos internos conhecidos do Orca", () => {
    for (const code of [
      "ORCA_FILE_VERSION_UNSUPPORTED",
      "ORCA_NO_SUITABLE_OBJECTS",
      "ORCA_SLICING_ERROR",
      "ORCA_PROCESS_CRASH"
    ]) {
      expect(safeManufacturingError(code)).toBe(code);
    }
  });
});
