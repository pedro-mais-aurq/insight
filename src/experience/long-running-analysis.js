export const LONG_RUNNING_ANALYSIS_DELAY_MS = 20_000;

const UPLOAD_STOP_STATES = new Set([
  "idle",
  "selected",
  "validating",
  "invalid",
  "uploading",
  "uploaded",
  "upload_error",
  "analysis_error"
]);
const MANUFACTURING_ACTIVE_STATES = new Set(["preparing", "processing", "completed"]);
const MANUFACTURING_STOP_STATES = new Set(["waiting_unit", "failed", "unavailable"]);
const PRICING_STOP_STATES = new Set(["completed", "failed", "unavailable"]);

export function createLongRunningAnalysisNotice({
  onChange,
  delayMs = LONG_RUNNING_ANALYSIS_DELAY_MS,
  schedule = setTimeout,
  cancel = clearTimeout
}) {
  let timeoutId = null;
  let visible = false;

  function start() {
    if (timeoutId !== null || visible) return;

    timeoutId = schedule(() => {
      timeoutId = null;
      visible = true;
      onChange(true);
    }, delayMs);
  }

  function stop() {
    if (timeoutId !== null) {
      cancel(timeoutId);
      timeoutId = null;
    }

    if (visible) {
      visible = false;
      onChange(false);
    }
  }

  return Object.freeze({ start, stop });
}

export function createLongRunningAnalysisJourney(options) {
  const notice = createLongRunningAnalysisNotice(options);

  function onUploadState(status) {
    if (status === "analyzing") {
      notice.start();
    } else if (status !== "ready" && UPLOAD_STOP_STATES.has(status)) {
      notice.stop();
    }
  }

  function onManufacturingState(status) {
    if (MANUFACTURING_ACTIVE_STATES.has(status)) {
      notice.start();
    } else if (MANUFACTURING_STOP_STATES.has(status)) {
      notice.stop();
    }
  }

  function onPricingState(status) {
    if (status === "processing") {
      notice.start();
    } else if (PRICING_STOP_STATES.has(status)) {
      notice.stop();
    }
  }

  return Object.freeze({ onUploadState, onManufacturingState, onPricingState });
}
