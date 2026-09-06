import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildProfileIndex, flattenNamedProfile } from "../src/profile/profile-flattener.js";

function entry(name, value, source = `${name}.json`) {
  return { type: "process", name, relativeFile: source, value: { type: "process", name, ...value } };
}

test("achata herança recursiva e preserva override do filho", () => {
  const index = [
    entry("base", { speed: "100", infill: "15" }),
    entry("middle", { inherits: "base", speed: "200" }),
    entry("final", { inherits: "middle", support: "0" })
  ];
  const result = flattenNamedProfile(index, "process", "final");
  assert.equal(result.value.speed, "200");
  assert.equal(result.value.infill, "15");
  assert.equal(result.value.support, "0");
  assert.equal(Object.hasOwn(result.value, "inherits"), false);
  assert.deepEqual(result.chain.map((item) => item.name), ["base", "middle", "final"]);
});

test("rejeita pai ausente, ciclo e nome ambíguo", () => {
  assert.throws(() => flattenNamedProfile([entry("child", { inherits: "missing" })], "process", "child"), /PROFILE_PARENT_MISSING/);
  assert.throws(() => flattenNamedProfile([
    entry("a", { inherits: "b" }), entry("b", { inherits: "a" })
  ], "process", "a"), /PROFILE_INHERITANCE_CYCLE/);
  assert.throws(() => flattenNamedProfile([
    entry("same", {}, "one.json"), entry("same", {}, "two.json")
  ], "process", "same"), /PROFILE_NAME_AMBIGUOUS/);
});

test("rejeita JSON inválido sem fallback silencioso", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-profile-invalid-"));
  try {
    await mkdir(path.join(root, "process"));
    await writeFile(path.join(root, "process/broken.json"), "{not-json");
    await assert.rejects(() => buildProfileIndex(root), /PROFILE_JSON_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
