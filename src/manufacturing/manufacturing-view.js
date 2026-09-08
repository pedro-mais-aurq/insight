export const MANUFACTURING_FALLBACK_MESSAGE = "não conseguimos estipular os valores mínimos, favor consultar a insight no whatsapp";

export function createManufacturingView(root) {
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
  }

  function showWaitingUnit() {
    root.dataset.manufacturingState = "waiting_unit";
    elements.status.textContent = "Confirme a unidade física do modelo para iniciar o slicing.";
    elements.retry.hidden = true;
  }

  function showProcessing() {
    root.dataset.manufacturingState = "processing";
    elements.status.textContent = "Calculando material e tempo com OrcaSlicer 2.4.2…";
    elements.retry.hidden = true;
  }

  function showEstimate(estimate) {
    root.dataset.manufacturingState = "ready";
    elements.status.textContent = "Estimativa técnica concluída.";
    elements.weight.textContent = formatWeight(estimate.weightGrams);
    elements.time.textContent = formatDuration(estimate.printTimeSeconds);
    elements.profile.textContent = estimate.profile.label;
    elements.retry.hidden = true;
  }

  function showError() {
    root.dataset.manufacturingState = "error";
    elements.status.textContent = MANUFACTURING_FALLBACK_MESSAGE;
    elements.retry.hidden = false;
  }

  function getQuantity() {
    const quantity = Number(elements.quantity.value);
    return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1000 ? quantity : 1;
  }

  reset();
  return Object.freeze({ bind, reset, showWaitingUnit, showProcessing, showEstimate, showError, getQuantity });
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
    retry: "[data-manufacturing-retry]"
  };
  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
    const element = root.querySelector(selector);
    if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
    return [key, element];
  }));
}
