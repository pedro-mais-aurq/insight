import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";
import {
  join,
  resolve,
  sep
} from "node:path";

import { canonicalJson } from "./canonical-json.js";

const DEFAULT_PROFILES_ROOT =
  "/build/squashfs-root/resources/profiles";

const DEFAULT_OUTPUT_ROOT =
  "/build/profiles";

const VENDOR_KEY = "BBL";

const PROFILE_KEY =
  "insight-a1m-pla-020-v1";

const SOURCE_PROFILE_NAMES = Object.freeze({
  machine: "Bambu Lab A1 mini 0.4 nozzle",
  process: "0.20mm Standard @BBL A1M",
  filament: "Bambu PLA Basic @BBL A1M"
});

const PROFILE_TYPES = Object.freeze([
  "machine",
  "process",
  "filament"
]);

const MANIFEST_LIST_KEYS = Object.freeze({
  machine: "machine_list",
  process: "process_list",
  filament: "filament_list"
});

function profileError(code, details = "") {
  return new Error(
    details
      ? `${code}:${details}`
      : code
  );
}

function sha256(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

async function readJsonFile(
  filePath,
  context
) {
  let raw;

  try {
    raw = await readFile(
      filePath,
      "utf8"
    );
  } catch {
    throw profileError(
      "PROFILE_FILE_UNREADABLE",
      `${context}:${filePath}`
    );
  }

  try {
    return JSON.parse(
      raw.replace(/^\uFEFF/, "")
    );
  } catch {
    throw profileError(
      "PROFILE_JSON_INVALID",
      `${context}:${filePath}`
    );
  }
}

function assertSafeSubPath(
  vendorRoot,
  subPath,
  type,
  name
) {
  if (
    typeof subPath !== "string" ||
    !subPath
  ) {
    throw profileError(
      "PROFILE_PATH_INVALID",
      `${type}:${name}`
    );
  }

  const root =
    resolve(vendorRoot);

  const target =
    resolve(vendorRoot, subPath);

  if (
    target !== root &&
    !target.startsWith(
      `${root}${sep}`
    )
  ) {
    throw profileError(
      "PROFILE_PATH_OUTSIDE_VENDOR",
      `${type}:${name}`
    );
  }

  return target;
}

function buildProfileIndex(
  manifest,
  type
) {
  const listKey =
    MANIFEST_LIST_KEYS[type];

  const entries =
    manifest[listKey];

  if (!Array.isArray(entries)) {
    throw profileError(
      "PROFILE_MANIFEST_INVALID",
      `${type}:${listKey}`
    );
  }

  const index = new Map();

  for (const entry of entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.name !== "string" ||
      typeof entry.sub_path !== "string"
    ) {
      throw profileError(
        "PROFILE_MANIFEST_ENTRY_INVALID",
        type
      );
    }

    if (index.has(entry.name)) {
      throw profileError(
        "PROFILE_NAME_AMBIGUOUS",
        `${type}:${entry.name}`
      );
    }

    index.set(entry.name, {
      name: entry.name,
      subPath: entry.sub_path
    });
  }

  return index;
}

function normalizeParentName(
  inherits,
  type,
  name
) {
  if (
    inherits === undefined ||
    inherits === null ||
    inherits === ""
  ) {
    return null;
  }

  if (
    typeof inherits === "string"
  ) {
    return inherits.trim() || null;
  }

  if (
    Array.isArray(inherits) &&
    inherits.length === 1 &&
    typeof inherits[0] === "string"
  ) {
    return inherits[0].trim() || null;
  }

  throw profileError(
    "PROFILE_INHERITANCE_AMBIGUOUS",
    `${type}:${name}`
  );
}

function mergeProfile(
  parent,
  child
) {
  const {
    inherits: _ignored,
    ...childWithoutInheritance
  } = child;

  return {
    ...parent,
    ...childWithoutInheritance
  };
}

function createResolver({
  vendorRoot,
  indexes
}) {
  const profileCache =
    new Map();

  const chainCache =
    new Map();

  async function resolveProfile(
    type,
    name,
    stack = []
  ) {
    if (
      !PROFILE_TYPES.includes(type)
    ) {
      throw profileError(
        "PROFILE_TYPE_INVALID",
        type
      );
    }

    const key =
      `${type}:${name}`;

    if (profileCache.has(key)) {
      return {
        profile:
          profileCache.get(key),

        chain:
          chainCache.get(key)
      };
    }

    if (stack.includes(key)) {
      throw profileError(
        "PROFILE_INHERITANCE_CYCLE",
        [...stack, key].join("->")
      );
    }

    const entry =
      indexes[type].get(name);

    if (!entry) {
      throw profileError(
        "PROFILE_NOT_FOUND",
        `${type}:${name}`
      );
    }

    const filePath =
      assertSafeSubPath(
        vendorRoot,
        entry.subPath,
        type,
        name
      );

    const rawProfile =
      await readJsonFile(
        filePath,
        `${type}:${name}`
      );

    if (
      !rawProfile ||
      typeof rawProfile !== "object" ||
      Array.isArray(rawProfile)
    ) {
      throw profileError(
        "PROFILE_JSON_INVALID",
        `${type}:${name}`
      );
    }

    if (
      typeof rawProfile.name !==
        "string" ||
      rawProfile.name !== name
    ) {
      throw profileError(
        "PROFILE_NAME_MISMATCH",
        `${type}:${name}`
      );
    }

    const parentName =
      normalizeParentName(
        rawProfile.inherits,
        type,
        name
      );

    let profile;
    let chain;

    if (!parentName) {
      const {
        inherits: _ignored,
        ...base
      } = rawProfile;

      profile = base;
      chain = [name];
    } else {
      const parent =
        await resolveProfile(
          type,
          parentName,
          [...stack, key]
        );

      profile =
        mergeProfile(
          parent.profile,
          rawProfile
        );

      chain = [
        ...parent.chain,
        name
      ];
    }

    profileCache.set(
      key,
      Object.freeze(profile)
    );

    chainCache.set(
      key,
      Object.freeze(chain)
    );

    return {
      profile,
      chain
    };
  }

  return resolveProfile;
}

