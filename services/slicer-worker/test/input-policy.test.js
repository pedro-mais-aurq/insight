import assert from "node:assert/strict";
import test from "node:test";
import { parseSliceJob } from "../src/input-policy.js";

const base = {
  jobId: "550e8400-e29b-41d4-a716-446655440000",
  uploadId: "550e8400-e29b-41d4-a716-446655440001",
  modelUrl: "https://project.supabase.co/model",
  extension: "stl",
  sourceUnit: "mm",
  unitScale: 1,
  profileKey: "insight-a1m-pla-020-v1",
  profileVersion: 1,
  expectedProfileFingerprint: "a".repeat(64)
};

test("aceita escalas físicas explícitas", () => {
  assert.equal(parseSliceJob(base).unitScale, 1);
  assert.equal(parseSliceJob({ ...base, sourceUnit: "inch", unitScale: 25.4 }).unitScale, 25.4);
});

test("rejeita escala arbitrária e fingerprint inválido", () => {
  assert.throws(() => parseSliceJob({ ...base, unitScale: 1.1 }), /UNIT_SCALE_INVALID/);
  assert.throws(() => parseSliceJob({ ...base, expectedProfileFingerprint: "latest" }), /PROFILE_FINGERPRINT_INVALID/);
  assert.throws(() => parseSliceJob({ ...base, cliFlags: ["--orient"] }), /JOB_INVALID/);
});
