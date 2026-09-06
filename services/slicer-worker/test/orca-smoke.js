import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OrcaSlicerAdapter } from "../src/orca/orca-adapter.js";
import { runProcess } from "../src/orca/process.js";
import { loadProfile } from "../src/profile/profile-store.js";

const root = await mkdtemp(path.join(process.env.WORK_ROOT ?? os.tmpdir(), "orca-smoke-"));
try {
  const profile = await loadProfile(
    process.env.PROFILE_ROOT ?? "/app/profiles",
    process.env.PROFILE_KEY ?? "insight-a1m-pla-020-v1"
  );
  const adapter = new OrcaSlicerAdapter({
    orcaBinary: process.env.ORCA_SLICER_BIN ?? "/opt/orca/AppRun",
    timeoutMs: 90_000
  });

  const first = await runFixture("cube-first", "cube.stl", "stl", "mm", 1);
  const second = await runFixture("cube-second", "cube.stl", "stl", "mm", 1);
  assert.deepEqual(metrics(second), metrics(first), "repeated real slices must be deterministic");
  assert.match(profile.manifest.profileFingerprint, /^[0-9a-f]{64}$/);

  const unitResults = [];
  for (const [name, sourceUnit, unitScale] of [
    ["cube-mm", "mm", 1],
    ["cube-cm", "cm", 10],
    ["cube-m", "m", 1000],
    ["cube-inch", "inch", 25.4]
  ]) {
    const workDir = path.join(root, name);
    await mkdir(workDir);
    const inputPath = path.join(workDir, "cube.obj");
    await writeFile(inputPath, cubeObj(20 / unitScale));
    unitResults.push(await slice({ inputPath, extension: "obj", sourceUnit, unitScale, workDir }));
  }
  for (const result of unitResults.slice(1)) {
    assert.ok(Math.abs(result.weightGrams - unitResults[0].weightGrams) <= 0.01);
    assert.ok(Math.abs(result.printTimeSeconds - unitResults[0].printTimeSeconds) <= 2);
  }

  await runFixture("overhang", "overhang.obj", "obj", "mm", 1);

  const first3mf = await createThreeMf("three-a", "0.08", "100%");
  const second3mf = await createThreeMf("three-b", "0.28", "5%");
  const first3mfResult = await slice({
    inputPath: first3mf.inputPath,
    extension: "3mf",
    sourceUnit: "mm",
    unitScale: 1,
    workDir: first3mf.workDir
  });
  const second3mfResult = await slice({
    inputPath: second3mf.inputPath,
    extension: "3mf",
    sourceUnit: "mm",
    unitScale: 1,
    workDir: second3mf.workDir
  });
  assert.deepEqual(metrics(second3mfResult), metrics(first3mfResult), "embedded 3MF settings must not affect estimates");

  await assert.rejects(
    () => runFixture("outside", "outside-build-volume.obj", "obj", "mm", 1),
    /MODEL_OUTSIDE_BUILD_VOLUME/
  );

  process.stdout.write(`${JSON.stringify({
    status: "completed",
    profileFingerprint: profile.manifest.profileFingerprint,
    first: metrics(first),
    repeated: metrics(second),
    units: unitResults.map(metrics)
  })}\n`);

  async function runFixture(name, fixture, extension, sourceUnit, unitScale) {
    const workDir = path.join(root, name);
    await mkdir(workDir);
    const inputPath = path.join(workDir, fixture);
    await copyFile(new URL(`./fixtures/${fixture}`, import.meta.url), inputPath);
    return slice({ inputPath, extension, sourceUnit, unitScale, workDir });
  }

  async function slice({ inputPath, extension, sourceUnit, unitScale, workDir }) {
    const result = await adapter.slice({ inputPath, extension, sourceUnit, unitScale, profile, workDir });
    assert.ok(result.weightGrams > 0 && result.weightGrams <= 10_000);
    assert.ok(result.printTimeSeconds > 0 && result.printTimeSeconds <= 2_592_000);
    return result;
  }

  async function createThreeMf(name, layerHeight, infill) {
    const workDir = path.join(root, name);
    const sourceDir = path.join(workDir, "source");
    await mkdir(path.join(sourceDir, "3D"), { recursive: true });
    await mkdir(path.join(sourceDir, "Metadata"), { recursive: true });
    await writeFile(path.join(sourceDir, "3D/3dmodel.model"), cubeThreeMfModel());
    await writeFile(path.join(sourceDir, "Metadata/project_settings.config"), JSON.stringify({ layerHeight, infill }));
    const inputPath = path.join(workDir, "input.3mf");
    const archived = await runProcess("zip", ["-q", "-r", inputPath, "3D", "Metadata"], {
      cwd: sourceDir,
      timeoutMs: 20_000
    });
    assert.equal(archived.code, 0);
    return { inputPath, workDir };
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function metrics(result) {
  return { weightGrams: result.weightGrams, printTimeSeconds: result.printTimeSeconds };
}

function cubeObj(size) {
  return `o cube
v 0 0 0
v ${size} 0 0
v ${size} ${size} 0
v 0 ${size} 0
v 0 0 ${size}
v ${size} 0 ${size}
v ${size} ${size} ${size}
v 0 ${size} ${size}
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
}

function cubeThreeMfModel() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources><object id="1" type="model"><mesh><vertices>
    <vertex x="0" y="0" z="0"/><vertex x="20" y="0" z="0"/>
    <vertex x="20" y="20" z="0"/><vertex x="0" y="20" z="0"/>
    <vertex x="0" y="0" z="20"/><vertex x="20" y="0" z="20"/>
    <vertex x="20" y="20" z="20"/><vertex x="0" y="20" z="20"/>
  </vertices><triangles>
    <triangle v1="0" v2="3" v3="2"/><triangle v1="0" v2="2" v3="1"/>
    <triangle v1="4" v2="5" v3="6"/><triangle v1="4" v2="6" v3="7"/>
    <triangle v1="0" v2="1" v3="5"/><triangle v1="0" v2="5" v3="4"/>
    <triangle v1="1" v2="2" v3="6"/><triangle v1="1" v2="6" v3="5"/>
    <triangle v1="2" v2="3" v3="7"/><triangle v1="2" v2="7" v3="6"/>
    <triangle v1="3" v2="0" v3="4"/><triangle v1="3" v2="4" v3="7"/>
  </triangles></mesh></object></resources><build><item objectid="1"/></build>
</model>\n`;
}
