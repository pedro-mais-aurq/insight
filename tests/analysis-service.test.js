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
