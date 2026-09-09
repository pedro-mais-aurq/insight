import { UPLOAD_CONFIG } from "../config/upload.config.js";
import { createAnalysisController } from "../analysis/analysis-controller.js";
import { createAnalysisService } from "../analysis/analysis-service.js";
import { createAnalysisView } from "../analysis/analysis-view.js";
import { createAnalysisWorkerClient } from "../analysis/analysis-worker-client.js";
import { createEstimateExperience } from "../experience/estimate-experience.js";
import { getSupabaseClient } from "../lib/supabase.js";
import { createManufacturingClient } from "../manufacturing/manufacturing-client.js";
import { createManufacturingController } from "../manufacturing/manufacturing-controller.js";
import { createManufacturingView } from "../manufacturing/manufacturing-view.js";
import { createPricingClient } from "../pricing/pricing-client.js";
import { initPricingView } from "../pricing/pricing-view.js";
import { createModelViewer } from "../viewer/model-viewer.js";
import { createUploadController } from "./upload-controller.js";
import { validateFiles } from "./file-validator.js";
import { createUploadService } from "./upload-service.js";
import { createUploadView } from "./upload-view.js";

export function initUploadShell() {
  const root = document.querySelector("[data-upload-root]");

  if (!root) {
    return null;
  }

  const manufacturingRoot = document.querySelector("[data-manufacturing-root]");
  const printTools = manufacturingRoot?.querySelector("[data-print-tools]") ?? root;
  const experience = manufacturingRoot
    ? createEstimateExperience({
        flowRoot: manufacturingRoot.querySelector("[data-flow-root]"),
        contactRoot: manufacturingRoot
      })
    : null;
  const uploadView = createUploadView(root, UPLOAD_CONFIG, { messageRoot: printTools });
  const analysisView = createAnalysisView(root, { messageRoot: printTools });
  const view = {
    ...uploadView,
    render(state) {
      uploadView.render(state);
      analysisView.render(state);
      experience?.onUploadState(state);
    }
  };
  const uploadService = createUploadService({
    getClient: getSupabaseClient,
    config: UPLOAD_CONFIG
  });
  const analysisHooks = {};
  const manufacturingHooks = {};
  const controller = createUploadController({
    validator: (files) => validateFiles(files, UPLOAD_CONFIG),
    uploadService,
    view,
    analysisHooks
  });
  const analysisController = createAnalysisController({
    stateController: controller,
    analysisService: createAnalysisService({ getClient: getSupabaseClient }),
    workerClient: createAnalysisWorkerClient(),
    viewer: createModelViewer(root.querySelector("[data-model-viewer]")),
    view: analysisView,
    manufacturingHooks
  });
  const pricingView = initPricingView(manufacturingRoot, {
    onStateChange: (event) => experience?.onPricingState(event)
  });
  const manufacturingController = manufacturingRoot && pricingView
    ? createManufacturingController({
        service: createManufacturingClient({ getClient: getSupabaseClient }),
        view: createManufacturingView(manufacturingRoot, {
          onStateChange: (event) => experience?.onManufacturingState(event)
        }),
        pricingClient: createPricingClient({ getClient: getSupabaseClient }),
        pricingView
      })
    : null;

  analysisHooks.onUploaded = (state) => analysisController.analyze(state);
  analysisHooks.onAnalysisRetry = () => analysisController.retry();
  analysisHooks.onReset = () => analysisController.reset();
  manufacturingHooks.onReady = (state) => manufacturingController?.onAnalysisReady(state);
  manufacturingHooks.onReset = () => manufacturingController?.reset();

  controller.init();

  return controller;
}
