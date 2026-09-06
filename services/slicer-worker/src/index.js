import { access, mkdir } from "node:fs/promises";
import { OrcaSlicerAdapter } from "./orca/orca-adapter.js";
import { loadProfile } from "./profile/profile-store.js";
import { createSlicerServer } from "./server.js";
import { createDownloadUrlPolicy } from "./security/url-policy.js";

const config = readConfig();
await mkdir(config.workRoot, { recursive: true, mode: 0o700 });
await access(config.orcaBinary);
const profile = await loadProfile(config.profileRoot, config.profileKey);
const adapter = new OrcaSlicerAdapter({
  orcaBinary: config.orcaBinary,
  timeoutMs: config.slicerTimeoutMs,
  maxWeightGrams: config.maxWeightGrams,
  maxPrintTimeSeconds: config.maxPrintTimeSeconds
});
const server = createSlicerServer({
  profile,
  adapter,
  hmacSecret: config.hmacSecret,
  workRoot: config.workRoot,
  assertAllowedDownloadUrl: createDownloadUrlPolicy(config.downloadHosts),
  maxModelBytes: config.maxModelBytes,
  maxConcurrentSlices: config.maxConcurrentSlices,
  healthCheck: async () => {
    await access(config.orcaBinary);
    const checked = await loadProfile(config.profileRoot, config.profileKey);
    if (checked.manifest.profileFingerprint !== profile.manifest.profileFingerprint) {
      throw new Error("SLICER_PROFILE_MISMATCH");
    }
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    event: "worker_ready",
    port: config.port,
    engineVersion: profile.manifest.engineVersion,
    profileKey: profile.manifest.profileKey,
    profileFingerprint: profile.manifest.profileFingerprint
  }));
});

function readConfig() {
  return Object.freeze({
    port: integerEnv("PORT", 8080, 1, 65535),
    workRoot: requiredEnv("WORK_ROOT"),
    profileRoot: requiredEnv("PROFILE_ROOT"),
    profileKey: process.env.PROFILE_KEY ?? "insight-a1m-pla-020-v1",
    orcaBinary: requiredEnv("ORCA_SLICER_BIN"),
    hmacSecret: requiredEnv("WORKER_HMAC_SECRET", 32),
    downloadHosts: requiredEnv("MODEL_DOWNLOAD_HOSTS"),
    slicerTimeoutMs: integerEnv("SLICER_TIMEOUT_MS", 90_000, 10_000, 90_000),
    maxConcurrentSlices: integerEnv("SLICER_MAX_CONCURRENT", 1, 1, 1),
    maxModelBytes: integerEnv("MAX_MODEL_BYTES", 50_000_000, 1, 50_000_000),
    maxWeightGrams: integerEnv("MAX_WEIGHT_GRAMS", 10_000, 1, 10_000),
    maxPrintTimeSeconds: integerEnv("MAX_PRINT_TIME_SECONDS", 2_592_000, 1, 2_592_000)
  });
}

function requiredEnv(name, minLength = 1) {
  const value = process.env[name];
  if (!value || value.length < minLength) throw new Error(`${name}_REQUIRED`);
  return value;
}

function integerEnv(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name}_INVALID`);
  return value;
}
