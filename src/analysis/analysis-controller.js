import { ANALYSIS_CONFIG } from "../config/analysis.config.js";
import { UPLOAD_STATES } from "../state/upload-state.js";
import {
  ANALYSIS_ERROR_CODES,
  normalizeAnalysisError
} from "./analysis-errors.js";
import { isRetryableAnalysisError } from "./analysis-error-classifier.js";
import { normalizeGeometry } from "./geometry-normalizer.js";
import {
  applyUserUnit,
  buildModelAnalysis
} from "./model-analysis.js";
import { parseModel } from "./model-parser.js";

export function createAnalysisController({
  stateController,
  analysisService,
  workerClient,
  viewer,
  view,
  parser = parseModel,
  normalizer = normalizeGeometry,
  now = () => new Date().toISOString(),
  nextFrame = waitForRenderFrame
}) {
  let busy = false;

  async function analyze(uploadState) {
    if (
      busy
      || !uploadState?.file
      || !uploadState?.id
      || ![UPLOAD_STATES.UPLOADED, UPLOAD_STATES.ANALYSIS_ERROR].includes(
        uploadState.status
      )
      || (
        uploadState.status === UPLOAD_STATES.ANALYSIS_ERROR
        && !isRetryableAnalysisError(uploadState.error?.code)
      )
    ) {
      return;
    }

    busy = true;
    let started = false;

    stateController.beginAnalysis({ stage: "reading" });

    try {
      await analysisService.startModelAnalysis(uploadState.id);
      started = true;
      await nextFrame();

      const parsed = await parser(uploadState.file, uploadState.extension);
      stateController.updateAnalysisStage("normalizing");
      const normalized = normalizer(parsed.object3D);
      stateController.updateAnalysisStage("topology");
      const measured = await workerClient.analyze(
        normalized.positions,
        ANALYSIS_CONFIG
      );
      const result = buildModelAnalysis({
        parsed,
        normalized,
        measured,
        analyzedAt: now()
      });

      await analysisService.saveCompleted(uploadState.id, result);
      stateController.completeAnalysis(result);

      try {
        viewer.show(parsed.object3D);
        view.setViewerUnavailable(false);
      } catch {
        viewer.dispose();
        view.setViewerUnavailable(true);
      }
    } catch (error) {
      const code = normalizeAnalysisError(
        error,
        ANALYSIS_ERROR_CODES.PARSE_FAILED
      );

      if (started) {
        try {
          await analysisService.saveFailed(uploadState.id, code);
        } catch {
          // O erro técnico original permanece o mais útil para retry local.
        }
      }

      stateController.failAnalysis({
        code,
        retryable: isRetryableAnalysisError(code)
      });
    } finally {
      busy = false;
    }
  }

  async function retry() {
    const state = stateController.getState();

    if (
      state.status !== UPLOAD_STATES.ANALYSIS_ERROR
      || !isRetryableAnalysisError(state.error?.code)
    ) {
      return;
    }

    await analyze(state);
  }

  async function changeUnit(unitValue) {
    const state = stateController.getState();

    if (busy || state.status !== UPLOAD_STATES.READY || !state.analysis?.result) {
      return;
    }

    const result = applyUserUnit(state.analysis.result, unitValue);
    stateController.updateAnalysisResult(result);

    try {
      await analysisService.saveCompleted(state.id, result);
    } catch {
      // A análise continua válida localmente; uma nova análise permite persistir novamente.
    }
  }

  function reset() {
    workerClient.dispose();
    viewer.dispose();
    view.setViewerUnavailable(false);
  }

  view.bind({ onRetry: retry, onUnitChange: changeUnit });

  return Object.freeze({ analyze, retry, changeUnit, reset });
}

function waitForRenderFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
