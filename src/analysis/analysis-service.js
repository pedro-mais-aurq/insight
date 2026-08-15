import {
  ANALYSIS_ERROR_CODES,
  AnalysisError
} from "./analysis-errors.js";

export function createAnalysisService({ getClient }) {
  if (typeof getClient !== "function") {
    throw new TypeError("getClient deve ser uma função.");
  }

  async function startModelAnalysis(uploadId) {
    const response = await invoke(
      getClient(),
      "start-model-analysis",
      { uploadId },
      ANALYSIS_ERROR_CODES.ANALYSIS_START_FAILED
    );

    if (
      response?.uploadId !== uploadId
      || response?.analysisStatus !== "processing"
    ) {
      throw new AnalysisError(ANALYSIS_ERROR_CODES.ANALYSIS_START_FAILED);
    }

    return response;
  }

  async function saveCompleted(uploadId, result) {
    const response = await invoke(
      getClient(),
      "save-model-analysis",
      { uploadId, status: "completed", result },
      ANALYSIS_ERROR_CODES.ANALYSIS_SAVE_FAILED
    );

    assertSaved(response, uploadId, "completed");
    return response;
  }

  async function saveFailed(uploadId, errorCode) {
    const response = await invoke(
      getClient(),
      "save-model-analysis",
      { uploadId, status: "failed", errorCode },
      ANALYSIS_ERROR_CODES.ANALYSIS_SAVE_FAILED
    );

    assertSaved(response, uploadId, "failed");
    return response;
  }

  return Object.freeze({
    startModelAnalysis,
    saveCompleted,
    saveFailed
  });
}

async function invoke(client, functionName, body, fallbackCode) {
  let response;

  try {
    response = await client.functions.invoke(functionName, { body });
  } catch (error) {
    throw new AnalysisError(fallbackCode, { cause: error });
  }

  if (response.error) {
    throw await toFunctionError(response.error, fallbackCode);
  }

  if (response.data?.error?.code) {
    throw new AnalysisError(normalizeFunctionCode(
      response.data.error.code,
      fallbackCode
    ));
  }

  return response.data;
}

async function toFunctionError(error, fallbackCode) {
  try {
    const body = await error.context?.json();

    if (typeof body?.error?.code === "string") {
      return new AnalysisError(
        normalizeFunctionCode(body.error.code, fallbackCode),
        { cause: error }
      );
    }
  } catch {
    // Infraestrutura pode responder sem JSON estruturado.
  }

  return new AnalysisError(fallbackCode, { cause: error });
}

function normalizeFunctionCode(code, fallbackCode) {
  if (code === "UPLOAD_NOT_FOUND") {
    return ANALYSIS_ERROR_CODES.UPLOAD_STATE_INVALID;
  }

  return Object.values(ANALYSIS_ERROR_CODES).includes(code)
    ? code
    : fallbackCode;
}

function assertSaved(response, uploadId, analysisStatus) {
  if (
    response?.uploadId !== uploadId
    || response?.analysisStatus !== analysisStatus
  ) {
    throw new AnalysisError(ANALYSIS_ERROR_CODES.ANALYSIS_SAVE_FAILED);
  }
}
