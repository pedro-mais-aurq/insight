import { createServer as createHttpServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { downloadModel } from "./download-model.js";
import { parseSliceJob } from "./input-policy.js";
import { ReplayGuard, signPayload, verifyPayload } from "./security/hmac.js";

const MAX_REQUEST_BYTES = 16_384;

export function createSlicerServer({
  profile,
  adapter,
  hmacSecret,
  workRoot,
  assertAllowedDownloadUrl,
  maxModelBytes = 50_000_000,
  maxConcurrentSlices = 1,
  healthCheck = async () => {},
  now = Date.now,
  fetchImpl = fetch
}) {
  const replayGuard = new ReplayGuard({ now });
  const queue = new SerialQueue(maxConcurrentSlices);
  const jobs = new Map();

  return createHttpServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        try {
          await healthCheck();
        } catch {
          return sendJson(response, 503, { error: { code: "WORKER_UNHEALTHY" } });
        }
        return sendJson(response, 200, {
          status: "ok",
          engine: profile.manifest.engine,
          version: profile.manifest.engineVersion
        });
      }

      if (request.method !== "POST" || request.url !== "/v1/slice") {
        return sendJson(response, 404, { error: { code: "NOT_FOUND" } });
      }

      const body = await readBody(request, MAX_REQUEST_BYTES);
      const timestamp = request.headers["x-insight-timestamp"];
      const signature = request.headers["x-insight-signature"];
      if (
        typeof timestamp !== "string"
        || typeof signature !== "string"
        || !verifyPayload(hmacSecret, timestamp, body, signature)
        || !replayGuard.accept(timestamp, signature)
      ) {
        return sendJson(response, 401, { error: { code: "WORKER_AUTH_INVALID" } });
      }

      const job = parseSliceJob(JSON.parse(body));
      assertAllowedDownloadUrl(job.modelUrl);
      if (
        job.profileKey !== profile.manifest.profileKey
        || job.expectedProfileFingerprint !== profile.manifest.profileFingerprint
      ) {
        return sendSignedJson(response, 409, {
          error: { code: "SLICER_PROFILE_MISMATCH" },
          profileFingerprint: profile.manifest.profileFingerprint
        }, hmacSecret, now);
      }

      let promise = jobs.get(job.jobId);
      if (!promise) {
        promise = queue.run(() => executeJob({
          job,
          profile,
          adapter,
          workRoot,
          assertAllowedDownloadUrl,
          maxModelBytes,
          fetchImpl
        }));
        jobs.set(job.jobId, promise);
        promise.then(() => {
          const expiry = setTimeout(() => jobs.delete(job.jobId), 300_000);
          expiry.unref();
        }).catch(() => jobs.delete(job.jobId));
      }

      try {
        const result = await promise;
        return sendSignedJson(response, 200, {
          jobId: job.jobId,
          status: "completed",
          weightGrams: result.weightGrams,
          printTimeSeconds: result.printTimeSeconds,
          supportUsed: result.supportUsed ?? null,
          warnings: Array.isArray(result.warnings) ? result.warnings : [],
          resultSource: result.source,
          slicerEngine: profile.manifest.engine,
          slicerVersion: profile.manifest.engineVersion,
          profileKey: profile.manifest.profileKey,
          profileFingerprint: profile.manifest.profileFingerprint,
          engine: {
            name: profile.manifest.engine,
            version: profile.manifest.engineVersion
          }
        }, hmacSecret, now);
      } catch (error) {
        return sendSignedJson(response, statusFor(error), {
          error: { code: publicErrorCode(error) },
          profileFingerprint: profile.manifest.profileFingerprint
        }, hmacSecret, now);
      }
    } catch (error) {
      return sendJson(response, statusFor(error), { error: { code: publicErrorCode(error) } });
    }
  });
}

