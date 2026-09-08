const SUPPORTED_UNITS = new Set(["mm", "cm", "m", "inch"]);

export function createManufacturingController({
  service,
  view,
  pricingClient,
  pricingView,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  maxPolls = 260
}) {
  let generation = 0;
  let lastAnalysisState = null;
  let manufacturingEstimate = null;

  view.bind({ onQuantityChange: reprice, onRetry: retry });

  async function onAnalysisReady(state) {
    lastAnalysisState = state;
    manufacturingEstimate = null;
    pricingView.showUnavailable();
    const unit = state?.analysis?.result?.unit;
    if (!unit?.confirmed || !SUPPORTED_UNITS.has(unit?.value)) {
      view.showWaitingUnit();
      return;
    }

    const current = ++generation;
    view.showProcessing();
    try {
      const started = await service.startEstimate({
        uploadId: state.id,
        profileKey: "insight-estimation-a1m-pla-020-v1"
      });
      let estimate = await service.getEstimate(started.estimateId);
      for (let poll = 0; ["pending", "processing"].includes(estimate.estimateStatus); poll += 1) {
        if (poll >= maxPolls) throw new Error("MANUFACTURING_ESTIMATION_FAILED");
        await sleep(started.pollAfterMs);
        if (current !== generation) return;
        estimate = await service.getEstimate(started.estimateId);
      }
      if (current !== generation) return;
      if (estimate.estimateStatus === "failed") throw Object.assign(new Error(estimate.errorCode), { code: estimate.errorCode });
      manufacturingEstimate = estimate;
      view.showEstimate(estimate);
      await reprice();
    } catch (error) {
      if (current !== generation) return;
      view.showError(error?.code ?? error?.message);
      pricingView.showUnavailable();
    }
  }

  async function reprice(quantity = view.getQuantity()) {
    if (!manufacturingEstimate) return;
    const normalized = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000
      ? quantity
      : view.getQuantity();
    try {
      const price = await pricingClient.estimatePrice({
        weightGrams: manufacturingEstimate.weightGrams,
        printTimeHours: manufacturingEstimate.printTimeSeconds / 3600,
        quantity: normalized
      });
      pricingView.showEstimate(price);
    } catch {
      pricingView.showError();
    }
  }

  async function retry() {
    if (lastAnalysisState) await onAnalysisReady(lastAnalysisState);
  }

  function reset() {
    generation += 1;
    lastAnalysisState = null;
    manufacturingEstimate = null;
    view.reset();
    pricingView.showUnavailable();
  }

  return Object.freeze({ onAnalysisReady, reprice, retry, reset });
}
