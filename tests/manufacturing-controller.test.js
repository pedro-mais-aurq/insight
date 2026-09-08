import { describe, expect, it, vi } from "vitest";
import { createManufacturingController } from "../src/manufacturing/manufacturing-controller.js";

const state = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  analysis: { result: { unit: { value: "cm", source: "user", confirmed: true } } }
};

function harness() {
  let handlers;
  const service = {
    startEstimate: vi.fn().mockResolvedValue({ estimateId: "estimate", estimateStatus: "processing", pollAfterMs: 250 }),
    getEstimate: vi.fn()
      .mockResolvedValueOnce({ estimateId: "estimate", estimateStatus: "processing" })
      .mockResolvedValueOnce({
        estimateId: "estimate", estimateStatus: "completed", weightGrams: 50,
        printTimeSeconds: 5400, profile: { label: "A1 mini · PLA" }
      })
  };
  const view = {
    bind: vi.fn((value) => { handlers = value; }), reset: vi.fn(), showWaitingUnit: vi.fn(),
    showProcessing: vi.fn(), showEstimate: vi.fn(), showError: vi.fn(), getQuantity: vi.fn(() => 2)
  };
  const pricingClient = { estimatePrice: vi.fn().mockResolvedValue({ unitPrice: 10, totalPrice: 20, quantity: 2, currency: "BRL" }) };
  const pricingView = { showUnavailable: vi.fn(), showEstimate: vi.fn(), showError: vi.fn() };
  const controller = createManufacturingController({ service, view, pricingClient, pricingView, sleep: () => Promise.resolve() });
  return { controller, service, view, pricingClient, pricingView, getHandlers: () => handlers };
}

describe("manufacturing controller", () => {
  it("encadeia P3 → P5 → P4 sem arredondar horas", async () => {
    const test = harness();
    await test.controller.onAnalysisReady(state);
    expect(test.service.startEstimate).toHaveBeenCalledWith({
      uploadId: state.id,
      profileKey: "insight-estimation-a1m-pla-020-v1"
    });
    expect(test.view.showEstimate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: 50, printTimeSeconds: 5400 }));
    expect(test.pricingClient.estimatePrice).toHaveBeenCalledWith({ weightGrams: 50, printTimeHours: 1.5, quantity: 2 });
    expect(test.pricingView.showEstimate).toHaveBeenCalledOnce();
  });

  it("mudança de quantidade recalcula só a P4", async () => {
    const test = harness();
    await test.controller.onAnalysisReady(state);
    test.service.startEstimate.mockClear();
    await test.getHandlers().onQuantityChange(4);
    expect(test.service.startEstimate).not.toHaveBeenCalled();
    expect(test.pricingClient.estimatePrice).toHaveBeenLastCalledWith({ weightGrams: 50, printTimeHours: 1.5, quantity: 4 });
  });

  it("não inicia slicing enquanto a unidade não estiver confirmada", async () => {
    const test = harness();
    await test.controller.onAnalysisReady({ ...state, analysis: { result: { unit: { value: null, confirmed: false } } } });
    expect(test.view.showWaitingUnit).toHaveBeenCalledOnce();
    expect(test.service.startEstimate).not.toHaveBeenCalled();
  });
});
