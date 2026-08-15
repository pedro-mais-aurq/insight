import { describe, expect, it, vi } from "vitest";
import { createAnalysisController } from "../src/analysis/analysis-controller.js";
import { UPLOAD_STATES } from "../src/state/upload-state.js";

const uploadId = "550e8400-e29b-41d4-a716-446655440000";

function uploadedState() {
  return {
    id: uploadId,
    file: { name: "model.stl" },
    extension: "stl",
    status: UPLOAD_STATES.UPLOADED,
    analysis: null,
    error: null
  };
}

function measuredResult() {
  return {
    rawMetrics: {
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 0 }
      },
      dimensions: { x: 1, y: 1, z: 0 },
      center: { x: 0.5, y: 0.5, z: 0 },
      surfaceArea: 0.5,
      volume: 0
    },
    topology: {
      performed: true,
      tolerance: 1e-6,
      degenerateTriangleCount: 0,
      openEdgeCount: 3,
      nonManifoldEdgeCount: 0,
      connectedComponentCount: 1,
      watertight: false
    },
    volumeRaw: 0,
    volumeReliable: false,
    warnings: ["OPEN_EDGES", "VOLUME_UNRELIABLE"]
  };
}

function harness(initialState = uploadedState()) {
  let state = initialState;
  const stateController = {
    beginAnalysis: vi.fn(({ stage }) => {
      state = { ...state, status: UPLOAD_STATES.ANALYZING, analysis: { stage } };
    }),
    updateAnalysisStage: vi.fn((stage) => {
      state = { ...state, analysis: { ...state.analysis, stage } };
    }),
    completeAnalysis: vi.fn((result) => {
      state = {
        ...state,
        status: UPLOAD_STATES.READY,
        analysis: { stage: "completed", result }
      };
    }),
    failAnalysis: vi.fn((error) => {
      state = { ...state, status: UPLOAD_STATES.ANALYSIS_ERROR, error };
    }),
    updateAnalysisResult: vi.fn((result) => {
      state = { ...state, analysis: { ...state.analysis, result } };
    }),
    getState: vi.fn(() => state)
  };
  const analysisService = {
    startModelAnalysis: vi.fn().mockResolvedValue({}),
    saveCompleted: vi.fn().mockResolvedValue({}),
    saveFailed: vi.fn().mockResolvedValue({})
  };
  const workerClient = {
    analyze: vi.fn().mockResolvedValue(measuredResult()),
    dispose: vi.fn()
  };
  const viewer = { show: vi.fn(), dispose: vi.fn() };
  const view = { bind: vi.fn(), setViewerUnavailable: vi.fn() };
  const parser = vi.fn().mockResolvedValue({
    format: "stl",
    object3D: { id: "object" },
    meshCount: 1,
    unit: { value: null, source: "unknown", confirmed: false }
  });
  const normalizer = vi.fn().mockReturnValue({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    meshCount: 1,
    rawVertexCount: 3,
    triangleCount: 1
  });
  const controller = createAnalysisController({
    stateController,
    analysisService,
    workerClient,
    viewer,
    view,
    parser,
    normalizer,
    now: () => "2026-08-15T12:00:00.000Z",
    nextFrame: () => Promise.resolve()
  });

  return {
    controller,
    stateController,
    analysisService,
    workerClient,
    viewer,
    view,
    parser,
    normalizer,
    getState: () => state
  };
}

