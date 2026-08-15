import { describe, expect, it } from "vitest";
import {
  DEFINITIVE_COMPLETE_ERROR_CODES,
  classifyCompleteError,
  isDefinitiveCompleteError
} from "../src/upload/complete-error-classifier.js";
import { UPLOAD_ERROR_CODES } from "../src/upload/file-validator.js";

describe("classificação de erros de complete-model-upload", () => {
  it.each(DEFINITIVE_COMPLETE_ERROR_CODES)(
    "preserva %s como erro definitivo e sem confirmação pendente",
    (code) => {
      expect(isDefinitiveCompleteError(code)).toBe(true);
      expect(classifyCompleteError(code)).toEqual({
        code,
        confirmationPending: false
      });
    }
  );

  it.each([
    UPLOAD_ERROR_CODES.COMPLETE_FAILED,
    "INTERNAL_ERROR",
    undefined
  ])("trata %s como confirmação incerta", (code) => {
    expect(classifyCompleteError(code)).toEqual({
      code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
      confirmationPending: true
    });
  });
});
