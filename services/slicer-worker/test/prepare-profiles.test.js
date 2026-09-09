import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareProfiles } from "../src/profile/prepare-profiles.js";
import {
  APPROVED_REAL_PROFILE_FINGERPRINT,
  ESTIMATION_PROFILE_KEY,
  REAL_PROFILE_KEY
} from "../src/profile/profile-definitions.js";

test("gera bundle achatado e fingerprint reprodutível a partir dos presets selecionados", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-profile-test-"));
  try {
    const source = path.join(root, "source");
    const output = path.join(root, "output-1");
    await mkdir(source, { recursive: true });
    await write(source, "machine-base.json", {
      type: "machine",
      name: "machine-base",
      machine_start_gcode: "G28",
      printable_area: ["0x0", "180x0", "180x180", "0x180"],
      printable_height: "180"
    });
    await write(source, "machine.json", { type: "machine", name: "Bambu Lab A1 mini 0.4 nozzle", inherits: "machine-base", nozzle_diameter: ["0.4"] });
    await write(source, "process-base.json", { type: "process", name: "process-base", sparse_infill_density: "15%" });
    await write(source, "process.json", { type: "process", name: "0.20mm Standard @BBL A1M", inherits: "process-base", layer_height: "0.2" });
    await write(source, "filament-base.json", { type: "filament", name: "filament-base", filament_density: ["1.24"] });
    await write(source, "filament.json", { type: "filament", name: "Bambu PLA Basic @BBL A1M", inherits: "filament-base", filament_type: ["PLA"] });

    const options = { sourceRoot: source, outputRoot: output, slicerVersion: "2.4.2", generatedAt: "2026-07-07T03:33:00.000Z" };
    const first = await prepareProfiles(options);
    const second = await prepareProfiles({ ...options, outputRoot: path.join(root, "output-2") });
    assert.equal(first.real.profileFingerprint, second.real.profileFingerprint);
    assert.equal(first.estimation.profileFingerprint, second.estimation.profileFingerprint);
    assert.notEqual(first.real.profileFingerprint, first.estimation.profileFingerprint);
    assert.equal(first.real.profileKey, REAL_PROFILE_KEY);
    assert.equal(first.estimation.profileKey, ESTIMATION_PROFILE_KEY);
    assert.match(first.real.profileFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(APPROVED_REAL_PROFILE_FINGERPRINT, "29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46");
    const processProfile = JSON.parse(await readFile(path.join(output, first.real.profileKey, "process.json"), "utf8"));
    assert.equal(processProfile.layer_height, "0.2");
    assert.equal(processProfile.sparse_infill_density, "15%");
    assert.equal(Object.hasOwn(processProfile, "inherits"), false);
    const realMachine = JSON.parse(await readFile(path.join(output, REAL_PROFILE_KEY, "machine.json"), "utf8"));
    const estimationMachine = JSON.parse(await readFile(path.join(output, ESTIMATION_PROFILE_KEY, "machine.json"), "utf8"));
    assert.deepEqual(realMachine.printable_area, ["0x0", "180x0", "180x180", "0x180"]);
    assert.equal(realMachine.printable_height, "180");
    assert.deepEqual(estimationMachine.printable_area, ["0x0", "2000x0", "2000x2000", "0x2000"]);
    assert.equal(estimationMachine.printable_height, "2000");
    assert.deepEqual(
      Object.keys(estimationMachine).filter((key) => JSON.stringify(estimationMachine[key]) !== JSON.stringify(realMachine[key])).sort(),
      ["printable_area", "printable_height"]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function write(root, name, value) {
  await writeFile(path.join(root, name), JSON.stringify(value));
}
