import assert from "node:assert/strict";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  classifyExecutionFailure,
  deriveOrcaReturnCode,
  OrcaSlicerAdapter
} from "../src/orca/orca-adapter.js";

test("classifica volume, complexidade e profile sem expor stderr", () => {
  assert.equal(classifyExecutionFailure({ stderr: "Object is outside the build volume" }), "MODEL_OUTSIDE_BUILD_VOLUME");
  assert.equal(classifyExecutionFailure({ stderr: "Model is too complex: too many triangles" }), "MODEL_TOO_COMPLEX");
  assert.equal(classifyExecutionFailure({ stderr: "Failed to load profile" }), "SLICER_PROFILE_INVALID");
  assert.equal(classifyExecutionFailure({ stderr: "native process failed" }), "SLICER_UNAVAILABLE");
});

test("classifica códigos Orca raw, convertidos no Unix e por texto", () => {
  for (const [execution, expectedCode, expectedReturn] of [
    [{ code: -24 }, "ORCA_FILE_VERSION_UNSUPPORTED", -24],
    [{ code: 232 }, "ORCA_FILE_VERSION_UNSUPPORTED", -24],
    [{ stderr: "CLI_FILE_VERSION_NOT_SUPPORTED" }, "ORCA_FILE_VERSION_UNSUPPORTED", -24],
    [{ code: -50 }, "ORCA_NO_SUITABLE_OBJECTS", -50],
    [{ code: 206 }, "ORCA_NO_SUITABLE_OBJECTS", -50],
    [{ stdout: "run found error, return -50, exit..." }, "ORCA_NO_SUITABLE_OBJECTS", -50],
    [{ code: -100 }, "ORCA_SLICING_ERROR", -100],
    [{ code: 156 }, "ORCA_SLICING_ERROR", -100],
    [{ stdout: "run found error, return -100, exit..." }, "ORCA_SLICING_ERROR", -100]
  ]) {
    assert.equal(deriveOrcaReturnCode(execution), expectedReturn);
    assert.equal(classifyExecutionFailure(execution), expectedCode);
  }
  assert.notEqual(classifyExecutionFailure({ code: 206 }), "MODEL_OUTSIDE_BUILD_VOLUME");
});

test("classifica SIGSEGV, exit 139 e segmentation fault como crash", () => {
  assert.equal(classifyExecutionFailure({ signal: "SIGSEGV" }), "ORCA_PROCESS_CRASH");
  assert.equal(classifyExecutionFailure({ code: 139 }), "ORCA_PROCESS_CRASH");
  assert.equal(classifyExecutionFailure({ stdout: "Segmentation fault (core dumped)" }), "ORCA_PROCESS_CRASH");
});

test("preserva timeout e converte falha de spawn em indisponibilidade observável", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-adapter-failure-"));
  const inputPath = path.join(root, "input.obj");
  const profile = { files: { machine: "machine.json", process: "process.json", filament: "filament.json" } };
  await writeFile(inputPath, "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
  try {
    const timeout = Object.assign(new Error("SLICER_TIMEOUT"), {
      details: { code: null, signal: "SIGKILL", stdout: "", stderr: "", outputTruncated: false }
    });
    const timeoutAdapter = new OrcaSlicerAdapter({ orcaBinary: "/missing", run: async () => { throw timeout; } });
    await assert.rejects(
      () => timeoutAdapter.slice({ inputPath, extension: "obj", sourceUnit: "mm", unitScale: 1, profile, workDir: path.join(root, "timeout") }),
      (error) => error.message === "SLICER_TIMEOUT" && error.details.signal === "SIGKILL"
    );

    const spawnAdapter = new OrcaSlicerAdapter({ orcaBinary: "/missing", run: async () => { throw Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }); } });
    await assert.rejects(
      () => spawnAdapter.slice({ inputPath, extension: "obj", sourceUnit: "mm", unitScale: 1, profile, workDir: path.join(root, "spawn") }),
      (error) => error.message === "SLICER_UNAVAILABLE" && error.details.code === null
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cria XDG_RUNTIME_DIR 0700 exclusivo dentro do diretório do job", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-adapter-runtime-"));
  const workDir = path.join(root, "job-a");
  const inputPath = path.join(root, "input.obj");
  const profile = { files: { machine: "machine.json", process: "process.json", filament: "filament.json" } };
  let processEnv;
  await writeFile(inputPath, "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");

  try {
    const adapter = new OrcaSlicerAdapter({
      orcaBinary: "/missing",
      run: async (_command, _args, options) => {
        processEnv = options.env;
        throw new Error("spawn ENOENT");
      }
    });
    await assert.rejects(
      () => adapter.slice({ inputPath, extension: "obj", sourceUnit: "mm", unitScale: 1, profile, workDir }),
      /SLICER_UNAVAILABLE/
    );

    const expected = path.join(workDir, "runtime-home", ".runtime");
    assert.equal(processEnv.XDG_RUNTIME_DIR, expected);
    assert.equal(path.relative(workDir, processEnv.XDG_RUNTIME_DIR).startsWith(".."), false);
    assert.equal((await stat(expected)).mode & 0o777, 0o700);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
