import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "./canonical-json.js";
import { buildProfileIndex, flattenNamedProfile } from "./profile-flattener.js";

const PROFILE_KEY = "insight-a1m-pla-020-v1";
const selections = Object.freeze({
  machine: "Bambu Lab A1 mini 0.4 nozzle",
  process: "0.20mm Standard @BBL A1M",
  filament: "Bambu PLA Basic @BBL A1M"
});

export async function prepareProfiles({
  sourceRoot = process.env.ORCA_PROFILE_SOURCE_ROOT,
  outputRoot = process.env.PROFILE_OUTPUT_ROOT,
  slicerVersion = process.env.ORCA_VERSION,
  generatedAt = process.env.PROFILE_GENERATED_AT
} = {}) {
  if (!sourceRoot || !outputRoot || slicerVersion !== "2.4.2" || !generatedAt) {
    throw new Error("PROFILE_BUILD_CONFIGURATION_INVALID");
  }

  const index = await buildProfileIndex(sourceRoot);
  const resolved = Object.fromEntries(Object.entries(selections).map(([type, name]) => [
    type,
    flattenNamedProfile(index, type, name)
  ]));
  const profileDir = path.join(outputRoot, PROFILE_KEY);
  await mkdir(profileDir, { recursive: true });

  const files = {};
  for (const type of Object.keys(selections)) {
    const content = `${canonicalJson(resolved[type].value)}\n`;
    const fileName = `${type}.json`;
    await writeFile(path.join(profileDir, fileName), content, { mode: 0o444 });
    files[type] = {
      file: fileName,
      sha256: sha256(content),
      sourceChain: resolved[type].chain
    };
  }

  const manifestCore = {
    schemaVersion: 1,
    profileKey: PROFILE_KEY,
    profileVersion: 1,
    engine: "OrcaSlicer",
    engineVersion: slicerVersion,
    source: "OrcaSlicer release AppImage resources/profiles",
    sourceReleaseUrl: "https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.4.2",
    generatedAt,
    selections,
    supportPolicy: "official-process-preset",
    files
  };
  const profileFingerprint = sha256(canonicalJson(manifestCore));
  const manifest = { ...manifestCore, profileFingerprint };
  await writeFile(
    path.join(profileDir, "manifest.json"),
    `${canonicalJson(manifest)}\n`,
    { mode: 0o444 }
  );

  return manifest;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  prepareProfiles()
    .then((manifest) => process.stdout.write(`${manifest.profileFingerprint}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
