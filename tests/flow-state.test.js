import { describe, expect, it } from "vitest";
import {
  applyManufacturingFlowState,
  applyPricingFlowState,
  applyUploadFlowState,
  createInitialFlowState,
  FLOW_STEP_STATES,
  getPhysicalCapacityWarning,
  REFERENCE_BUILD_VOLUME_MM
} from "../src/experience/flow-state.js";
import { getProgressAccessibility } from "../src/experience/flow-view.js";

function uploadState(status, overrides = {}) {
  return {
    status,
    upload: { progress: 0 },
    analysis: null,
    ...overrides
  };
}

function readyState(dimensions, { confirmed = true } = {}) {
  return uploadState("ready", {
    analysis: {
      result: {
        unit: { value: confirmed ? "mm" : null, confirmed },
        physicalMetrics: { dimensionsMm: dimensions }
      }
    }
  });
}

describe("histórico visual do fluxo", () => {
  it("permanece oculto até a análise realmente começar", () => {
    const initial = createInitialFlowState();
    expect(initial.visible).toBe(false);
    expect(applyUploadFlowState(initial, uploadState("uploading")).visible).toBe(false);
    expect(applyUploadFlowState(initial, uploadState("uploaded")).visible).toBe(false);
    expect(applyUploadFlowState(initial, uploadState("analyzing")).visible).toBe(true);
  });

  it("representa upload ativo sem inventar percentual", () => {
    const state = applyUploadFlowState(
      createInitialFlowState(),
      uploadState("uploading")
    );

    expect(state.steps.upload).toMatchObject({
      state: FLOW_STEP_STATES.ACTIVE,
      progress: { kind: "indeterminate" }
    });
    expect(getProgressAccessibility(state.steps.upload.progress).valueNow).toBeNull();
  });

  it("usa percentual somente quando existe progresso mensurável", () => {
    const state = applyUploadFlowState(
      createInitialFlowState(),
      uploadState("uploading", { upload: { progress: 72 } })
    );

    expect(state.steps.upload.progress).toEqual({ kind: "determinate", value: 72 });
    expect(getProgressAccessibility(state.steps.upload.progress)).toEqual({
      valueNow: "72",
      valueText: "72%"
    });
  });

  it("mantém upload concluído quando a análise começa e termina", () => {
    const analyzing = applyUploadFlowState(
      createInitialFlowState(),
      uploadState("analyzing")
    );
    expect(analyzing.steps.upload.state).toBe(FLOW_STEP_STATES.COMPLETED);
    expect(analyzing.steps.analysis).toMatchObject({
      state: FLOW_STEP_STATES.ACTIVE,
      progress: { kind: "indeterminate" }
    });

    const ready = applyUploadFlowState(
      analyzing,
      readyState({ x: 100, y: 120, z: 80 })
    );
    expect(ready.steps.upload.state).toBe(FLOW_STEP_STATES.COMPLETED);
    expect(ready.steps.analysis.state).toBe(FLOW_STEP_STATES.COMPLETED);
  });

  it("preserva etapas anteriores durante processamento, sucesso e falha", () => {
    let state = applyUploadFlowState(
      createInitialFlowState(),
      readyState({ x: 100, y: 120, z: 80 })
    );
    state = applyManufacturingFlowState(state, { status: "preparing" });
    expect(state.steps.preparation.state).toBe(FLOW_STEP_STATES.ACTIVE);

    state = applyManufacturingFlowState(state, { status: "processing" });
    expect(state.steps.analysis.state).toBe(FLOW_STEP_STATES.COMPLETED);
    expect(state.steps.preparation.state).toBe(FLOW_STEP_STATES.COMPLETED);
    expect(state.steps.manufacturing.state).toBe(FLOW_STEP_STATES.ACTIVE);

    const completed = applyManufacturingFlowState(state, { status: "completed" });
    expect(completed.steps.manufacturing.state).toBe(FLOW_STEP_STATES.COMPLETED);

    const failed = applyManufacturingFlowState(state, {
      status: "failed",
      prepared: true,
      message: "Não foi possível concluir automaticamente"
    });
    expect(failed.steps.upload.state).toBe(FLOW_STEP_STATES.COMPLETED);
    expect(failed.steps.analysis.state).toBe(FLOW_STEP_STATES.COMPLETED);
    expect(failed.steps.preparation.state).toBe(FLOW_STEP_STATES.COMPLETED);
    expect(failed.steps.manufacturing.state).toBe(FLOW_STEP_STATES.FAILED);
  });

  it("representa precificação ativa e concluída separadamente", () => {
    let state = createInitialFlowState();
    state = applyPricingFlowState(state, { status: "processing" });
    expect(state.steps.pricing).toMatchObject({
      state: FLOW_STEP_STATES.ACTIVE,
      progress: { kind: "indeterminate" }
    });

    state = applyPricingFlowState(state, { status: "completed" });
    expect(state.steps.pricing.state).toBe(FLOW_STEP_STATES.COMPLETED);
  });
});

describe("capacidade física de referência", () => {
  it("gera warning acima de 180 mm sem transformar a análise em erro", () => {
    const warning = getPhysicalCapacityWarning({
      unit: { value: "mm", confirmed: true },
      physicalMetrics: { dimensionsMm: { x: 180.01, y: 100, z: 80 } }
    });
    expect(warning).toMatchObject({
      kind: "physical_reference",
      limitMm: REFERENCE_BUILD_VOLUME_MM
    });

    let state = applyUploadFlowState(
      createInitialFlowState(),
      readyState({ x: 180.01, y: 100, z: 80 })
    );
    expect(state.steps.analysis).toMatchObject({
      state: FLOW_STEP_STATES.COMPLETED,
      warning: true
    });
    state = applyManufacturingFlowState(state, { status: "preparing" });
    expect(state.steps.preparation.state).toBe(FLOW_STEP_STATES.ACTIVE);
  });

  it("não gera warning até 180 mm nem com unidade não confirmada", () => {
    expect(getPhysicalCapacityWarning({
      unit: { value: "mm", confirmed: true },
      physicalMetrics: { dimensionsMm: { x: 180, y: 180, z: 180 } }
    })).toBeNull();
    expect(getPhysicalCapacityWarning({
      unit: { value: null, confirmed: false },
      physicalMetrics: { dimensionsMm: { x: 500, y: 500, z: 500 } }
    })).toBeNull();
  });

});
