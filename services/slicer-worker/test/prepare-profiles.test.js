import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson } from "../src/profile/canonical-json.js";
import {
  buildPhysicalLegacyManifestCore,
  prepareProfiles
} from "../src/profile/prepare-profiles.js";
import {
  APPROVED_REAL_PROFILE_FINGERPRINT,
  ESTIMATION_PROFILE_KEY,
  REAL_PROFILE_KEY
} from "../src/profile/profile-definitions.js";

test("gera bundle reprodutível usando exclusivamente o catálogo oficial BBL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-profile-test-"));
  try {
    const source = path.join(root, "source");
    const bblSource = path.join(source, "BBL");
    const otherVendorSource = path.join(source, "OrcaArena");
    const output = path.join(root, "output-1");
    await mkdir(bblSource, { recursive: true });
    await mkdir(otherVendorSource, { recursive: true });
    await write(bblSource, "machine-base.json", {
      type: "machine",
      name: "fdm_bbl_3dp_001_common",
      machine_start_gcode: "G28",
      printable_area: ["0x0", "180x0", "180x180", "0x180"],
      printable_height: "180"
    });
    await write(bblSource, "machine.json", { type: "machine", name: "Bambu Lab A1 mini 0.4 nozzle", inherits: "fdm_bbl_3dp_001_common", nozzle_diameter: ["0.4"] });
    await write(bblSource, "process-base.json", { type: "process", name: "process-base", sparse_infill_density: "15%" });
    await write(bblSource, "process.json", { type: "process", name: "0.20mm Standard @BBL A1M", inherits: "process-base", layer_height: "0.2" });
    await write(bblSource, "filament-base.json", { type: "filament", name: "filament-base", filament_density: ["1.24"] });
    await write(bblSource, "filament.json", { type: "filament", name: "Bambu PLA Basic @BBL A1M", inherits: "filament-base", filament_type: ["PLA"] });
    await write(otherVendorSource, "machine-base.json", {
      type: "machine",
      name: "fdm_bbl_3dp_001_common",
      machine_start_gcode: "FOREIGN_VENDOR"
    });

    const options = { sourceRoot: source, outputRoot: output, slicerVersion: "2.4.2", generatedAt: "2026-07-07T03:33:00.000Z" };
    const first = await prepareProfiles(options);
    const second = await prepareProfiles({ ...options, outputRoot: path.join(root, "output-2") });
    assert.equal(first.real.profileFingerprint, second.real.profileFingerprint);
    assert.equal(first.estimation.profileFingerprint, second.estimation.profileFingerprint);
    assert.notEqual(first.real.profileFingerprint, first.estimation.profileFingerprint);
    assert.notEqual(REAL_PROFILE_KEY, ESTIMATION_PROFILE_KEY);
    assert.equal(first.real.profileKey, REAL_PROFILE_KEY);
    assert.equal(first.estimation.profileKey, ESTIMATION_PROFILE_KEY);
    assert.match(first.real.profileFingerprint, /^[0-9a-f]{64}$/);
    assert.match(first.estimation.profileFingerprint, /^[0-9a-f]{64}$/);
    assert.equal(APPROVED_REAL_PROFILE_FINGERPRINT, "29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46");
    const realManifest = JSON.parse(await readFile(path.join(output, REAL_PROFILE_KEY, "manifest.json"), "utf8"));
    const { profileFingerprint, ...realManifestCore } = realManifest;
    assert.equal(profileFingerprint, sha256(canonicalJson(realManifestCore)));
    for (const type of ["machine", "process", "filament"]) {
      const bytes = await readFile(path.join(output, REAL_PROFILE_KEY, `${type}.json`));
      assert.equal(realManifest.files[type].sha256, sha256(bytes));
    }
    const processProfile = JSON.parse(await readFile(path.join(output, first.real.profileKey, "process.json"), "utf8"));
    assert.equal(processProfile.layer_height, "0.2");
    assert.equal(processProfile.sparse_infill_density, "15%");
    assert.equal(Object.hasOwn(processProfile, "inherits"), false);
    const realMachine = JSON.parse(await readFile(path.join(output, REAL_PROFILE_KEY, "machine.json"), "utf8"));
    const estimationMachine = JSON.parse(await readFile(path.join(output, ESTIMATION_PROFILE_KEY, "machine.json"), "utf8"));
    assert.equal(realMachine.machine_start_gcode, "G28");
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

test("calcula naturalmente o fingerprint físico legado aprovado", () => {
  const files = {
    machine: {
      file: "machine.json",
      sha256: "0139a5b5737452a3cd91ca7b6e6670626b0134b0b372e39238917e922b4a5325"
    },
    process: {
      file: "process.json",
      sha256: "11ebdf6d264f4246c7bba132af7d33e5c28167295dfa7e54a2167e56645113a8"
    },
    filament: {
      file: "filament.json",
      sha256: "81832f4f86ca7bbfa19c20d9ec6699f5361232be74b16092c01ffcd921ed1aa9"
    }
  };
  const resolved = {
    machine: {
      chain: [
        "fdm_machine_common",
        "fdm_bbl_3dp_001_common",
        "Bambu Lab A1 mini 0.4 nozzle"
      ]
    },
    process: {
      chain: [
        "fdm_process_common",
        "fdm_process_single_common",
        "fdm_process_single_0.20",
        "0.20mm Standard @BBL A1M"
      ]
    },
    filament: {
      chain: [
        "fdm_filament_common",
        "fdm_filament_pla",
        "Bambu PLA Basic @base",
        "Bambu PLA Basic @BBL A1M"
      ]
    }
  };
  const manifestCore = buildPhysicalLegacyManifestCore({
    slicerVersion: "2.4.2",
    files,
    generatedAt: "2026-07-07T03:33:00.000Z",
    resolved
  });

  assert.equal(
    sha256(canonicalJson(manifestCore)),
    "29b61bb6e0d3c5f9e7cfb8a763a735236ff25ee2af88111939d240cfe9be0d46"
  );
});

async function write(root, name, value) {
  await writeFile(path.join(root, name), JSON.stringify(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
