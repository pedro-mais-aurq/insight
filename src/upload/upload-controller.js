import {
  UPLOAD_STATES,
  canTransition,
  createInitialUploadState
} from "../state/upload-state.js";
import { isDefinitiveCompleteError } from "./complete-error-classifier.js";
import { UPLOAD_ERROR_CODES } from "./file-validator.js";

const KNOWN_ERROR_CODES = new Set(Object.values(UPLOAD_ERROR_CODES));

export function createUploadController({
  validator,
  uploadService,
  view,
  analysisHooks = {},
  now = () => new Date().toISOString()
}) {
  let state = createInitialUploadState();
  let busy = false;
  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;
    view.bind({
      onFiles: handleFiles,
      onRemove: removeCurrent,
      onReplace: replaceCurrent,
      onRetry: retryUpload
    });
    view.render(state);
  }

  async function handleFiles(fileList) {
    if (busy || !canStartSelection(state.status)) {
      return;
    }

    const files = fileList ? Array.from(fileList) : [];
    const candidate = files[0] ?? null;
    view.resetInput();

    transition(UPLOAD_STATES.SELECTED, {
      id: null,
      file: candidate,
      originalName: normalizeCandidateName(candidate),
      extension: null,
      mimeType: null,
      sizeBytes: null,
      storagePath: null,
      upload: {
        progress: 0,
        startedAt: null,
        completedAt: null
      },
      analysis: null,
      error: null
    });

    await validateAndUpload(files);
  }

  async function validateAndUpload(files) {
    busy = true;
    transition(UPLOAD_STATES.VALIDATING);

    const validation = validator(files);

    if (!validation.valid) {
      transition(UPLOAD_STATES.INVALID, {
        error: validation.error
      });
      busy = false;
      return;
    }

    const normalized = validation.normalized;
    transition(UPLOAD_STATES.UPLOADING, {
      ...normalized,
      error: null,
      upload: {
        progress: 0,
        startedAt: now(),
        completedAt: null
      }
    });

    try {
      const uploaded = await uploadService.uploadModel(state.file, normalized, {
        onCreated(createdUpload) {
          patchState({
            id: createdUpload.uploadId,
            storagePath: createdUpload.storagePath
          });
        }
      });

      transition(UPLOAD_STATES.UPLOADED, {
        id: uploaded.uploadId,
        storagePath: uploaded.storagePath,
        error: null,
        upload: {
          progress: 100,
          completedAt: now()
        }
      });
      await analysisHooks.onUploaded?.(state);
    } catch (error) {
      const errorCode = normalizeErrorCode(
        error,
        UPLOAD_ERROR_CODES.UPLOAD_FAILED
      );
      const confirmationPending = isConfirmationPendingError(error, errorCode);

      transition(UPLOAD_STATES.UPLOAD_ERROR, {
        id: confirmationPending ? error.uploadId ?? state.id : null,
        storagePath: confirmationPending
          ? error.storagePath ?? state.storagePath
          : null,
        error: {
          code: errorCode,
          confirmationPending,
          retrying: false
        }
      });
    } finally {
      busy = false;
    }
  }

  async function retryUpload() {
    if (busy || !state.file) {
      return;
    }

    if (state.status === UPLOAD_STATES.ANALYSIS_ERROR) {
      if (state.error?.retryable !== true) {
        return;
      }

      await analysisHooks.onAnalysisRetry?.(state);
      return;
    }

    if (state.status !== UPLOAD_STATES.UPLOAD_ERROR) {
      return;
    }

    if (hasPendingConfirmation(state)) {
      await retryConfirmation();
      return;
    }

    const file = state.file;
    transition(UPLOAD_STATES.SELECTED, { error: null });
    await validateAndUpload([file]);
  }

  async function retryConfirmation() {
    if (!state.id || !state.storagePath) {
      return;
    }

    const uploadId = state.id;
    busy = true;
    patchState({
      error: {
        code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
        confirmationPending: true,
        retrying: true
      }
    });

    try {
      const completed = await uploadService.completeUpload(uploadId);

      transition(UPLOAD_STATES.UPLOADED, {
        id: completed.uploadId,
        error: null,
        upload: {
          progress: 100,
          completedAt: now()
        }
      });
      await analysisHooks.onUploaded?.(state);
    } catch (error) {
      const errorCode = normalizeErrorCode(
        error,
        UPLOAD_ERROR_CODES.COMPLETE_FAILED
      );
      const confirmationPending = isConfirmationPendingError(error, errorCode);

      patchState({
        id: confirmationPending ? state.id : null,
        storagePath: confirmationPending ? state.storagePath : null,
        error: {
          code: errorCode,
          confirmationPending,
          retrying: false
        }
      });
    } finally {
      busy = false;
    }
  }

  async function removeCurrent() {
    return resetCurrent();
  }

  async function replaceCurrent() {
    const reset = await resetCurrent();

    if (reset) {
      view.openFilePicker();
    }
  }

  async function resetCurrent() {
    if (busy) {
      return false;
    }

    if (state.status === UPLOAD_STATES.IDLE) {
      return true;
    }

    if (hasServerUpload(state)) {
      busy = true;
      view.setInteractionsDisabled(true);

      try {
        await uploadService.removeUpload(state.id);
      } catch (error) {
        const confirmationPending = hasPendingConfirmation(state);

        patchState({
          error: {
            code: normalizeErrorCode(error, UPLOAD_ERROR_CODES.REMOVE_FAILED),
            confirmationPending,
            retrying: false
          }
        });
        return false;
      } finally {
        busy = false;
        view.setInteractionsDisabled(false);
      }
    }

    analysisHooks.onReset?.();
    resetToIdle();
    return true;
  }

  function transition(nextStatus, patch = {}) {
    if (!canTransition(state.status, nextStatus)) {
      throw new Error(`Transição inválida: ${state.status} → ${nextStatus}`);
    }

    state = mergeState(state, patch, nextStatus);
    view.render(state);
  }

  function patchState(patch) {
    state = mergeState(state, patch, state.status);
    view.render(state);
  }

  function resetToIdle() {
    if (!canTransition(state.status, UPLOAD_STATES.IDLE)) {
      throw new Error(`Transição inválida: ${state.status} → ${UPLOAD_STATES.IDLE}`);
    }

    state = createInitialUploadState();
    view.resetInput();
    view.render(state);
  }

  function beginAnalysis({ stage }) {
    transition(UPLOAD_STATES.ANALYZING, {
      analysis: {
        stage,
        result: null
      },
      error: null
    });
  }

  function updateAnalysisStage(stage) {
    if (state.status !== UPLOAD_STATES.ANALYZING) {
      return;
    }

    patchState({ analysis: { ...state.analysis, stage } });
  }

  function completeAnalysis(result) {
    transition(UPLOAD_STATES.READY, {
      analysis: { stage: "completed", result },
      error: null
    });
  }

  function failAnalysis(error) {
    transition(UPLOAD_STATES.ANALYSIS_ERROR, {
      analysis: { stage: "failed", result: null },
      error
    });
  }

  function updateAnalysisResult(result) {
    if (state.status !== UPLOAD_STATES.READY) {
      return;
    }

    patchState({ analysis: { ...state.analysis, result } });
  }

  return Object.freeze({
    init,
    handleFiles,
    removeCurrent,
    replaceCurrent,
    retryUpload,
    beginAnalysis,
    updateAnalysisStage,
    completeAnalysis,
    failAnalysis,
    updateAnalysisResult,
    getState: () => state
  });
}

