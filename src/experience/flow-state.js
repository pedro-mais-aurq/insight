import { UPLOAD_STATES } from "../state/upload-state.js";
import { MANUFACTURING_UI_CONFIG } from "../config/manufacturing-ui.config.js";

export const REFERENCE_BUILD_VOLUME_MM = MANUFACTURING_UI_CONFIG.referenceBuildVolumeMm;

export const FLOW_STEP_STATES = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  COMPLETED: "completed",
  WARNING: "warning",
  FAILED: "failed"
});

export const FLOW_STEP_IDS = Object.freeze([
  "upload",
  "analysis",
  "preparation",
  "manufacturing",
  "pricing"
]);

const DEFAULT_MESSAGES = Object.freeze({
  upload: "Aguardando arquivo",
  analysis: "Aguardando o envio",
  preparation: "Aguardando a análise",
  manufacturing: "Aguardando o preparo",
  pricing: "Aguardando a estimativa"
});

export function createInitialFlowState() {
  return {
    steps: Object.fromEntries(
      FLOW_STEP_IDS.map((id) => [id, createStep(DEFAULT_MESSAGES[id])])
    ),
    capacityWarning: null,
    visible: false,
    slowAnalysis: false
  };
}

export function applyUploadFlowState(current, uploadState) {
  const status = uploadState?.status;
  let next = cloneFlow(current ?? createInitialFlowState());

  if ([
    UPLOAD_STATES.IDLE,
    UPLOAD_STATES.SELECTED,
    UPLOAD_STATES.VALIDATING,
    UPLOAD_STATES.INVALID,
    UPLOAD_STATES.UPLOADING,
    UPLOAD_STATES.UPLOAD_ERROR
  ].includes(status)) {
    next = createInitialFlowState();
  }

  switch (status) {
    case UPLOAD_STATES.IDLE:
      return next;
    case UPLOAD_STATES.SELECTED:
      next.steps.upload = createStep("Arquivo selecionado", FLOW_STEP_STATES.ACTIVE);
      break;
    case UPLOAD_STATES.VALIDATING:
      next.steps.upload = createStep(
        "Validando o arquivo",
        FLOW_STEP_STATES.ACTIVE,
        { kind: "indeterminate" }
      );
      break;
    case UPLOAD_STATES.INVALID:
      next.steps.upload = createStep("Revise o arquivo selecionado", FLOW_STEP_STATES.FAILED);
      break;
    case UPLOAD_STATES.UPLOADING:
      next.steps.upload = createStep(
        "Enviando seu modelo",
        FLOW_STEP_STATES.ACTIVE,
        getUploadProgress(uploadState.upload?.progress)
      );
      break;
    case UPLOAD_STATES.UPLOAD_ERROR:
      resetAfterUpload(next);
      next.steps.upload = createStep("Não foi possível concluir o envio", FLOW_STEP_STATES.FAILED);
      break;
    case UPLOAD_STATES.UPLOADED:
      resetAfterUpload(next);
      next.steps.upload = createStep("Arquivo recebido", FLOW_STEP_STATES.COMPLETED);
      break;
    case UPLOAD_STATES.ANALYZING:
      resetAfterUpload(next);
      next.visible = true;
      next.steps.upload = createStep("Arquivo recebido", FLOW_STEP_STATES.COMPLETED);
      next.steps.analysis = createStep(
        "Analisando a geometria",
        FLOW_STEP_STATES.ACTIVE,
        { kind: "indeterminate" }
      );
      break;
    case UPLOAD_STATES.ANALYSIS_ERROR:
      resetAfterUpload(next);
      next.visible = true;
      next.steps.upload = createStep("Arquivo recebido", FLOW_STEP_STATES.COMPLETED);
      next.steps.analysis = createStep("Não foi possível concluir a análise", FLOW_STEP_STATES.FAILED);
      break;
    case UPLOAD_STATES.READY: {
      resetAfterUpload(next);
      next.visible = true;
      const analysis = uploadState.analysis?.result;
      const unitConfirmed = analysis?.unit?.confirmed === true;
      const capacityWarning = getPhysicalCapacityWarning(analysis);
      next.steps.upload = createStep("Arquivo recebido", FLOW_STEP_STATES.COMPLETED);
      next.steps.analysis = createStep(
        unitConfirmed ? "Geometria analisada" : "Confirme a unidade física",
        unitConfirmed ? FLOW_STEP_STATES.COMPLETED : FLOW_STEP_STATES.WARNING,
        null,
        Boolean(capacityWarning)
      );
      next.capacityWarning = capacityWarning;
      break;
    }
    default:
      break;
  }

  return next;
}

export function setFlowSlowAnalysis(current, visible) {
  return {
    ...cloneFlow(current ?? createInitialFlowState()),
    slowAnalysis: visible === true
  };
}

