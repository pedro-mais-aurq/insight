import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareProfiles } from "../src/profile/prepare-profiles.js";

test("gera bundle achatado e fingerprint reprodutível a partir dos presets selecionados", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-profile-test-"));
  try {
    const source = path.join(root, "source");
    const output = path.join(root, "output-1");
    await mkdir(source, { recursive: true });
    await write(source, "machine-base.json", { type: "machine", name: "machine-base", machine_start_gcode: "G28" });
    await write(source, "machine.json", { type: "machine", name: "Bambu Lab A1 mini 0.4 nozzle", inherits: "machine-base", nozzle_diameter: ["0.4"] });
    await write(source, "process-base.json", { type: "process", name: "process-base", sparse_infill_density: "15%" });
    await write(source, "process.json", { type: "process", name: "0.20mm Standard @BBL A1M", inherits: "process-base", layer_height: "0.2" });
    await write(source, "filament-base.json", { type: "filament", name: "filament-base", filament_density: ["1.24"] });
    await write(source, "filament.json", { type: "filament", name: "Bambu PLA Basic @BBL A1M", inherits: "filament-base", filament_type: ["PLA"] });

    const options = { sourceRoot: source, outputRoot: output, slicerVersion: "2.4.2", generatedAt: "2026-07-07T03:33:00.000Z" };
    const first = await prepareProfiles(options);
    const second = await prepareProfiles({ ...options, outputRoot: path.join(root, "output-2") });
    assert.equal(first.profileFingerprint, second.profileFingerprint);
    assert.match(first.profileFingerprint, /^[0-9a-f]{64}$/);
    const processProfile = JSON.parse(await readFile(path.join(output, first.profileKey, "process.json"), "utf8"));
    assert.equal(processProfile.layer_height, "0.2");
    assert.equal(processProfile.sparse_infill_density, "15%");
    assert.equal(Object.hasOwn(processProfile, "inherits"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function write(root, name, value) {
  await writeFile(path.join(root, name), JSON.stringify(value));
}
