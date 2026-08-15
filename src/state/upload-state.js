export const UPLOAD_STATES = Object.freeze({
  IDLE: "idle",
  SELECTED: "selected",
  VALIDATING: "validating",
  INVALID: "invalid",
  UPLOADING: "uploading",
  UPLOADED: "uploaded",
  UPLOAD_ERROR: "upload_error",
  ANALYZING: "analyzing",
  READY: "ready",
  ANALYSIS_ERROR: "analysis_error"
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [UPLOAD_STATES.IDLE]: Object.freeze([UPLOAD_STATES.SELECTED]),
  [UPLOAD_STATES.SELECTED]: Object.freeze([
    UPLOAD_STATES.VALIDATING,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.VALIDATING]: Object.freeze([
    UPLOAD_STATES.UPLOADING,
    UPLOAD_STATES.INVALID,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.INVALID]: Object.freeze([
    UPLOAD_STATES.SELECTED,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.UPLOADING]: Object.freeze([
    UPLOAD_STATES.UPLOADED,
    UPLOAD_STATES.UPLOAD_ERROR,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.UPLOAD_ERROR]: Object.freeze([
    UPLOAD_STATES.SELECTED,
    UPLOAD_STATES.UPLOADED,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.UPLOADED]: Object.freeze([
    UPLOAD_STATES.ANALYZING,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.ANALYZING]: Object.freeze([
    UPLOAD_STATES.READY,
    UPLOAD_STATES.ANALYSIS_ERROR,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.ANALYSIS_ERROR]: Object.freeze([
    UPLOAD_STATES.ANALYZING,
    UPLOAD_STATES.IDLE
  ]),
  [UPLOAD_STATES.READY]: Object.freeze([UPLOAD_STATES.IDLE])
});

export function createInitialUploadState() {
  return {
    id: null,
    file: null,
    originalName: null,
    extension: null,
    mimeType: null,
    sizeBytes: null,
    storagePath: null,
    status: UPLOAD_STATES.IDLE,
    upload: {
      progress: 0,
      startedAt: null,
      completedAt: null
    },
    analysis: null,
    error: null
  };
}

export function canTransition(currentState, nextState) {
  return ALLOWED_TRANSITIONS[currentState]?.includes(nextState) ?? false;
}
