import { describe, expect, it } from "vitest";
import {
  formatAreaMm2,
  formatCount,
  formatLengthMm,
  formatVolumeMm3,
  getAnalysisErrorMessage,
  getAnalysisWarningMessage,
  integrityLabel,
  shouldShowAnalysisRetry
} from "../src/analysis/analysis-view.js";

describe("formatação de análise", () => {
  it("formata comprimentos em mm sem alterar o valor canônico", () => {
    expect(formatLengthMm(12.5)).toBe("12,5 mm");
  });

  it("formata área em cm² e volume em cm³", () => {
    expect(formatAreaMm2(100)).toBe("1 cm²");
    expect(formatVolumeMm3(1000)).toBe("1 cm³");
  });

  it("formata contagens e estados de integridade", () => {
    expect(formatCount(1234)).toBe("1.234");
    expect(integrityLabel(true)).toBe("OK");
    expect(integrityLabel(false)).toBe("ATENÇÃO");
    expect(integrityLabel(null)).toBe("NÃO VERIFICADO");
  });

  it("traduz warnings internos sem expor códigos na interface", () => {
    expect(getAnalysisWarningMessage("OPEN_EDGES")).toBe("há arestas abertas");
    expect(getAnalysisWarningMessage("UNKNOWN_CODE")).toBe(
      "há uma advertência geométrica"
    );
  });

  it("mostra retry somente para erro transitório marcado como repetível", () => {
    expect(shouldShowAnalysisRetry({
      status: "analysis_error",
      error: { code: "ANALYSIS_WORKER_FAILED", retryable: true }
    })).toBe(true);
    for (const code of [
      "UPLOAD_EXPIRED",
      "UPLOAD_STATE_INVALID",
      "NO_GEOMETRY",
      "NO_TRIANGLES",
      "UNSUPPORTED_STRUCTURE",
      "INVALID_COORDINATES"
    ]) {
      expect(shouldShowAnalysisRetry({
        status: "analysis_error",
        error: { code, retryable: false }
      })).toBe(false);
    }
  });

  it("orienta um novo envio para arquivo expirado ou inválido", () => {
    expect(getAnalysisErrorMessage("UPLOAD_EXPIRED")).toContain(
      "Envie o arquivo novamente"
    );
    expect(getAnalysisErrorMessage("UPLOAD_STATE_INVALID")).toContain(
      "novo envio"
    );
  });
});
