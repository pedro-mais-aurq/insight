import { describe, expect, it } from "vitest";
import {
  UPLOAD_STATES,
  canTransition,
  createInitialUploadState
} from "../src/state/upload-state.js";

describe("createInitialUploadState", () => {
  it("representa a ausência de upload persistido com null", () => {
    const state = createInitialUploadState();

    expect(state).toMatchObject({
      id: null,
      file: null,
      originalName: null,
      extension: null,
      mimeType: null,
      sizeBytes: null,
      storagePath: null,
      status: "idle",
      upload: {
        progress: 0,
        startedAt: null,
        completedAt: null
      },
      analysis: null,
      error: null
    });
  });

  it("retorna referências independentes a cada chamada", () => {
    const first = createInitialUploadState();
    const second = createInitialUploadState();

    first.upload.progress = 50;

    expect(second.upload.progress).toBe(0);
  });
});

describe("canTransition", () => {
  it.each([
    [UPLOAD_STATES.IDLE, UPLOAD_STATES.SELECTED],
    [UPLOAD_STATES.SELECTED, UPLOAD_STATES.VALIDATING],
    [UPLOAD_STATES.VALIDATING, UPLOAD_STATES.UPLOADING],
    [UPLOAD_STATES.VALIDATING, UPLOAD_STATES.INVALID],
    [UPLOAD_STATES.UPLOADING, UPLOAD_STATES.UPLOADED],
    [UPLOAD_STATES.UPLOADING, UPLOAD_STATES.UPLOAD_ERROR],
    [UPLOAD_STATES.UPLOAD_ERROR, UPLOAD_STATES.UPLOADED],
    [UPLOAD_STATES.UPLOADED, UPLOAD_STATES.IDLE],
    [UPLOAD_STATES.UPLOADED, UPLOAD_STATES.ANALYZING],
    [UPLOAD_STATES.ANALYZING, UPLOAD_STATES.READY],
    [UPLOAD_STATES.ANALYZING, UPLOAD_STATES.ANALYSIS_ERROR]
  ])("permite %s → %s", (currentState, nextState) => {
    expect(canTransition(currentState, nextState)).toBe(true);
  });

  it.each([
    [UPLOAD_STATES.IDLE, UPLOAD_STATES.UPLOADED],
    [UPLOAD_STATES.UPLOADING, UPLOAD_STATES.READY]
  ])("rejeita %s → %s", (currentState, nextState) => {
    expect(canTransition(currentState, nextState)).toBe(false);
  });
});
