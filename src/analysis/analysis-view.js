import { UPLOAD_STATES } from "../state/upload-state.js";
import { ANALYSIS_ERROR_CODES } from "./analysis-errors.js";

const ANALYSIS_ERROR_MESSAGES = Object.freeze({
  [ANALYSIS_ERROR_CODES.PARSE_FAILED]: "Não foi possível interpretar a estrutura do arquivo. Envie outro modelo.",
  [ANALYSIS_ERROR_CODES.NO_GEOMETRY]: "O arquivo não contém geometria utilizável. Envie outro modelo.",
  [ANALYSIS_ERROR_CODES.NO_TRIANGLES]: "O modelo não contém triângulos válidos. Envie outro modelo.",
  [ANALYSIS_ERROR_CODES.UNSUPPORTED_STRUCTURE]: "A estrutura deste modelo não é suportada. Envie outro modelo.",
  [ANALYSIS_ERROR_CODES.INVALID_COORDINATES]: "O modelo possui coordenadas inválidas. Envie outro modelo.",
  [ANALYSIS_ERROR_CODES.ANALYSIS_WORKER_FAILED]: "A verificação geométrica foi interrompida.",
  [ANALYSIS_ERROR_CODES.ANALYSIS_START_FAILED]: "Não foi possível iniciar a análise no servidor.",
  [ANALYSIS_ERROR_CODES.ANALYSIS_SAVE_FAILED]: "Não foi possível salvar o resultado da análise.",
  [ANALYSIS_ERROR_CODES.RATE_LIMITED]: "Muitas análises foram solicitadas. Aguarde antes de tentar novamente.",
  [ANALYSIS_ERROR_CODES.UPLOAD_EXPIRED]: "Este arquivo não está mais disponível porque o período de retenção terminou. Envie o arquivo novamente.",
  [ANALYSIS_ERROR_CODES.UPLOAD_STATE_INVALID]: "Este arquivo está indisponível para análise. Faça um novo envio."
});

const ANALYSIS_WARNING_MESSAGES = Object.freeze({
  UNIT_UNKNOWN: "confirme a unidade física do modelo",
  DEGENERATE_TRIANGLES: "há triângulos degenerados",
  OPEN_EDGES: "há arestas abertas",
  NON_MANIFOLD_EDGES: "há arestas non-manifold",
  MULTIPLE_COMPONENTS: "há componentes desconectados",
  TOPOLOGY_SKIPPED_COMPLEXITY: "a topologia completa não foi verificada devido à complexidade",
  VOLUME_UNRELIABLE: "o volume não é confiável"
});

export function createAnalysisView(root) {
  const elements = getElements(root);
  let bound = false;
  let viewerUnavailable = false;

  function bind({ onRetry, onUnitChange }) {
    if (bound) {
      return;
    }

    bound = true;
    elements.retry.addEventListener("click", () => onRetry());
    elements.unit.addEventListener("change", () => {
      if (elements.unit.value) {
        onUnitChange(elements.unit.value);
      }
    });
  }

  function render(state) {
    const visible = [
      UPLOAD_STATES.ANALYZING,
      UPLOAD_STATES.READY,
      UPLOAD_STATES.ANALYSIS_ERROR
    ].includes(state.status);

    elements.panel.hidden = !visible;

    if (!visible) {
      clearResult(elements);
      return;
    }

    const isAnalyzing = state.status === UPLOAD_STATES.ANALYZING;
    const isReady = state.status === UPLOAD_STATES.READY;
    const isError = state.status === UPLOAD_STATES.ANALYSIS_ERROR;
    elements.stage.hidden = !isAnalyzing;
    elements.stage.textContent = stageMessage(state.analysis?.stage);
    elements.retry.hidden = !shouldShowAnalysisRetry(state);
    elements.error.hidden = !isError;
    elements.error.textContent = isError
      ? getAnalysisErrorMessage(state.error?.code)
      : "";
    elements.result.hidden = !isReady;
    elements.unit.disabled = !isReady;
    elements.viewer.hidden = !isReady || viewerUnavailable;
    elements.viewerUnavailable.hidden = !isReady || !viewerUnavailable;

    if (isReady && state.analysis?.result) {
      renderResult(elements, state.analysis.result);
    }
  }

  function setViewerUnavailable(unavailable) {
    viewerUnavailable = unavailable;
    elements.viewerUnavailable.hidden = !unavailable;
    elements.viewer.hidden = unavailable;
  }

  return Object.freeze({ bind, render, setViewerUnavailable });
}

