import { spawn } from "node:child_process";

export function runProcess(command, args, {
  cwd,
  timeoutMs = 300_000,
  maxOutputBytes = 1_000_000,
  failOnOutputLimit = false,
  env = process.env
} = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new TypeError("PROCESS_ARGS_INVALID");
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        detached: process.platform !== "win32",
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child, "SIGKILL");
    }, timeoutMs);

    const collect = (target) => (chunk) => {
      outputBytes += chunk.byteLength;
      const text = chunk.toString("utf8");
      if (target === "stdout") stdout = appendTail(stdout, text, maxOutputBytes);
      else stderr = appendTail(stderr, text, maxOutputBytes);
      if (failOnOutputLimit && outputBytes > maxOutputBytes && !outputLimitExceeded) {
        outputLimitExceeded = true;
        killProcessTree(child, "SIGKILL");
      }
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.once("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const details = { code, signal, stdout, stderr, outputTruncated: outputBytes > maxOutputBytes };
      if (timedOut) return reject(Object.assign(new Error("SLICER_TIMEOUT"), { details }));
      if (outputLimitExceeded) return reject(Object.assign(new Error("PROCESS_OUTPUT_LIMIT"), { details }));
      resolve(details);
    });
  });
}

function killProcessTree(child, signal) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code === "ESRCH") return;
    try {
      child.kill(signal);
    } catch {
      // O close/error do processo continua sendo a fonte autoritativa do estado.
    }
  }
}

function appendTail(existing, addition, maxBytes) {
  const combined = `${existing}${addition}`;
  if (Buffer.byteLength(combined) <= maxBytes) return combined;
  return Buffer.from(combined).subarray(-maxBytes).toString("utf8");
}
