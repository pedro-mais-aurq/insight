import { describe, expect, it } from "vitest";
import {
  MAX_ANALYSIS_RESULT_BYTES,
  validateAnalysisSavePayload
} from "../supabase/functions/_shared/analysis-result.ts";

const uploadId = "550e8400-e29b-41d4-a716-446655440000";

function validResult() {
  return {
    version: 1,
    source: "client",
    format: "stl",
    unit: { value: null, source: "unknown", confirmed: false },
    rawMetrics: {
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 }
      },
      dimensions: { x: 1, y: 1, z: 1 },
      center: { x: 0.5, y: 0.5, z: 0.5 },
      surfaceArea: 6,
      volume: 1
    },
    physicalMetrics: null,
    geometry: { meshCount: 1, rawVertexCount: 36, triangleCount: 12 },
    topology: {
      performed: true,
      tolerance: 0.000001,
      degenerateTriangleCount: 0,
      openEdgeCount: 0,
      nonManifoldEdgeCount: 0,
      connectedComponentCount: 1,
      watertight: true
    },
    volumeRaw: 1,
    volumeReliable: true,
    warnings: ["UNIT_UNKNOWN"],
    analyzedAt: "2026-08-15T12:00:00.000Z"
  };
}

describe("validação server-side de ModelAnalysis", () => {
  it("aceita resultado estrito source=client", () => {
    expect(validateAnalysisSavePayload({
      uploadId,
      status: "completed",
      result: validResult()
    })).toMatchObject({ valid: true });
  });

  it.each([
    ["NaN", (result) => { result.rawMetrics.volume = Number.NaN; }],
    ["Infinity", (result) => { result.rawMetrics.surfaceArea = Infinity; }],
    ["warning desconhecido", (result) => { result.warnings = ["PRICE_READY"]; }],
    ["geometria no JSON", (result) => { result.vertices = [0, 1, 2]; }],
    ["métrica física sem unidade", (result) => {
      result.physicalMetrics = {
        dimensionsMm: { x: 1, y: 1, z: 1 },
        surfaceAreaMm2: 6,
        volumeMm3: 1
      };
    }],
    ["volume confiável em malha aberta", (result) => {
      result.topology.watertight = false;
    }],
    ["volume bruto inconsistente", (result) => { result.volumeRaw = 2; }]
  ])("rejeita %s", (_label, mutate) => {
    const result = validResult();
    mutate(result);

    expect(validateAnalysisSavePayload({
      uploadId,
      status: "completed",
      result
    })).toMatchObject({ valid: false });
  });

  it("rejeita JSON acima de 64 KB", () => {
    const result = validResult();
    result.unexpected = "x".repeat(MAX_ANALYSIS_RESULT_BYTES);

    expect(validateAnalysisSavePayload({
      uploadId,
      status: "completed",
      result
    })).toMatchObject({ valid: false });
  });

  it("aceita falha com código conhecido", () => {
    expect(validateAnalysisSavePayload({
      uploadId,
      status: "failed",
      errorCode: "PARSE_FAILED"
    })).toMatchObject({ valid: true });
  });
});
