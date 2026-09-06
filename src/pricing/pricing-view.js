const UNAVAILABLE_MESSAGE = "Estimativa disponível após análise de produção.";

export function initPricingView(root = document.querySelector("[data-pricing-root]")) {
  if (!root) return null;

  const status = root.querySelector("[data-pricing-status]");
  const price = root.querySelector("[data-pricing-price]");

  showUnavailable();

  return Object.freeze({ showUnavailable, showEstimate, showError });

  function showUnavailable() {
    root.dataset.pricingState = "unavailable";
    status.textContent = UNAVAILABLE_MESSAGE;
    price.hidden = true;
    price.textContent = "";
  }

  function showEstimate(estimate) {
    root.dataset.pricingState = "ready";
    status.textContent = `${estimate.quantity} ${estimate.quantity === 1 ? "peça" : "peças"}`;
    price.textContent = formatCurrency(estimate.totalPrice, estimate.currency);
    price.hidden = false;
  }

  function showError() {
    root.dataset.pricingState = "error";
    status.textContent = "Não foi possível obter a estimativa agora.";
    price.hidden = true;
    price.textContent = "";
  }
}

export function formatCurrency(value, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency
  }).format(value);
}

export { UNAVAILABLE_MESSAGE };