function mergeState(currentState, patch, status) {
  return {
    ...currentState,
    ...patch,
    status,
    upload: patch.upload
      ? { ...currentState.upload, ...patch.upload }
      : currentState.upload
  };
}

function canStartSelection(status) {
  return [
    UPLOAD_STATES.IDLE,
    UPLOAD_STATES.INVALID,
    UPLOAD_STATES.UPLOAD_ERROR
  ].includes(status);
}

function hasPendingConfirmation(state) {
  return state.error?.confirmationPending === true;
}

function hasServerUpload(state) {
  return Boolean(
    state.id
    && [
      UPLOAD_STATES.UPLOADED,
      UPLOAD_STATES.UPLOAD_ERROR,
      UPLOAD_STATES.ANALYZING,
      UPLOAD_STATES.READY,
      UPLOAD_STATES.ANALYSIS_ERROR
    ].includes(state.status)
  );
}

function normalizeCandidateName(file) {
  return typeof file?.name === "string" && file.name.trim().length > 0
    ? file.name.trim()
    : null;
}

function normalizeErrorCode(error, fallbackCode) {
  return KNOWN_ERROR_CODES.has(error?.code) ? error.code : fallbackCode;
}

function isConfirmationPendingError(error, errorCode) {
  if (isDefinitiveCompleteError(errorCode)) {
    return false;
  }

  return error?.confirmationPending === true
    || errorCode === UPLOAD_ERROR_CODES.COMPLETE_FAILED;
}
