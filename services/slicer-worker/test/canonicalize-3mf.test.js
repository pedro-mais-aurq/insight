import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalize3mf, selectGeometryEntries } from "../src/orca/canonicalize-3mf.js";

const exec = promisify(execFile);
const model = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="0" y="1" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;

test("seleciona só geometria e bloqueia traversal", () => {
  assert.deepEqual(selectGeometryEntries(["Metadata/project_settings.config", "3D/3dmodel.model"]), ["3D/3dmodel.model"]);
  assert.throws(() => selectGeometryEntries(["../escape.model"]), /THREE_MF_PATH_INVALID/);
});

test("rejeita arquivo corrompido antes do slicing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-3mf-corrupt-"));
  try {
    const input = path.join(root, "corrupt.3mf");
    await writeFile(input, "not-a-zip");
    await assert.rejects(() => canonicalize3mf({
      inputPath: input,
      outputPath: path.join(root, "out.3mf"),
      stagingDir: path.join(root, "stage"),
      sourceUnit: "mm"
    }), /THREE_MF_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("3MFs com a mesma geometria e settings diferentes viram o mesmo pacote", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-3mf-test-"));
  try {
    const first = await makeArchive(root, "first", '{"speed":100}');
    const second = await makeArchive(root, "second", '{"speed":999}');
    const out1 = path.join(root, "out1.3mf");
    const out2 = path.join(root, "out2.3mf");
    await canonicalize3mf({ inputPath: first, outputPath: out1, stagingDir: path.join(root, "stage1"), sourceUnit: "mm" });
    await canonicalize3mf({ inputPath: second, outputPath: out2, stagingDir: path.join(root, "stage2"), sourceUnit: "mm" });
    assert.deepEqual(await readFile(out1), await readFile(out2));
    const { stdout } = await exec("unzip", ["-Z1", out1]);
    assert.equal(stdout.includes("Metadata/project_settings.config"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function makeArchive(root, name, settings) {
  const folder = path.join(root, name);
  await mkdir(path.join(folder, "3D"), { recursive: true });
  await mkdir(path.join(folder, "Metadata"), { recursive: true });
  await writeFile(path.join(folder, "3D/3dmodel.model"), model);
  await writeFile(path.join(folder, "Metadata/project_settings.config"), settings);
  const output = path.join(root, `${name}.3mf`);
  await exec("zip", ["-q", "-r", output, "3D", "Metadata"], { cwd: folder });
  return output;
}
