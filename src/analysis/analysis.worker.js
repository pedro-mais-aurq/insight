import { analyzeGeometry } from "./geometry-metrics.js";

self.addEventListener("message", (event) => {
  const { requestId, positionsBuffer, config } = event.data ?? {};

  try {
    const positions = new Float32Array(positionsBuffer);
    const result = analyzeGeometry(positions, config);
    self.postMessage({ requestId, ok: true, result });
  } catch (error) {
    self.postMessage({
      requestId,
      ok: false,
      error: { code: error?.code ?? "ANALYSIS_WORKER_FAILED" }
    });
  }
});
