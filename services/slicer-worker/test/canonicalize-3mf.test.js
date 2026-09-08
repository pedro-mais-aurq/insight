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
  assert.throws(() => selectGeometryEntries(["3D/part.model", "3d/PART.model"]), /THREE_MF_PATH_INVALID/);
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
    assert.deepEqual(stdout.trim().split(/\r?\n/), ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reconstrói components, transforms e múltiplos objetos em milímetros", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-3mf-components-"));
  try {
    const sourceModel = `<?xml version="1.0"?>
<model unit="centimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:v="urn:vendor">
  <metadata name="v:profile">should-disappear</metadata>
  <resources>
    <object id="7" type="model"><mesh><vertices>
      <vertex x="-1" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="-1" y="2" z="0"/>
    </vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>
    <object id="9" type="model"><components>
      <component objectid="7" transform="1 0 0 0 1 0 0 0 1 3 4 5"/>
    </components></object>
  </resources>
  <build>
    <item objectid="9" transform="1 0 0 0 1 0 0 0 1 -2 -3 -5"/>
    <item objectid="7" transform="1 0 0 0 1 0 0 0 1 8 0 0"/>
  </build>
</model>`;
    const input = await makeArchive(root, "components", "vendor-settings", sourceModel);
    const output = path.join(root, "canonical.3mf");
    const result = await canonicalize3mf({
      inputPath: input,
      outputPath: output,
      stagingDir: path.join(root, "stage"),
      sourceUnit: "cm"
    });
    assert.deepEqual(result.dimensionsMm, { x: 90, y: 30, z: 0 });
    const { stdout } = await exec("unzip", ["-p", output, "3D/3dmodel.model"]);
    assert.match(stdout, /<model unit="millimeter"/);
    assert.match(stdout, /<components>/);
    assert.match(stdout, /transform="1 0 0 0 1 0 0 0 1 30 40 50"/);
    assert.equal(stdout.includes("should-disappear"), false);
    assert.equal(stdout.includes("urn:vendor"), false);
    assert.equal((stdout.match(/<item\b/g) ?? []).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolve submodel referenciado e remove extensão de container", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-3mf-submodel-"));
  try {
    const rootModel = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"><resources><object id="1" type="model"><components><component objectid="4" p:path="/3D/Objects/part.model" transform="1 0 0 0 1 0 0 0 1 12 0 0"/></components></object></resources><build><item objectid="1"/></build></model>`;
    const partModel = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="4" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="2" y="0" z="0"/><vertex x="0" y="3" z="0"/></vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build/></model>`;
    const input = await makeArchive(root, "submodel", "{}", rootModel, { "3D/Objects/part.model": partModel });
    const output = path.join(root, "canonical.3mf");
    const result = await canonicalize3mf({ inputPath: input, outputPath: output, stagingDir: path.join(root, "stage"), sourceUnit: "mm" });
    assert.deepEqual(result.dimensionsMm, { x: 2, y: 3, z: 0 });
    const { stdout } = await exec("unzip", ["-p", output, "3D/3dmodel.model"]);
    assert.equal(stdout.includes("p:path"), false);
    assert.equal((stdout.match(/<object\b/g) ?? []).length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejeita geometria ausente, unidade incompatível e limite virtual", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-3mf-policy-"));
  try {
    const noGeometry = await makeArchive(root, "empty", "{}", `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources></resources><build></build></model>`);
    await assert.rejects(() => canonicalize3mf({ inputPath: noGeometry, outputPath: path.join(root, "empty-out.3mf"), stagingDir: path.join(root, "empty-stage"), sourceUnit: "mm" }), /THREE_MF_GEOMETRY_MISSING/);

    const centimeters = await makeArchive(root, "unit", "{}", model.replace("millimeter", "centimeter"));
    await assert.rejects(() => canonicalize3mf({ inputPath: centimeters, outputPath: path.join(root, "unit-out.3mf"), stagingDir: path.join(root, "unit-stage"), sourceUnit: "mm" }), /THREE_MF_UNIT_MISMATCH/);

    const huge = model.replace('<vertex x="1" y="0" z="0"/>', '<vertex x="2001" y="0" z="0"/>');
    const outside = await makeArchive(root, "outside", "{}", huge);
    await assert.rejects(() => canonicalize3mf({ inputPath: outside, outputPath: path.join(root, "outside-out.3mf"), stagingDir: path.join(root, "outside-stage"), sourceUnit: "mm" }), /MODEL_OUTSIDE_BUILD_VOLUME/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function makeArchive(root, name, settings, sourceModel = model, extraModels = {}) {
  const folder = path.join(root, name);
  await mkdir(path.join(folder, "3D"), { recursive: true });
  await mkdir(path.join(folder, "Metadata"), { recursive: true });
  await writeFile(path.join(folder, "3D/3dmodel.model"), sourceModel);
  await writeFile(path.join(folder, "Metadata/project_settings.config"), settings);
  for (const [entry, contents] of Object.entries(extraModels)) {
    await mkdir(path.dirname(path.join(folder, entry)), { recursive: true });
    await writeFile(path.join(folder, entry), contents);
  }
  const output = path.join(root, `${name}.3mf`);
  await exec("zip", ["-q", "-r", output, "3D", "Metadata"], { cwd: folder });
  return output;
}
