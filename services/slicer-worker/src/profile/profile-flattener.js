import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const PROFILE_TYPES = new Set(["machine", "process", "filament"]);

export async function buildProfileIndex(root) {
  const files = await findJsonFiles(root);
  const profiles = [];

  for (const file of files) {
    let value;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      throw new Error(`PROFILE_JSON_INVALID:${path.relative(root, file)}`, {
        cause: error
      });
    }

    if (!PROFILE_TYPES.has(value?.type) || typeof value?.name !== "string") {
      continue;
    }

    profiles.push({
      type: value.type,
      name: value.name,
      file,
      relativeFile: path.relative(root, file).split(path.sep).join("/"),
      value
    });
  }

  return profiles;
}

export function flattenNamedProfile(index, type, name) {
  if (!PROFILE_TYPES.has(type) || typeof name !== "string" || !name.trim()) {
    throw new Error("PROFILE_SELECTION_INVALID");
  }

  const chain = [];
  const value = resolve(index, type, name, [], chain);
  return { value, chain };
}

function resolve(index, type, name, stack, chain) {
  const matches = index.filter((entry) => entry.type === type && entry.name === name);

  if (matches.length === 0) {
    throw new Error(`PROFILE_PARENT_MISSING:${type}:${name}`);
  }
  if (matches.length > 1) {
    throw new Error(`PROFILE_NAME_AMBIGUOUS:${type}:${name}`);
  }
  if (stack.includes(name)) {
    throw new Error(`PROFILE_INHERITANCE_CYCLE:${[...stack, name].join(" -> ")}`);
  }

  const entry = matches[0];
  const parentName = normalizeParent(entry.value.inherits);
  const parent = parentName
    ? resolve(index, type, parentName, [...stack, name], chain)
    : {};
  const child = structuredClone(entry.value);
  delete child.inherits;
  chain.push({ name: entry.name, source: entry.relativeFile });

  return { ...parent, ...child };
}

function normalizeParent(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("PROFILE_INHERITANCE_INVALID");
  }
  return value.trim();
}

async function findJsonFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await findJsonFiles(target));
    if (entry.isFile() && entry.name.endsWith(".json")) files.push(target);
  }

  return files;
}
