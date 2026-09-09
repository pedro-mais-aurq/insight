import { describe, expect, it, vi } from "vitest";
import {
  createLongRunningAnalysisJourney,
  createLongRunningAnalysisNotice,
  LONG_RUNNING_ANALYSIS_DELAY_MS
} from "../src/experience/long-running-analysis.js";

describe("aviso de análise prolongada", () => {
  it("é acionado exatamente após 20 segundos", () => {
    const changes = [];
    let scheduledCallback;
    let scheduledDelay;
    const notice = createLongRunningAnalysisNotice({
      onChange: (visible) => changes.push(visible),
      schedule(callback, delay) {
        scheduledCallback = callback;
        scheduledDelay = delay;
        return 7;
      },
      cancel: vi.fn()
    });

    notice.start();
    expect(scheduledDelay).toBe(LONG_RUNNING_ANALYSIS_DELAY_MS);
    expect(changes).toEqual([]);

    scheduledCallback();
    expect(changes).toEqual([true]);

    notice.stop();
    expect(changes).toEqual([true, false]);
  });

  it("cancela o aviso quando o processamento termina antes do limite", () => {
    const cancel = vi.fn();
    const changes = [];
    const notice = createLongRunningAnalysisNotice({
      onChange: (visible) => changes.push(visible),
      schedule: () => 11,
      cancel
    });

    notice.start();
    notice.stop();

    expect(cancel).toHaveBeenCalledWith(11);
    expect(changes).toEqual([]);
  });

  it("preserva o relógio entre análise, preparo e precificação", () => {
    const changes = [];
    const cancel = vi.fn();
    let scheduledCallback;
    const journey = createLongRunningAnalysisJourney({
      onChange: (visible) => changes.push(visible),
      schedule(callback) {
        scheduledCallback = callback;
        return 19;
      },
      cancel
    });

    journey.onUploadState("analyzing");
    journey.onUploadState("ready");
    journey.onManufacturingState("preparing");
    journey.onManufacturingState("processing");
    journey.onManufacturingState("completed");
    journey.onPricingState("processing");

    expect(cancel).not.toHaveBeenCalled();
    scheduledCallback();
    expect(changes).toEqual([true]);

    journey.onPricingState("completed");
    expect(changes).toEqual([true, false]);
  });

  it("cancela o relógio quando a análise exige ação do cliente", () => {
    const cancel = vi.fn();
    const journey = createLongRunningAnalysisJourney({
      onChange: vi.fn(),
      schedule: () => 23,
      cancel
    });

    journey.onUploadState("analyzing");
    journey.onUploadState("ready");
    journey.onManufacturingState("waiting_unit");

    expect(cancel).toHaveBeenCalledWith(23);
  });
});
