import { MANUFACTURING_UI_CONFIG } from "../config/manufacturing-ui.config.js";

const WHATSAPP_BASE_URL = "https://wa.me";
const FORBIDDEN_PLACEHOLDER = /^(?:undefined|null|nan)$/i;
const VITE_WHATSAPP_NUMBER= "554396522539";

export function normalizeWhatsAppNumber(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

export function buildWhatsAppUrl({ number, message }) {
  const normalizedNumber = normalizeWhatsAppNumber(number);
  const normalizedMessage = cleanMessage(message);

  if (!normalizedNumber || !normalizedMessage) {
    return null;
  }

  return `${WHATSAPP_BASE_URL}/${normalizedNumber}?text=${encodeURIComponent(normalizedMessage)}`;
}

export function buildWhatsAppMessage(context = {}) {
  const filename = cleanText(context.filename);
  const format = cleanText(context.format)?.toUpperCase() ?? "";
  const material = cleanText(context.material);
  const dimensions = normalizeDimensions(context.dimensions);
  const layerHeightMm = positiveFinite(context.layerHeightMm);
  const weightGrams = positiveFinite(context.weightGrams);
  const printTimeSeconds = positiveInteger(context.printTimeSeconds);
  const price = normalizePrice(context.price);
  const isCompleted = context.estimateStatus === "completed";
  const isFailed = context.estimateStatus === "failed";
  const hasPhysicalWarning = context.capacityWarning?.kind === "physical_reference";
  const exceedsAutomaticLimit = context.errorCode === "MODEL_OUTSIDE_BUILD_VOLUME";
  const intro = filename
    ? `Olá! Gostaria de consultar a impressão do arquivo ${filename}.`
    : "Olá! Gostaria de consultar a impressão de um modelo 3D.";
  const sections = [intro];
  const facts = [];

  if (isCompleted) {
    sections.push("A Insight calculou aproximadamente:");
  } else if (isFailed) {
    sections.push(
      "A análise do modelo foi concluída, mas a estimativa automática de fabricação não pôde ser finalizada."
    );
  }

  if (dimensions) {
    facts.push(`Dimensões: ${formatDimensions(dimensions)}`);
  }
  if (format) {
    facts.push(`Formato: ${format}`);
  }
  if (material) {
    facts.push(`${isCompleted ? "Material" : "Material de referência"}: ${material}`);
  }
  if (layerHeightMm) {
    facts.push(
      `${isCompleted ? "Camada" : "Camada de referência"}: ${formatDecimal(layerHeightMm)} mm`
    );
  }
  if (weightGrams) {
    facts.push(`Peso estimado: ${formatDecimal(weightGrams)} g`);
  }
  if (printTimeSeconds) {
    facts.push(`Tempo estimado: ${formatDuration(printTimeSeconds)}`);
  }
  if (price) {
    facts.push(`Valor estimado: ${formatPrice(price)}`);
  }
  if (facts.length > 0) {
    sections.push(facts.join("\n"));
  }

  if (exceedsAutomaticLimit) {
    sections.push(
      "Este modelo excede o limite suportado pela estimativa automática. Gostaria de receber uma análise personalizada da Insight."
    );
  } else if (hasPhysicalWarning) {
    const limit = context.capacityWarning?.limitMm
      ?? MANUFACTURING_UI_CONFIG.referenceBuildVolumeMm;
    sections.push(
      `O modelo excede o volume padrão de ${limit} × ${limit} × ${limit} mm da impressora de referência. Gostaria de avaliar a possibilidade de divisão, ajuste de escala ou outra estratégia de produção.`
    );
  } else if (isFailed) {
    sections.push("Gostaria de receber uma avaliação personalizada da Insight.");
  } else {
    sections.push("Gostaria de conversar sobre a produção deste modelo.");
  }

  return sections.filter(Boolean).join("\n\n");
}

export function createWhatsAppView(root, { number } = {}) {
  if (!root) {
    return Object.freeze({ render() {} });
  }

  const panel = requiredElement(root, "[data-whatsapp-panel]");
  const summary = requiredElement(root, "[data-whatsapp-summary]");
  const configWarning = requiredElement(root, "[data-whatsapp-config-warning]");
  const links = Array.from(root.querySelectorAll("[data-whatsapp-link]"));

  if (links.length === 0) {
    throw new Error("Elemento obrigatório ausente: [data-whatsapp-link]");
  }

  function render(context = {}) {
    const hasUsefulContext = context.contactAvailable !== false && Boolean(
      cleanText(context.filename)
      || normalizeDimensions(context.dimensions)
      || context.estimateStatus === "failed"
      || context.estimateStatus === "completed"
    );
    const message = buildWhatsAppMessage(context);
    const url = buildWhatsAppUrl({ number, message });

    panel.hidden = !hasUsefulContext;
    panel.dataset.whatsappState = url ? "ready" : "unconfigured";
    summary.textContent = getContactSummary(context);
    configWarning.hidden = Boolean(url);

    for (const link of links) {
      if (url) {
        link.href = url;
        link.removeAttribute("aria-disabled");
        link.removeAttribute("tabindex");
      } else {
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "-1");
      }
    }
  }

  return Object.freeze({ render });
}

function getContactSummary(context) {
  if (context.errorCode === "MODEL_OUTSIDE_BUILD_VOLUME") {
    return "A estimativa automática atingiu seu limite. Solicite uma análise personalizada.";
  }
  if (context.estimateStatus === "failed") {
    return "A estimativa automática não terminou, mas você ainda pode solicitar uma análise personalizada.";
  }
  if (context.capacityWarning?.kind === "physical_reference") {
    return "Este tamanho pode exigir divisão, ajuste de escala ou outra configuração de produção.";
  }
  if (context.estimateStatus === "completed") {
    return "Envie os dados calculados e converse com a Insight sobre a produção.";
  }

  return "Continue a conversa com as informações já disponíveis sobre o modelo.";
}

function requiredElement(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return element;
}

function normalizeDimensions(value) {
  const dimensions = {
    x: positiveFinite(value?.x),
    y: positiveFinite(value?.y),
    z: positiveFinite(value?.z)
  };

  return dimensions.x && dimensions.y && dimensions.z ? dimensions : null;
}

function normalizePrice(value) {
  if (!value || !Number.isFinite(value.totalPrice) || value.totalPrice < 0) {
    return null;
  }

  return {
    totalPrice: value.totalPrice,
    currency: cleanText(value.currency) || "BRL"
  };
}

function formatDimensions(dimensions) {
  return [dimensions.x, dimensions.y, dimensions.z]
    .map((value) => formatDecimal(value))
    .join(" × ") + " mm";
}

function formatDecimal(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2
  }).format(value);
}

function formatDuration(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.ceil((totalSeconds % 3600) / 60);

  return [
    days ? `${days} d` : "",
    hours ? `${hours} h` : "",
    minutes ? `${minutes} min` : ""
  ].filter(Boolean).join(" ");
}

function formatPrice(price) {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: price.currency
    }).format(price.totalPrice);
  } catch {
    return formatDecimal(price.totalPrice);
  }
}

function positiveFinite(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function cleanText(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const text = String(value).replace(/[\r\n\t]+/g, " ").trim();
  return !text || FORBIDDEN_PLACEHOLDER.test(text) ? "" : text.slice(0, 180);
}

function cleanMessage(value) {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();
  return !text || FORBIDDEN_PLACEHOLDER.test(text) ? "" : text.slice(0, 4000);
}
