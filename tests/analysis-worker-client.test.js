import { describe, expect, it, vi } from "vitest";
import { createAnalysisWorkerClient } from "../src/analysis/analysis-worker-client.js";

function createFakeWorker(result) {
  const listeners = new Map();
  const worker = {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    postMessage: vi.fn((message, transfer) => {
      queueMicrotask(() => listeners.get("message")?.({
        data: { requestId: message.requestId, ok: true, result }
      }));
      worker.transfer = transfer;
    }),
    terminate: vi.fn(),
    transfer: null
  };

  return worker;
}

describe("createAnalysisWorkerClient", () => {
  it("transfere o ArrayBuffer e resolve a resposta da mesma requisição", async () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const originalBuffer = positions.buffer;
    const expected = { rawMetrics: { surfaceArea: 0.5 } };
    const worker = createFakeWorker(expected);
    const client = createAnalysisWorkerClient({ workerFactory: () => worker });

    await expect(client.analyze(positions)).resolves.toBe(expected);
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ positionsBuffer: originalBuffer }),
      [originalBuffer]
    );
    expect(worker.transfer).toEqual([originalBuffer]);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("recusa entradas que não sejam Float32Array sem criar worker", async () => {
    const workerFactory = vi.fn();
    const client = createAnalysisWorkerClient({ workerFactory });

    await expect(client.analyze([0, 0, 0])).rejects.toMatchObject({
      code: "ANALYSIS_WORKER_FAILED"
    });
    expect(workerFactory).not.toHaveBeenCalled();
  });
});
