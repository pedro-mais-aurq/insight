import { describe, expect, it } from "vitest";
import { UPLOAD_ERROR_CODES } from "../src/upload/file-validator.js";
import {
  formatFileSize,
  getErrorMessage,
  getReplaceActionLabel,
  getRetryActionLabel
} from "../src/upload/upload-view.js";

describe("formatFileSize", () => {
  it.each([
    [842, "842 B"],
    [1024, "1 KB"],
    [18.7 * 1024 * 1024, "18,7 MB"]
  ])("formata %s bytes", (bytes, formatted) => {
    expect(formatFileSize(bytes)).toBe(formatted);
  });

  it("não altera nem inventa representação para valor inválido", () => {
    expect(formatFileSize(-1)).toBe("");
  });
});

describe("mensagens e ações de retry", () => {
  const definitiveCompleteCodes = [
    UPLOAD_ERROR_CODES.OBJECT_NOT_FOUND,
    UPLOAD_ERROR_CODES.SIZE_MISMATCH,
    UPLOAD_ERROR_CODES.UPLOAD_REMOVED,
    UPLOAD_ERROR_CODES.UPLOAD_STATE_INVALID,
    UPLOAD_ERROR_CODES.UPLOAD_NOT_FOUND
  ];

  it("diferencia falha física de confirmação pendente", () => {
    expect(getErrorMessage(UPLOAD_ERROR_CODES.UPLOAD_FAILED)).toContain(
      "Não foi possível enviar"
    );
    expect(getErrorMessage(UPLOAD_ERROR_CODES.COMPLETE_FAILED)).toContain(
      "confirmar o estado final"
    );
  });

  it("indica retry exclusivo de confirmação", () => {
    expect(getRetryActionLabel({
      code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
      confirmationPending: true,
      retrying: false
    })).toBe("Tentar confirmar novamente");

    expect(getRetryActionLabel({
      code: UPLOAD_ERROR_CODES.COMPLETE_FAILED,
      confirmationPending: true,
      retrying: true
    })).toBe("Confirmando…");
  });

  it.each(definitiveCompleteCodes)(
    "%s possui mensagem segura e exige um novo envio explícito",
    (code) => {
      expect(getErrorMessage(code)).toMatch(/novo envio|Faça um novo envio/);
      expect(getRetryActionLabel({
        code,
        confirmationPending: false,
        retrying: false
      })).toBe("Tentar novo envio");
    }
  );

  it("oferece novo arquivo após erro definitivo de análise", () => {
    expect(getReplaceActionLabel({
      status: "analysis_error",
      error: { code: "NO_GEOMETRY", retryable: false }
    })).toBe("Enviar outro arquivo");
  });
});
