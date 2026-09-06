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
    extension: "stl",
    unitScale: 25.4,
    profileFiles
  });
  assert.equal(invocation.command, "xvfb-run");
  assert.ok(invocation.args.includes(maliciousPath));
  assert.equal(invocation.args.includes("--orient"), false);
  assert.deepEqual(invocation.args.slice(-2), ["--scale", "25.4"]);
  assert.equal(invocation.args.filter((item) => item === "--load-settings").length, 2);
});

test("3MF preserva a orientação e não recebe escala duplicada", () => {
  const invocation = buildOrcaCommand({
    orcaBinary: "/opt/orca/AppRun", inputPath: "/work/model.3mf",
    outputPath: "/work/out.3mf", outputDir: "/work", extension: "3mf", unitScale: 10, profileFiles
  });
  assert.equal(invocation.args.includes("--scale"), false);
  assert.equal(invocation.args.includes("--orient"), false);
  assert.ok(invocation.args.includes("--ensure-on-bed"));
});

test("paths hostis permanecem argumentos literais e não viram flags", () => {
  for (const inputPath of ["; rm -rf /", "--some-flag", "../../etc/passwd"]) {
    const invocation = buildOrcaCommand({
      orcaBinary: "/opt/orca/AppRun",
      inputPath,
      outputPath: "/work/out.3mf",
      outputDir: "/work",
      extension: "obj",
      unitScale: 1,
      profileFiles
    });
    assert.equal(invocation.command, "xvfb-run");
    assert.equal(invocation.args[3], inputPath);
    assert.equal(invocation.args.includes("--orient"), false);
  }
});