export function applyManufacturingFlowState(current, event = {}) {
  const next = cloneFlow(current ?? createInitialFlowState());

  switch (event.status) {
    case "waiting_unit":
      resetManufacturing(next);
      next.steps.preparation = createStep(
        "Confirme a unidade para continuar",
        FLOW_STEP_STATES.WARNING
      );
      break;
    case "preparing":
      resetManufacturing(next);
      next.steps.preparation = createStep(
        "Preparando o modelo",
        FLOW_STEP_STATES.ACTIVE,
        { kind: "indeterminate" }
      );
      break;
    case "processing":
      resetPricing(next);
      next.steps.preparation = createStep("Modelo preparado", FLOW_STEP_STATES.COMPLETED);
      next.steps.manufacturing = createStep(
        "Calculando tempo e material",
        FLOW_STEP_STATES.ACTIVE,
        { kind: "indeterminate" }
      );
      break;
    case "completed":
      resetPricing(next);
      next.steps.preparation = createStep("Modelo preparado", FLOW_STEP_STATES.COMPLETED);
      next.steps.manufacturing = createStep(
        "Tempo e material calculados",
        FLOW_STEP_STATES.COMPLETED
      );
      break;
    case "failed":
      resetPricing(next);
      next.steps.preparation = createStep(
        event.prepared === false ? "Não foi possível preparar a estimativa" : "Modelo preparado",
        event.prepared === false ? FLOW_STEP_STATES.FAILED : FLOW_STEP_STATES.COMPLETED
      );
      next.steps.manufacturing = createStep(
        event.message || "Não foi possível concluir automaticamente",
        event.prepared === false ? FLOW_STEP_STATES.PENDING : FLOW_STEP_STATES.FAILED
      );
      break;
    case "unavailable":
      resetManufacturing(next);
      break;
    default:
      break;
  }

  return next;
}

export function applyPricingFlowState(current, event = {}) {
  const next = cloneFlow(current ?? createInitialFlowState());

  switch (event.status) {
    case "processing":
      next.steps.pricing = createStep(
        "Calculando o valor",
        FLOW_STEP_STATES.ACTIVE,
        { kind: "indeterminate" }
      );
      break;
    case "completed":
      next.steps.pricing = createStep("Valor estimado", FLOW_STEP_STATES.COMPLETED);
      break;
    case "failed":
      next.steps.pricing = createStep("Não foi possível calcular o valor", FLOW_STEP_STATES.FAILED);
      break;
    case "unavailable":
      resetPricing(next);
      break;
    default:
      break;
  }

  return next;
}

export function getPhysicalCapacityWarning(analysis) {
  if (analysis?.unit?.confirmed !== true) {
    return null;
  }

  const dimensions = analysis.physicalMetrics?.dimensionsMm;
  if (!hasReliableDimensions(dimensions)) {
    return null;
  }

  if (![dimensions.x, dimensions.y, dimensions.z].some(
    (value) => value > REFERENCE_BUILD_VOLUME_MM
  )) {
    return null;
  }

  return Object.freeze({
    kind: "physical_reference",
    title: "Este modelo excede o volume padrão da impressora de referência",
    description: "A produção pode exigir divisão do modelo, ajuste de escala ou outra configuração. Consulte a Insight para avaliarmos a melhor opção.",
    limitMm: REFERENCE_BUILD_VOLUME_MM,
    dimensions: Object.freeze({
      x: dimensions.x,
      y: dimensions.y,
      z: dimensions.z
    })
  });
}

function createStep(message, state = FLOW_STEP_STATES.PENDING, progress = null, warning = false) {
  return { state, message, progress, warning };
}

function getUploadProgress(value) {
  return Number.isFinite(value) && value > 0 && value < 100
    ? { kind: "determinate", value: Math.round(value) }
    : { kind: "indeterminate" };
}

function hasReliableDimensions(dimensions) {
  return [dimensions?.x, dimensions?.y, dimensions?.z].every(
    (value) => Number.isFinite(value) && value > 0
  );
}

function cloneFlow(flow) {
  return {
    ...flow,
    steps: Object.fromEntries(
      FLOW_STEP_IDS.map((id) => [id, { ...flow.steps[id] }])
    )
  };
}

function resetAfterUpload(flow) {
  const initial = createInitialFlowState();
  flow.steps.analysis = initial.steps.analysis;
  flow.capacityWarning = null;
  resetManufacturing(flow);
}

function resetManufacturing(flow) {
  const initial = createInitialFlowState();
  flow.steps.preparation = initial.steps.preparation;
  flow.steps.manufacturing = initial.steps.manufacturing;
  resetPricing(flow);
}

function resetPricing(flow) {
  flow.steps.pricing = createStep(DEFAULT_MESSAGES.pricing);
}
