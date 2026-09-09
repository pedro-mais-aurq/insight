import { CONTACT_CONFIG } from "../config/contact.config.js";
import { createWhatsAppView } from "../contact/whatsapp.js";
import { getManufacturingErrorPresentation } from "../manufacturing/manufacturing-error-presentation.js";
import {
  applyManufacturingFlowState,
  applyPricingFlowState,
  applyUploadFlowState,
  createInitialFlowState,
  setFlowSlowAnalysis
} from "./flow-state.js";
import { createFlowView } from "./flow-view.js";
import { createLongRunningAnalysisJourney } from "./long-running-analysis.js";

export function createEstimateExperience({
  flowRoot,
  contactRoot,
  contactConfig = CONTACT_CONFIG
}) {
  const flowView = createFlowView(flowRoot);
  const whatsappView = createWhatsAppView(contactRoot, {
    number: contactConfig.whatsappNumber
  });
  let flow = createInitialFlowState();
  let context = createInitialContext(contactConfig);
  const longRunningJourney = createLongRunningAnalysisJourney({
    onChange(visible) {
      flow = setFlowSlowAnalysis(flow, visible);
      render();
    }
  });

  function onUploadState(state) {
    flow = applyUploadFlowState(flow, state);

    longRunningJourney.onUploadState(state?.status);

    if (state?.status === "idle") {
      context = createInitialContext(contactConfig);
    } else {
      context = {
        ...context,
        filename: state?.originalName ?? context.filename,
        format: state?.analysis?.result?.format ?? state?.extension ?? context.format,
        contactAvailable: ["ready", "analysis_error"].includes(
          state?.status
        )
      };

      if (state?.status === "ready") {
        context = {
          ...createInitialContext(contactConfig),
          filename: state.originalName,
          format: state.analysis?.result?.format ?? state.extension,
          dimensions: flow.capacityWarning?.dimensions
            ?? reliableDimensions(state.analysis?.result?.physicalMetrics?.dimensionsMm),
          capacityWarning: flow.capacityWarning,
          contactAvailable: true
        };
      }
    }

    render();
  }

  function onManufacturingState(event = {}) {
    const presentation = event.status === "failed"
      ? getManufacturingErrorPresentation(event.errorCode)
      : null;
    flow = applyManufacturingFlowState(flow, {
      ...event,
      message: presentation?.title
    });
    longRunningJourney.onManufacturingState(event.status);

    if (["preparing", "processing"].includes(event.status)) {
      context = {
        ...context,
        estimateStatus: "processing",
        errorCode: null,
        weightGrams: null,
        printTimeSeconds: null,
        price: null
      };
    } else if (event.status === "completed") {
      context = {
        ...context,
        estimateStatus: "completed",
        errorCode: null,
        weightGrams: event.estimate?.weightGrams ?? null,
        printTimeSeconds: event.estimate?.printTimeSeconds ?? null,
        material: event.estimate?.profile?.material ?? context.material,
        layerHeightMm: event.estimate?.profile?.layerHeightMm ?? context.layerHeightMm
      };
    } else if (event.status === "failed") {
      context = {
        ...context,
        estimateStatus: "failed",
        errorCode: event.errorCode ?? null,
        weightGrams: null,
        printTimeSeconds: null,
        price: null
      };
    }

    render();
  }

  function onPricingState(event = {}) {
    flow = applyPricingFlowState(flow, event);
    longRunningJourney.onPricingState(event.status);
    if (event.status === "processing" || event.status === "failed") {
      context = { ...context, price: null };
    } else if (event.status === "completed") {
      context = { ...context, price: event.estimate ?? null };
    }
    render();
  }

  function render() {
    flowView.render(flow);
    whatsappView.render(context);
  }

  render();
  return Object.freeze({ onUploadState, onManufacturingState, onPricingState });
}

function createInitialContext(config) {
  return {
    filename: null,
    format: null,
    dimensions: null,
    material: config.referenceMaterial,
    layerHeightMm: config.referenceLayerHeightMm,
    weightGrams: null,
    printTimeSeconds: null,
    price: null,
    capacityWarning: null,
    estimateStatus: "unavailable",
    errorCode: null,
    contactAvailable: false
  };
}

function reliableDimensions(value) {
  return [value?.x, value?.y, value?.z].every(
    (dimension) => Number.isFinite(dimension) && dimension > 0
  ) ? { x: value.x, y: value.y, z: value.z } : null;
}
