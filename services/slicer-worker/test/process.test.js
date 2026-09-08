import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runProcess } from "../src/orca/process.js";
import { SerialQueue } from "../src/server.js";

test("timeout encerra o grupo e conclui a promise com diagnóstico", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-process-group-"));
  const marker = path.join(root, "orphan-marker");
  const grandchild = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'orphan'), 250); setInterval(() => {}, 1000);`;
  const parent = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'ignore' }); setInterval(() => {}, 1000);`;
  try {
    await assert.rejects(
      () => runProcess(process.execPath, ["-e", parent], { timeoutMs: 100 }),
      (error) => (
        error.message === "SLICER_TIMEOUT"
        && error.details.signal === "SIGKILL"
        && error.details.outputTruncated === false
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    await assert.rejects(() => access(marker));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("falha de spawn rejeita sem shell ou retry implícito", async () => {
  await assert.rejects(
    () => runProcess("/definitely/missing/insight-command", [], { timeoutMs: 100 }),
    (error) => error.code === "ENOENT"
  );
});

test("job posterior entra na SerialQueue depois de timeout", async () => {
  const queue = new SerialQueue(1);
  await assert.rejects(
    () => queue.run(() => runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 30 })),
    /SLICER_TIMEOUT/
  );
  assert.equal(await queue.run(async () => "job-b-completed"), "job-b-completed");
});