async function writeProfile(
  outputDirectory,
  type,
  profile
) {
  /*
   * Usamos canonicalJson também para os
   * arquivos finais, garantindo saída
   * determinística.
   */
  const content =
    `${canonicalJson(profile)}\n`;

  const filename =
    `${type}.json`;

  await writeFile(
    join(
      outputDirectory,
      filename
    ),
    content,
    {
      encoding: "utf8",
      mode: 0o644
    }
  );

  return {
    file: filename,
    sha256: sha256(content)
  };
}

export async function prepareProfiles(
  options = {}
) {
  const profilesRoot =
    options.profilesRoot ??
    process.env.ORCA_PROFILES_ROOT ??
    DEFAULT_PROFILES_ROOT;

  const outputRoot =
    options.outputRoot ??
    process.env.PROFILE_OUTPUT_ROOT ??
    DEFAULT_OUTPUT_ROOT;

  const engineVersion =
    options.engineVersion ??
    process.env.ORCA_VERSION ??
    "2.4.2";

  const generatedAt =
    options.generatedAt ??
    process.env.PROFILE_GENERATED_AT;

  if (
    typeof generatedAt !== "string" ||
    Number.isNaN(
      Date.parse(generatedAt)
    )
  ) {
    throw profileError(
      "PROFILE_GENERATED_AT_INVALID"
    );
  }

  const vendorManifestPath =
    join(
      profilesRoot,
      `${VENDOR_KEY}.json`
    );

  const vendorRoot =
    join(
      profilesRoot,
      VENDOR_KEY
    );

  const vendorManifest =
    await readJsonFile(
      vendorManifestPath,
      `vendor:${VENDOR_KEY}`
    );

  const indexes = {
    machine:
      buildProfileIndex(
        vendorManifest,
        "machine"
      ),

    process:
      buildProfileIndex(
        vendorManifest,
        "process"
      ),

    filament:
      buildProfileIndex(
        vendorManifest,
        "filament"
      )
  };

  const resolveProfile =
    createResolver({
      vendorRoot,
      indexes
    });

  const machine =
    await resolveProfile(
      "machine",
      SOURCE_PROFILE_NAMES.machine
    );

  const processProfile =
    await resolveProfile(
      "process",
      SOURCE_PROFILE_NAMES.process
    );

  const filament =
    await resolveProfile(
      "filament",
      SOURCE_PROFILE_NAMES.filament
    );

  const outputDirectory =
    join(
      outputRoot,
      PROFILE_KEY
    );

  await mkdir(
    outputDirectory,
    {
      recursive: true,
      mode: 0o755
    }
  );

  /*
   * Os hashes precisam corresponder aos
   * bytes EXATOS que profile-store.js
   * posteriormente lê.
   */
  const files = {
    machine:
      await writeProfile(
        outputDirectory,
        "machine",
        machine.profile
      ),

    process:
      await writeProfile(
        outputDirectory,
        "process",
        processProfile.profile
      ),

    filament:
      await writeProfile(
        outputDirectory,
        "filament",
        filament.profile
      )
  };

  /*
   * IMPORTANTE:
   *
   * profile-store.js calcula:
   *
   * const {
   *   profileFingerprint,
   *   ...manifestCore
   * } = manifest;
   *
   * sha256(canonicalJson(manifestCore))
   *
   * Portanto precisamos produzir
   * exatamente o mesmo contrato.
   */
  const manifestCore = {
    profileKey:
      PROFILE_KEY,

    engine:
      "OrcaSlicer",

    engineVersion,

    files,

    generatedAt,

    vendor:
      VENDOR_KEY,

    sourceProfileNames: {
      machine:
        SOURCE_PROFILE_NAMES.machine,

      process:
        SOURCE_PROFILE_NAMES.process,

      filament:
        SOURCE_PROFILE_NAMES.filament
    },

    sourceProfileChains: {
      machine:
        machine.chain,

      process:
        processProfile.chain,

      filament:
        filament.chain
    }
  };

  const profileFingerprint =
    sha256(
      canonicalJson(
        manifestCore
      )
    );

  const manifest = {
    ...manifestCore,
    profileFingerprint
  };

  /*
   * O arquivo em si pode ser formatado
   * para leitura humana.
   *
   * O loader fará JSON.parse() e depois
   * canonicalJson() novamente para
   * verificar o fingerprint.
   */
  await writeFile(
    join(
      outputDirectory,
      "manifest.json"
    ),
    `${JSON.stringify(
      manifest,
      null,
      2
    )}\n`,
    {
      encoding: "utf8",
      mode: 0o644
    }
  );

  return manifest;
}

export {
  PROFILE_KEY,
  SOURCE_PROFILE_NAMES,
  buildProfileIndex,
  createResolver
};