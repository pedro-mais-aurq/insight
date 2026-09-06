import assert from "node:assert/strict";
import test from "node:test";
import { ReplayGuard, signPayload, verifyPayload } from "../src/security/hmac.js";
import { createDownloadUrlPolicy } from "../src/security/url-policy.js";

test("HMAC valida corpo exato e bloqueia replay", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  const timestamp = "1700000000000";
  const body = '{"jobId":"one"}';
  const signature = signPayload(secret, timestamp, body);
  assert.equal(verifyPayload(secret, timestamp, body, signature), true);
  assert.equal(verifyPayload(secret, timestamp, `${body} `, signature), false);
  const guard = new ReplayGuard({ now: () => 1700000000000 });
  assert.equal(guard.accept(timestamp, signature), true);
  assert.equal(guard.accept(timestamp, signature), false);
  assert.equal(guard.accept("1699999000000", "another"), false);
});

test("download aceita somente HTTPS e hosts configurados", () => {
  const assertUrl = createDownloadUrlPolicy("project.supabase.co");
  assert.equal(assertUrl("https://project.supabase.co/storage/v1/object/sign/a").hostname, "project.supabase.co");
  assert.throws(() => assertUrl("http://project.supabase.co/a"), /MODEL_URL_NOT_ALLOWED/);
  assert.throws(() => assertUrl("https://127.0.0.1/a"), /MODEL_URL_NOT_ALLOWED/);
  assert.throws(() => assertUrl("https://project.supabase.co.evil.test/a"), /MODEL_URL_NOT_ALLOWED/);
});
