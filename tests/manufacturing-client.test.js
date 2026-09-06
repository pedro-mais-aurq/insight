import { describe, expect, it, vi } from "vitest";
import { createManufacturingClient } from "../src/manufacturing/manufacturing-client.js";

const estimateId = "550e8400-e29b-41d4-a716-446655440000";

describe("manufacturing client", () => {
  it("normaliza start 202 e resultado concluído", async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { estimateId, estimateStatus: "processing", pollAfterMs: 1500 }, error: null })
      .mockResolvedValueOnce({ data: {
        estimateId,
        estimateStatus: "completed",
        weightGrams: 63.51,
        printTimeSeconds: 4571,
        profile: { label: "A1 mini" }
      }, error: null });
    const client = createManufacturingClient({ getClient: () => ({ functions: { invoke } }) });
    expect(await client.startEstimate({ uploadId: estimateId, profileKey: "insight-a1m-pla-020-v1", unit: "mm" }))
      .toMatchObject({ estimateId, estimateStatus: "processing" });
    expect(await client.getEstimate(estimateId)).toMatchObject({ weightGrams: 63.51, printTimeSeconds: 4571 });
  });

  it("rejeita JSON de sucesso incompleto", async () => {
    const client = createManufacturingClient({
      getClient: () => ({ functions: { invoke: vi.fn().mockResolvedValue({ data: { estimateId, estimateStatus: "completed" }, error: null }) } })
    });
    await expect(client.getEstimate(estimateId)).rejects.toMatchObject({ code: "MANUFACTURING_ESTIMATION_FAILED" });
  });
});