export function formatLengthMm(value) {
  return Number.isFinite(value) ? `${formatNumber(value)} mm` : "—";
}

export function formatAreaMm2(value) {
  return Number.isFinite(value) ? `${formatNumber(value / 100)} cm²` : "—";
}

export function formatVolumeMm3(value) {
  return Number.isFinite(value) ? `${formatNumber(value / 1000)} cm³` : "—";
}

export function formatCount(value) {
  return Number.isSafeInteger(value)
    ? new Intl.NumberFormat("pt-BR").format(value)
    : "—";
}

export function integrityLabel(value) {
  if (value === true) {
    return "OK";
  }

  if (value === false) {
    return "ATENÇÃO";
  }

  return "NÃO VERIFICADO";
}

export function getAnalysisErrorMessage(code) {
  return ANALYSIS_ERROR_MESSAGES[code]
    ?? "Não foi possível concluir a análise do modelo.";
}

export function getAnalysisWarningMessage(code) {
  return ANALYSIS_WARNING_MESSAGES[code] ?? "há uma advertência geométrica";
}

export function shouldShowAnalysisRetry(state) {
  return state.status === UPLOAD_STATES.ANALYSIS_ERROR
    && state.error?.retryable === true;
}

function renderResult(elements, analysis) {
  const physical = analysis.physicalMetrics;
  const dimensions = physical?.dimensionsMm;
  elements.unit.value = analysis.unit?.value ?? "";
  elements.dimensions.textContent = dimensions
    ? [dimensions.x, dimensions.y, dimensions.z].map(formatLengthMm).join(" × ")
    : "Unidade física não definida";
  elements.triangles.textContent = formatCount(analysis.geometry.triangleCount);
  elements.meshes.textContent = formatCount(analysis.geometry.meshCount);
  elements.vertices.textContent = formatCount(analysis.geometry.rawVertexCount);
  elements.area.textContent = physical
    ? formatAreaMm2(physical.surfaceAreaMm2)
    : "Unidade desconhecida";
  elements.volume.textContent = physical && analysis.volumeReliable
    ? formatVolumeMm3(physical.volumeMm3)
    : "Indisponível ou não confiável";
  elements.watertight.textContent = integrityLabel(analysis.topology.watertight);
  elements.openEdges.textContent = formatCount(analysis.topology.openEdgeCount);
  elements.nonManifold.textContent = formatCount(
    analysis.topology.nonManifoldEdgeCount
  );
  elements.components.textContent = formatCount(
    analysis.topology.connectedComponentCount
  );
  elements.warnings.hidden = analysis.warnings.length === 0;
  elements.warnings.textContent = analysis.warnings.length > 0
    ? `Atenção: ${analysis.warnings.map(getAnalysisWarningMessage).join("; ")}.`
    : "";
}

function stageMessage(stage) {
  const messages = {
    reading: "Lendo geometria…",
    normalizing: "Normalizando o modelo…",
    topology: "Verificando malha…"
  };

  return messages[stage] ?? "Analisando modelo…";
}

function clearResult(elements) {
  elements.stage.textContent = "";
  elements.error.textContent = "";
  elements.warnings.textContent = "";
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2
  }).format(value);
}

function getElements(root) {
  const selectors = {
    panel: "[data-analysis-panel]",
    stage: "[data-analysis-stage]",
    error: "[data-analysis-error]",
    retry: "[data-analysis-retry]",
    result: "[data-analysis-result]",
    unit: "[data-analysis-unit]",
    dimensions: "[data-analysis-dimensions]",
    triangles: "[data-analysis-triangles]",
    meshes: "[data-analysis-meshes]",
    vertices: "[data-analysis-vertices]",
    area: "[data-analysis-area]",
    volume: "[data-analysis-volume]",
    watertight: "[data-analysis-watertight]",
    openEdges: "[data-analysis-open-edges]",
    nonManifold: "[data-analysis-non-manifold]",
    components: "[data-analysis-components]",
    warnings: "[data-analysis-warnings]",
    viewer: "[data-model-viewer]",
    viewerUnavailable: "[data-viewer-unavailable]"
  };

  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
    const element = root.querySelector(selector);

    if (!element) {
      throw new Error(`Elemento obrigatório ausente: ${selector}`);
    }

    return [key, element];
  }));
}
