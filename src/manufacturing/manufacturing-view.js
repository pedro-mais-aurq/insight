const ERROR_MESSAGES = Object.freeze({
  UPLOAD_EXPIRED: "O arquivo expirou. Envie-o novamente.",
  MANUFACTURING_PROFILE_UNAVAILABLE: "O perfil de fabricação está temporariamente indisponível.",
  MODEL_UNIT_REQUIRED: "Confirme a unidade física para continuar.",
  MODEL_UNIT_INVALID: "A unidade informada não corresponde ao modelo.",
  MODEL_NOT_SLICEABLE: "O modelo não pôde ser preparado com segurança para fabricação.",
  MODEL_OUTSIDE_BUILD_VOLUME: "O modelo não cabe no volume de impressão da A1 mini.",
  MODEL_TOO_COMPLEX: "O modelo é complexo demais para o limite operacional atual.",
  SLICER_PROFILE_INVALID: "O perfil técnico do slicer é inválido.",
  SLICER_PROFILE_MISMATCH: "O perfil técnico do worker não corresponde ao perfil aprovado.",
  SLICER_OUTPUT_INVALID: "O slicer não produziu peso e tempo confiáveis.",
  SLICER_UNAVAILABLE: "O serviço de fabricação está temporariamente indisponível.",
  SLICER_TIMEOUT: "O cálculo excedeu o tempo operacional. Tente novamente.",
  SLICER_DOWNLOAD_FAILED: "O worker não conseguiu acessar o arquivo temporário.",
  MANUFACTURING_START_FAILED: "Não foi possível iniciar a estimativa agora.",
  MANUFACTURING_SAVE_FAILED: "A estimativa foi calculada, mas não pôde ser salva.",
  WORKER_BUSY: "O serviço de fabricação está ocupado. Tente novamente em instantes.",
  RATE_LIMITED: "Muitas estimativas foram solicitadas. Aguarde e tente novamente."
});

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

  function showError(code) {
    root.dataset.manufacturingState = "error";
    elements.status.textContent = ERROR_MESSAGES[code] ?? "Não foi possível concluir a estimativa técnica agora.";
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
