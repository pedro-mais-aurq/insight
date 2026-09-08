import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "./canonical-json.js";
import { buildProfileIndex, flattenNamedProfile } from "./profile-flattener.js";
import {
  ESTIMATION_BUILD_VOLUME_MM,
  ESTIMATION_PROFILE_KEY,
  PROFILE_SELECTIONS,
  REAL_PROFILE_KEY,
  withEstimationBuildVolume
} from "./profile-definitions.js";

const OFFICIAL_VENDOR_DIRECTORY = "BBL";

export async function prepareProfiles({
  sourceRoot = process.env.ORCA_PROFILE_SOURCE_ROOT,
  outputRoot = process.env.PROFILE_OUTPUT_ROOT,
  slicerVersion = process.env.ORCA_VERSION,
  generatedAt = process.env.PROFILE_GENERATED_AT
} = {}) {
  if (!sourceRoot || !outputRoot || slicerVersion !== "2.4.2" || !generatedAt) {
    throw new Error("PROFILE_BUILD_CONFIGURATION_INVALID");
  }

  const index = await buildProfileIndex(path.join(sourceRoot, OFFICIAL_VENDOR_DIRECTORY));
  const resolved = Object.fromEntries(Object.entries(PROFILE_SELECTIONS).map(([type, name]) => [
    type,
    flattenNamedProfile(index, type, name)
  ]));
  const real = await writeProfile({
    outputRoot,
    profileKey: REAL_PROFILE_KEY,
    resolved,
    slicerVersion,
    generatedAt
  });
  const estimation = await writeProfile({
    outputRoot,
    profileKey: ESTIMATION_PROFILE_KEY,
    resolved: {
      ...resolved,
      machine: {
        value: withEstimationBuildVolume(resolved.machine.value),
        chain: [
          ...resolved.machine.chain,
          {
            name: "Insight commercial estimation volume 2000 mm",
            source: "generated:profile-definitions.js"
          }
        ]
      }
    },
    slicerVersion,
    generatedAt,
    manifestExtension: {
      purpose: "commercial-estimation",
      baseProfileKey: REAL_PROFILE_KEY,
      virtualBuildVolumeMm: ESTIMATION_BUILD_VOLUME_MM
    }
  });

  return Object.freeze({ real, estimation });
}

async function writeProfile({
  outputRoot,
  profileKey,
  resolved,
  slicerVersion,
  generatedAt,
  manifestExtension = null
}) {
  const profileDir = path.join(outputRoot, profileKey);
  await mkdir(profileDir, { recursive: true });

  const files = {};
  for (const type of Object.keys(PROFILE_SELECTIONS)) {
    const content = `${canonicalJson(resolved[type].value)}\n`;
    const fileName = `${type}.json`;
    await writeFile(path.join(profileDir, fileName), content, { mode: 0o444 });
    files[type] = {
      file: fileName,
      sha256: sha256(content),
      sourceChain: resolved[type].chain
    };
  }

  const manifestCore = profileKey === REAL_PROFILE_KEY
    ? buildPhysicalLegacyManifestCore({ slicerVersion, files, generatedAt, resolved })
    : {
        schemaVersion: 1,
        profileKey,
        profileVersion: 1,
        engine: "OrcaSlicer",
        engineVersion: slicerVersion,
        source: "OrcaSlicer release AppImage resources/profiles",
        sourceReleaseUrl: "https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.4.2",
        generatedAt,
        selections: PROFILE_SELECTIONS,
        supportPolicy: "official-process-preset",
        files,
        ...(manifestExtension ?? {})
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

export function buildPhysicalLegacyManifestCore({
  slicerVersion,
  files,
  generatedAt,
  resolved
}) {
  return {
    profileKey: REAL_PROFILE_KEY,
    engine: "OrcaSlicer",
    engineVersion: slicerVersion,
    files: Object.fromEntries(Object.keys(PROFILE_SELECTIONS).map((type) => [
      type,
      {
        file: files[type].file,
        sha256: files[type].sha256
      }
    ])),
    generatedAt,
    vendor: OFFICIAL_VENDOR_DIRECTORY,
    sourceProfileNames: PROFILE_SELECTIONS,
    sourceProfileChains: Object.fromEntries(Object.keys(PROFILE_SELECTIONS).map((type) => [
      type,
      resolved[type].chain.map((entry) => typeof entry === "string" ? entry : entry.name)
    ]))
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  prepareProfiles()
    .then(({ real, estimation }) => process.stdout.write(
      `REAL_PROFILE_FINGERPRINT=${real.profileFingerprint}\nESTIMATION_PROFILE_FINGERPRINT=${estimation.profileFingerprint}\n`
    ))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
