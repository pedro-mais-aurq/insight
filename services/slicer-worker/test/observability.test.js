import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("slice_failed mantém o envelope estruturado sem URL ou credenciais", async () => {
  const source = await readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const start = source.indexOf('event: "slice_failed"');
  const end = source.indexOf("}));", start);
  const log = source.slice(start, end);
  for (const field of [
    "jobId", "estimateId", "uploadId", "engineVersion", "profileVersion",
    "durationMs", "exitCode", "signal", "errorCode", "orcaReturnCode",
    "stdoutTail", "stderrTail", "outputTruncated"
  ]) {
    assert.match(log, new RegExp(`\\b${field}\\b`));
  }
  for (const forbidden of ["modelUrl", "Authorization", "signature", "hmacSecret", "WORKER_HMAC_SECRET"]) {
    assert.equal(log.includes(forbidden), false);
  }
});
