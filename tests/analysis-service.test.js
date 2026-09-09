import { describe, expect, it, vi } from "vitest";
import { createAnalysisService } from "../src/analysis/analysis-service.js";

const uploadId = "550e8400-e29b-41d4-a716-446655440000";

function serviceWithResponse(response) {
  const invoke = vi.fn().mockResolvedValue(response);
  return {
    invoke,
    service: createAnalysisService({
      getClient: () => ({ functions: { invoke } })
    })
  };
}

describe("createAnalysisService", () => {
  it("inclui clientSlug ao iniciar a análise", async () => {
    const response = { uploadId, analysisStatus: "processing" };
    const test = serviceWithResponse({ data: response, error: null });

    await expect(test.service.startModelAnalysis(uploadId)).resolves.toEqual(response);
    expect(test.invoke).toHaveBeenCalledWith("start-model-analysis", {
      body: { uploadId, clientSlug: "insight" }
    });
  });

  it("inclui clientSlug ao salvar a análise concluída", async () => {
    const result = { volumeCm3: 10 };
    const response = { uploadId, analysisStatus: "completed" };
    const test = serviceWithResponse({ data: response, error: null });

    await expect(test.service.saveCompleted(uploadId, result)).resolves.toEqual(response);
    expect(test.invoke).toHaveBeenCalledWith("save-model-analysis", {
      body: { uploadId, status: "completed", result, clientSlug: "insight" }
    });
  });

  it("inclui clientSlug ao salvar a análise com falha", async () => {
    const errorCode = "ANALYSIS_FAILED";
    const response = { uploadId, analysisStatus: "failed" };
    const test = serviceWithResponse({ data: response, error: null });

    await expect(test.service.saveFailed(uploadId, errorCode)).resolves.toEqual(response);
    expect(test.invoke).toHaveBeenCalledWith("save-model-analysis", {
      body: { uploadId, status: "failed", errorCode, clientSlug: "insight" }
    });
  });

  it("preserva códigos operacionais conhecidos", async () => {
    const test = serviceWithResponse({
      data: { error: { code: "RATE_LIMITED" } },
      error: null
    });

    await expect(test.service.startModelAnalysis(uploadId)).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
  });

  it("normaliza upload ausente como estado inelegível", async () => {
    const test = serviceWithResponse({
      data: { error: { code: "UPLOAD_NOT_FOUND" } },
      error: null
    });

    await expect(test.service.startModelAnalysis(uploadId)).rejects.toMatchObject({
      code: "UPLOAD_STATE_INVALID"
    });
  });

  it("não expõe código inesperado do backend como erro de parsing", async () => {
    const test = serviceWithResponse({
      data: { error: { code: "INVALID_ANALYSIS_RESULT" } },
      error: null
    });

    await expect(test.service.saveCompleted(uploadId, {})).rejects.toMatchObject({
      code: "ANALYSIS_SAVE_FAILED"
    });
  });
});