async function executeJob({
  job,
  profile,
  adapter,
  workRoot,
  assertAllowedDownloadUrl,
  maxModelBytes,
  fetchImpl
}) {
  const startedAt = Date.now();
  const workDir = await mkdtemp(path.join(workRoot, "insight-slice-"));
  const inputPath = path.join(workDir, `model.${job.extension}`);
  try {
    await downloadModel({
      url: job.modelUrl,
      destination: inputPath,
      assertAllowedUrl: assertAllowedDownloadUrl,
      maxBytes: maxModelBytes,
      fetchImpl
    });
    const result = await adapter.slice({
      inputPath,
      extension: job.extension,
      sourceUnit: job.sourceUnit,
      unitScale: job.unitScale,
      profile,
      workDir
    });
    console.log(JSON.stringify({
      event: "slice_completed",
      jobId: job.jobId,
      estimateId: job.jobId,
      uploadId: job.uploadId,
      engineVersion: profile.manifest.engineVersion,
      profileVersion: job.profileVersion,
      durationMs: Date.now() - startedAt,
      exitCode: 0,
      errorCode: null
    }));
    return result;
  } catch (error) {
    console.error(JSON.stringify({
      event: "slice_failed",
      jobId: job.jobId,
      estimateId: job.jobId,
      uploadId: job.uploadId,
      engineVersion: profile.manifest.engineVersion,
      profileVersion: job.profileVersion,
      durationMs: Date.now() - startedAt,
      exitCode: error?.details?.code ?? null,
      errorCode: publicErrorCode(error)
    }));
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

class SerialQueue {
  constructor(maxQueued) {
    this.maxQueued = maxQueued;
    this.pending = 0;
    this.tail = Promise.resolve();
  }

  run(task) {
    if (this.pending >= this.maxQueued) return Promise.reject(new Error("WORKER_BUSY"));
    this.pending += 1;
    const operation = this.tail.then(task, task);
    this.tail = operation.catch(() => {}).finally(() => { this.pending -= 1; });
    return operation;
  }
}

async function readBody(request, maxBytes) {
  const length = Number(request.headers["content-length"]);
  if (Number.isFinite(length) && length > maxBytes) throw new Error("REQUEST_TOO_LARGE");
  let body = "";
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    body += chunk.toString("utf8");
  }
  if (!body) throw new Error("JOB_INVALID");
  return body;
}

function sendSignedJson(response, status, value, secret, now) {
  const body = JSON.stringify(value);
  const timestamp = String(now());
  response.setHeader("X-Insight-Timestamp", timestamp);
  response.setHeader("X-Insight-Signature", signPayload(secret, timestamp, body));
  sendBody(response, status, body);
}

function sendJson(response, status, value) {
  sendBody(response, status, JSON.stringify(value));
}

function sendBody(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function publicErrorCode(error) {
  const allowed = new Set([
    "JOB_INVALID", "UNIT_SCALE_INVALID", "MODEL_URL_INVALID", "MODEL_URL_NOT_ALLOWED",
    "MODEL_TOO_LARGE", "MODEL_EMPTY", "MODEL_DOWNLOAD_FAILED", "SLICER_TIMEOUT",
    "SLICER_UNAVAILABLE", "MODEL_OUTSIDE_BUILD_VOLUME", "MODEL_TOO_COMPLEX",
    "SLICER_PROFILE_INVALID", "SLICER_OUTPUT_MISSING", "SLICER_OUTPUT_OUT_OF_RANGE",
    "SLICER_OUTPUT_AMBIGUOUS", "THREE_MF_INVALID", "THREE_MF_GEOMETRY_MISSING",
    "THREE_MF_PATH_INVALID", "THREE_MF_UNIT_MISMATCH", "SLICER_PROFILE_MISMATCH",
    "WORKER_BUSY", "REQUEST_TOO_LARGE"
  ]);
  return allowed.has(error?.message) ? error.message : "SLICING_FAILED";
}

function statusFor(error) {
  if (error?.message === "WORKER_BUSY") return 503;
  if (error?.message === "SLICER_PROFILE_MISMATCH") return 409;
  if (["MODEL_DOWNLOAD_FAILED", "SLICER_TIMEOUT", "SLICER_UNAVAILABLE"].includes(error?.message)) return 502;
  return 400;
}
