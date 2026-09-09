import { getManufacturingErrorPresentation } from "./manufacturing-error-presentation.js";

export const MANUFACTURING_FALLBACK_MESSAGE = "Não conseguimos concluir automaticamente a estimativa.";

export function createManufacturingView(root, { onStateChange = () => {} } = {}) {
  const elements = getElements(root);
  let bound = false;

  function bind({ onQuantityChange, onRetry }) {
    if (bound) return;
    bound = true;
    elements.quantity.addEventListener("change", () => onQuantityChange(Number(elements.quantity.value)));
    elements.retry.addEventListener("click", () => onRetry());
  }

  function reset() {
    root.dataset.manufacturingState = "unavailable";
    elements.status.textContent = "Disponível após a análise geométrica e a confirmação da unidade.";
    elements.weight.textContent = "—";
    elements.time.textContent = "Após análise";
    elements.profile.textContent = "A1 mini · PLA · 0,20 mm";
    elements.retry.hidden = true;
    clearFeedback();
    onStateChange({ status: "unavailable" });
  }

  function showWaitingUnit() {
    root.dataset.manufacturingState = "waiting_unit";
    elements.status.textContent = "Confirme a unidade física do modelo para iniciar a estimativa.";
    elements.retry.hidden = true;
    clearFeedback();
    onStateChange({ status: "waiting_unit" });
  }

  function showPreparing() {
    root.dataset.manufacturingState = "preparing";
    elements.status.textContent = "Preparando o modelo…";
    elements.retry.hidden = true;
    clearFeedback();
    onStateChange({ status: "preparing" });
  }

  function showProcessing() {
    root.dataset.manufacturingState = "processing";
    elements.status.textContent = "Calculando tempo e material…";
    elements.retry.hidden = true;
    clearFeedback();
    onStateChange({ status: "processing" });
  }

  function showEstimate(estimate) {
    root.dataset.manufacturingState = "ready";
    elements.status.textContent = "Tempo e material calculados.";
    elements.weight.textContent = formatWeight(estimate.weightGrams);
    elements.time.textContent = formatDuration(estimate.printTimeSeconds);
    elements.profile.textContent = estimate.profile.label;
    elements.retry.hidden = true;
    clearFeedback();
    onStateChange({ status: "completed", estimate });
  }

  function showError(code, { prepared = true } = {}) {
    const presentation = getManufacturingErrorPresentation(code);
    root.dataset.manufacturingState = "error";
    root.dataset.manufacturingErrorKind = presentation.kind;
    elements.status.textContent = MANUFACTURING_FALLBACK_MESSAGE;
    elements.feedback.hidden = false;
    elements.errorTitle.textContent = presentation.title;
    elements.errorDescription.textContent = presentation.description;
    elements.retry.hidden = false;
    onStateChange({
      status: "failed",
      errorCode: code,
      prepared,
      presentation
    });
  }

  function getQuantity() {
    const quantity = Number(elements.quantity.value);
    return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000 ? quantity : 1;
  }

  function clearFeedback() {
    root.dataset.manufacturingErrorKind = "";
    elements.feedback.hidden = true;
    elements.errorTitle.textContent = "";
    elements.errorDescription.textContent = "";
  }

  reset();
  return Object.freeze({
    bind,
    reset,
    showWaitingUnit,
    showPreparing,
    showProcessing,
    showEstimate,
    showError,
    getQuantity
  });
}

export function formatDuration(totalSeconds) {
  if (!Number.isSafeInteger(totalSeconds) || totalSeconds <= 0) return "—";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""]
    .filter(Boolean)
    .join(" ");
}

export function formatWeight(value) {
  return Number.isFinite(value)
    ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} g`
    : "—";
}

function getElements(root) {
  const selectors = {
    quantity: "[data-manufacturing-quantity]",
    weight: "[data-manufacturing-weight]",
    time: "[data-manufacturing-time]",
    profile: "[data-manufacturing-profile]",
    status: "[data-manufacturing-status]",
    retry: "[data-manufacturing-retry]",
    feedback: "[data-manufacturing-feedback]",
    errorTitle: "[data-manufacturing-error-title]",
    errorDescription: "[data-manufacturing-error-description]"
  };
  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
    return [key, element];
  }));
}
