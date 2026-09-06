import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSlicerServer } from "../src/server.js";
import { signPayload, verifyPayload } from "../src/security/hmac.js";
import { createDownloadUrlPolicy } from "../src/security/url-policy.js";

const secret = "0123456789abcdef0123456789abcdef";
const fingerprint = "a".repeat(64);

test("endpoint assinado baixa por URL temporária e devolve apenas métricas", async () => {
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "insight-server-test-"));
  await mkdir(workRoot, { recursive: true });
  const profile = {
    manifest: { engine: "OrcaSlicer", engineVersion: "2.4.2", profileKey: "insight-a1m-pla-020-v1", profileVersion: 1, profileFingerprint: fingerprint },
    files: { machine: "machine.json", process: "process.json", filament: "filament.json" }
  };
  const adapter = {
    async slice(input) {
      assert.equal(input.extension, "stl");
      return { weightGrams: 12.5, printTimeSeconds: 3601, source: "slice_info.config" };
    }
  };
  const server = createSlicerServer({
    profile,
    adapter,
    hmacSecret: secret,
    workRoot,
    assertAllowedDownloadUrl: createDownloadUrlPolicy("project.supabase.co"),
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-length": "3" } })
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.deepEqual(await health.json(), { status: "ok", engine: "OrcaSlicer", version: "2.4.2" });
    const body = JSON.stringify({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      uploadId: "550e8400-e29b-41d4-a716-446655440001",
      modelUrl: "https://project.supabase.co/storage/signed/model",
      extension: "stl",
      sourceUnit: "mm",
      unitScale: 1,
      profileKey: profile.manifest.profileKey,
      profileVersion: 1,
      expectedProfileFingerprint: fingerprint
    });
    const timestamp = String(Date.now());
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/slice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Insight-Timestamp": timestamp, "X-Insight-Signature": signPayload(secret, timestamp, body) },
      body
    });
    const responseBody = await response.text();
    assert.equal(response.status, 200);
    assert.equal(verifyPayload(secret, response.headers.get("x-insight-timestamp"), responseBody, response.headers.get("x-insight-signature")), true);
    assert.deepEqual(JSON.parse(responseBody), {
      jobId: "550e8400-e29b-41d4-a716-446655440000",
      status: "completed",
      weightGrams: 12.5,
      printTimeSeconds: 3601,
      supportUsed: null,
      warnings: [],
      resultSource: "slice_info.config",
      slicerEngine: "OrcaSlicer",
      slicerVersion: "2.4.2",
      profileKey: "insight-a1m-pla-020-v1",
      profileFingerprint: fingerprint,
      engine: { name: "OrcaSlicer", version: "2.4.2" }
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workRoot, { recursive: true, force: true });
  }
});

test("health falha fechado quando binário ou profiles deixam de ser válidos", async () => {
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "insight-health-test-"));
  const profile = {
    manifest: { engine: "OrcaSlicer", engineVersion: "2.4.2", profileKey: "insight-a1m-pla-020-v1", profileVersion: 1, profileFingerprint: fingerprint }
  };
  const server = createSlicerServer({
    profile,
    adapter: {},
    hmacSecret: secret,
    workRoot,
    assertAllowedDownloadUrl() {},
    healthCheck: async () => { throw new Error("missing"); }
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "WORKER_UNHEALTHY" } });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(workRoot, { recursive: true, force: true });
  }
});
