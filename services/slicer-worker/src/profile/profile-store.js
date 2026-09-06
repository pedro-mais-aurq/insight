import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "./canonical-json.js";

export async function loadProfile(profileRoot, profileKey) {
  assertSafeSegment(profileKey);
  const root = path.join(profileRoot, profileKey);
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));

  if (
    manifest.profileKey !== profileKey
    || manifest.engine !== "OrcaSlicer"
    || manifest.engineVersion !== "2.4.2"
    || !isSha256(manifest.profileFingerprint)
  ) {
    throw new Error("PROFILE_MANIFEST_INVALID");
  }

  const profileFiles = {};
  for (const type of ["machine", "process", "filament"]) {
    const descriptor = manifest.files?.[type];
    if (descriptor?.file !== `${type}.json` || !isSha256(descriptor.sha256)) {
      throw new Error("PROFILE_MANIFEST_INVALID");
    }
    const filePath = path.join(root, descriptor.file);
    const content = await readFile(filePath, "utf8");
    if (sha256(content) !== descriptor.sha256) throw new Error("PROFILE_FILE_MISMATCH");
    JSON.parse(content);
    profileFiles[type] = filePath;
  }

  const { profileFingerprint, ...manifestCore } = manifest;
  if (sha256(canonicalJson(manifestCore)) !== profileFingerprint) {
    throw new Error("SLICER_PROFILE_MISMATCH");
  }

  return Object.freeze({ root, manifest, files: Object.freeze(profileFiles) });
}

function assertSafeSegment(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value)) {
    throw new Error("PROFILE_KEY_INVALID");
  }
}

function isSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
