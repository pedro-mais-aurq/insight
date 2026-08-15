import { ANALYSIS_CONFIG } from "../config/analysis.config.js";
import {
  ANALYSIS_ERROR_CODES,
  AnalysisError
} from "./analysis-errors.js";

export function createAnalysisWorkerClient({ workerFactory = createWorker } = {}) {
  let sequence = 0;
  let activeWorker = null;

  function analyze(positions, config = ANALYSIS_CONFIG) {
    if (!(positions instanceof Float32Array)) {
      return Promise.reject(
        new AnalysisError(ANALYSIS_ERROR_CODES.ANALYSIS_WORKER_FAILED)
      );
    }

    dispose();
    const worker = workerFactory();
    activeWorker = worker;
    const requestId = ++sequence;

    return new Promise((resolve, reject) => {
      worker.addEventListener("message", (event) => {
        if (event.data?.requestId !== requestId) {
          return;
        }

        activeWorker = null;
        worker.terminate();

        if (event.data.ok) {
          resolve(event.data.result);
        } else {
          reject(new AnalysisError(
            event.data?.error?.code ?? ANALYSIS_ERROR_CODES.ANALYSIS_WORKER_FAILED
          ));
        }
      }, { once: true });

      worker.addEventListener("error", () => {
        activeWorker = null;
        worker.terminate();
        reject(new AnalysisError(ANALYSIS_ERROR_CODES.ANALYSIS_WORKER_FAILED));
      }, { once: true });

      worker.postMessage({
        requestId,
        positionsBuffer: positions.buffer,
        config
      }, [positions.buffer]);
    });
  }

  function dispose() {
    activeWorker?.terminate();
    activeWorker = null;
  }

  return Object.freeze({ analyze, dispose });
}

function createWorker() {
  return new Worker(new URL("./analysis.worker.js", import.meta.url), {
    type: "module"
  });
}
