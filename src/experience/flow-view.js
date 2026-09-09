import { FLOW_STEP_IDS, FLOW_STEP_STATES } from "./flow-state.js";

const MARKERS = Object.freeze({
  [FLOW_STEP_STATES.PENDING]: "○",
  [FLOW_STEP_STATES.ACTIVE]: "●",
  [FLOW_STEP_STATES.COMPLETED]: "✓",
  [FLOW_STEP_STATES.WARNING]: "!",
  [FLOW_STEP_STATES.FAILED]: "×"
});

export function createFlowView(root) {
  if (!root) {
    return Object.freeze({ render() {} });
  }

  const steps = Object.fromEntries(FLOW_STEP_IDS.map((id) => {
    const element = requiredElement(root, `[data-flow-step="${id}"]`);
    return [id, {
      element,
      marker: requiredElement(element, "[data-flow-marker]"),
      message: requiredElement(element, "[data-flow-message]"),
      warning: requiredElement(element, "[data-flow-step-warning]"),
      progress: requiredElement(element, "[data-flow-progress]"),
      progressFill: requiredElement(element, "[data-flow-progress-fill]"),
      progressValue: requiredElement(element, "[data-flow-progress-value]")
    }];
  }));
  const warning = requiredElement(root, "[data-capacity-warning]");
  const warningTitle = requiredElement(warning, "[data-capacity-warning-title]");
  const warningDescription = requiredElement(warning, "[data-capacity-warning-description]");
  const slowAnalysisNotice = requiredElement(root, "[data-slow-analysis-notice]");

  function render(flow) {
    root.hidden = flow.visible !== true;
    for (const id of FLOW_STEP_IDS) {
      renderStep(steps[id], flow.steps[id]);
    }
    renderCapacityWarning({ warning, warningTitle, warningDescription }, flow.capacityWarning);
    slowAnalysisNotice.hidden = flow.slowAnalysis !== true;
  }

  return Object.freeze({ render });
}

export function getProgressAccessibility(progress) {
  if (progress?.kind === "determinate" && Number.isFinite(progress.value)) {
    return {
      valueNow: String(Math.max(0, Math.min(100, Math.round(progress.value)))),
      valueText: `${Math.max(0, Math.min(100, Math.round(progress.value)))}%`
    };
  }

  return { valueNow: null, valueText: "" };
}

function renderStep(elements, step) {
  elements.element.dataset.stepState = step.state;
  elements.element.dataset.stepWarning = String(step.warning === true);
  elements.marker.textContent = MARKERS[step.state] ?? MARKERS.pending;
  elements.message.textContent = step.message;
  elements.warning.hidden = step.warning !== true;
  renderProgress(elements, step);
}

function renderProgress(elements, step) {
  const visible = step.state === FLOW_STEP_STATES.ACTIVE && Boolean(step.progress);
  elements.progress.hidden = !visible;
  elements.progress.dataset.progressKind = step.progress?.kind ?? "none";
  const accessibility = getProgressAccessibility(step.progress);

  if (accessibility.valueNow !== null) {
    elements.progress.setAttribute("aria-valuenow", accessibility.valueNow);
    elements.progressFill.style.width = `${accessibility.valueNow}%`;
  } else {
    elements.progress.removeAttribute("aria-valuenow");
    elements.progressFill.style.removeProperty("width");
  }
  elements.progressValue.textContent = accessibility.valueText;
}

function renderCapacityWarning(elements, capacityWarning) {
  elements.warning.hidden = !capacityWarning;
  elements.warningTitle.textContent = capacityWarning?.title ?? "";
  elements.warningDescription.textContent = capacityWarning?.description ?? "";
}

function requiredElement(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return element;
}
