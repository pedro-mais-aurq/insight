import { describe, expect, it } from "vitest";
import { isRetryableAnalysisError } from "../src/analysis/analysis-error-classifier.js";

describe("isRetryableAnalysisError", () => {
  it.each([
    "ANALYSIS_WORKER_FAILED",
    "ANALYSIS_START_FAILED",
    "ANALYSIS_SAVE_FAILED",
    "RATE_LIMITED"
  ])("classifica %s como transitório", (code) => {
    expect(isRetryableAnalysisError(code)).toBe(true);
  });

  it.each([
    "UPLOAD_EXPIRED",
    "UPLOAD_STATE_INVALID",
    "NO_GEOMETRY",
    "NO_TRIANGLES",
    "UNSUPPORTED_STRUCTURE",
    "INVALID_COORDINATES",
    "PARSE_FAILED",
    "CODIGO_DESCONHECIDO",
    null
  ])("não repete automaticamente %s", (code) => {
    expect(isRetryableAnalysisError(code)).toBe(false);
  });
});
