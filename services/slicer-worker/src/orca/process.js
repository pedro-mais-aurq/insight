import { spawn } from "node:child_process";

export function runProcess(command, args, {
  cwd,
  timeoutMs = 300_000,
  maxOutputBytes = 1_000_000,
  env = process.env
} = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new TypeError("PROCESS_ARGS_INVALID");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const collect = (target) => (chunk) => {
      outputBytes += chunk.byteLength;
      if (outputBytes <= maxOutputBytes) {
        if (target === "stdout") stdout += chunk.toString("utf8");
        else stderr += chunk.toString("utf8");
      }
    };
    child.stdout.on("data", collect("stdout"));
    child.stderr.on("data", collect("stderr"));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("SLICER_TIMEOUT"));
      resolve({ code, signal, stdout, stderr, outputTruncated: outputBytes > maxOutputBytes });
    });
  });
}
