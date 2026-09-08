import assert from "node:assert/strict";
import test from "node:test";
import { buildOrcaCommand } from "../src/orca/command.js";

const profileFiles = { machine: "/profiles/machine.json", process: "/profiles/process.json", filament: "/profiles/filament.json" };

test("constrói argv sem shell, sem orient e com perfis fechados", () => {
  const maliciousPath = "/work/model;touch PWNED.stl";
  const invocation = buildOrcaCommand({
    orcaBinary: "/opt/orca/AppRun",
    inputPath: maliciousPath,
    outputPath: "/work/out.gcode.3mf",
    outputDir: "/work",
    profileFiles
  });
  assert.equal(invocation.command, "xvfb-run");
  assert.deepEqual(invocation.args, [
    "-a",
    "--server-args=-screen 0 1024x768x24",
    "/opt/orca/AppRun",
    "--load-settings",
    "/profiles/process.json;/profiles/machine.json",
    "--load-filaments",
    "/profiles/filament.json",
    "--arrange",
    "0",
    "--ensure-on-bed",
    "--slice",
    "0",
    "--outputdir",
    "/work",
    "--export-3mf",
    "out.gcode.3mf",
    maliciousPath
  ]);
  assert.equal(invocation.args.includes("--orient"), false);
  assert.equal(invocation.args.includes("--scale"), false);
  assert.equal(invocation.args.includes("--convert-unit"), false);
  assert.equal(invocation.args.includes("--center"), false);
  assert.equal(invocation.args.filter((item) => item === "--load-settings").length, 1);
});

test("3MF preserva a orientação e não recebe escala duplicada", () => {
  const invocation = buildOrcaCommand({
    orcaBinary: "/opt/orca/AppRun", inputPath: "/work/model.3mf",
    outputPath: "/work/out.3mf", outputDir: "/work", profileFiles
  });
  assert.equal(invocation.args.includes("--scale"), false);
  assert.equal(invocation.args.includes("--convert-unit"), false);
  assert.equal(invocation.args.includes("--orient"), false);
  assert.equal(invocation.args.includes("--center"), false);
  assert.ok(invocation.args.includes("--ensure-on-bed"));
  assert.equal(invocation.args.at(-1), "/work/model.3mf");
});

test("paths hostis permanecem argumentos literais e não viram flags", () => {
  for (const inputPath of ["; rm -rf /", "--some-flag", "../../etc/passwd"]) {
    const invocation = buildOrcaCommand({
      orcaBinary: "/opt/orca/AppRun",
      inputPath,
      outputPath: "/work/out.3mf",
      outputDir: "/work",
      profileFiles
    });
    assert.equal(invocation.command, "xvfb-run");
    assert.equal(invocation.args.at(-1), inputPath);
    assert.equal(invocation.args.includes("--orient"), false);
  }
});