describe("createAnalysisController", () => {
  it("executa start, parse, worker, persistência, ready e viewer", async () => {
    const test = harness();
    await test.controller.analyze(test.getState());

    expect(test.analysisService.startModelAnalysis).toHaveBeenCalledWith(uploadId);
    expect(test.parser).toHaveBeenCalledOnce();
    expect(test.workerClient.analyze).toHaveBeenCalledOnce();
    expect(test.analysisService.saveCompleted).toHaveBeenCalledWith(
      uploadId,
      expect.objectContaining({
        version: 1,
        source: "client",
        format: "stl",
        physicalMetrics: null
      })
    );
    expect(test.stateController.completeAnalysis).toHaveBeenCalledOnce();
    expect(test.viewer.show).toHaveBeenCalledWith({ id: "object" });
  });

  it("persiste código conhecido e entra em analysis_error", async () => {
    const test = harness();
    test.parser.mockRejectedValueOnce(Object.assign(new Error("parse"), {
      code: "PARSE_FAILED"
    }));

    await test.controller.analyze(test.getState());

    expect(test.analysisService.saveFailed).toHaveBeenCalledWith(
      uploadId,
      "PARSE_FAILED"
    );
    expect(test.stateController.failAnalysis).toHaveBeenCalledWith({
      code: "PARSE_FAILED",
      retryable: false
    });
    expect(test.workerClient.analyze).not.toHaveBeenCalled();
  });

  it("retry de análise reutiliza o upload e não possui etapa de upload", async () => {
    const state = {
      ...uploadedState(),
      status: UPLOAD_STATES.ANALYSIS_ERROR,
      error: { code: "ANALYSIS_WORKER_FAILED", retryable: true }
    };
    const test = harness(state);
    await test.controller.retry();

    expect(test.analysisService.startModelAnalysis).toHaveBeenCalledWith(uploadId);
    expect(test.parser).toHaveBeenCalledWith(state.file, "stl");
    expect(test.workerClient.analyze).toHaveBeenCalledOnce();
    expect(test.analysisService.saveCompleted).toHaveBeenCalledOnce();
  });

  it.each([
    "UPLOAD_EXPIRED",
    "UPLOAD_STATE_INVALID",
    "NO_GEOMETRY",
    "NO_TRIANGLES",
    "UNSUPPORTED_STRUCTURE",
    "INVALID_COORDINATES"
  ])("classifica %s como definitivo no estado", async (code) => {
    const test = harness();
    test.analysisService.startModelAnalysis.mockRejectedValueOnce(
      Object.assign(new Error(code), { code })
    );

    await test.controller.analyze(test.getState());

    expect(test.stateController.failAnalysis).toHaveBeenCalledWith({
      code,
      retryable: false
    });
  });

  it("não executa pipeline ao repetir um erro definitivo", async () => {
    const state = {
      ...uploadedState(),
      status: UPLOAD_STATES.ANALYSIS_ERROR,
      error: { code: "UPLOAD_EXPIRED", retryable: false }
    };
    const test = harness(state);

    await test.controller.retry();

    expect(test.analysisService.startModelAnalysis).not.toHaveBeenCalled();
    expect(test.parser).not.toHaveBeenCalled();
    expect(test.workerClient.analyze).not.toHaveBeenCalled();
    expect(test.analysisService.saveCompleted).not.toHaveBeenCalled();
    expect(test.analysisService.saveFailed).not.toHaveBeenCalled();
  });

  it("troca unidade sem reparsear nem reexecutar worker", async () => {
    const test = harness();
    await test.controller.analyze(test.getState());
    test.parser.mockClear();
    test.workerClient.analyze.mockClear();

    await test.controller.changeUnit("cm");

    expect(test.stateController.updateAnalysisResult).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: { value: "cm", source: "user", confirmed: true },
        physicalMetrics: expect.objectContaining({ surfaceAreaMm2: 50 })
      })
    );
    expect(test.parser).not.toHaveBeenCalled();
    expect(test.workerClient.analyze).not.toHaveBeenCalled();
  });

  it("encerra worker e viewer ao limpar ou substituir o modelo", () => {
    const test = harness();

    test.controller.reset();

    expect(test.workerClient.dispose).toHaveBeenCalledOnce();
    expect(test.viewer.dispose).toHaveBeenCalledOnce();
    expect(test.view.setViewerUnavailable).toHaveBeenCalledWith(false);
  });
});
