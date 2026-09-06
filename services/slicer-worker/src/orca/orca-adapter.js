import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { buildOrcaCommand } from "./command.js";
import { canonicalize3mf } from "./canonicalize-3mf.js";
import { runProcess } from "./process.js";
import { parseSliceResult } from "./result-parser.js";

export class OrcaSlicerAdapter {
  constructor({
    orcaBinary,
    timeoutMs = 90_000,
    maxWeightGrams = 10_000,
    maxPrintTimeSeconds = 2_592_000,
    run = runProcess
  }) {
    this.orcaBinary = orcaBinary;
    this.timeoutMs = timeoutMs;
    this.maxWeightGrams = maxWeightGrams;
    this.maxPrintTimeSeconds = maxPrintTimeSeconds;
    this.run = run;
  }

  async slice({ inputPath, extension, sourceUnit, unitScale, profile, workDir }) {
    const outputDir = path.join(workDir, "output");
    const runtimeHome = path.join(workDir, "runtime-home");
    await mkdir(outputDir, { recursive: true });
    await mkdir(path.join(runtimeHome, ".config"), { recursive: true });
    await mkdir(path.join(runtimeHome, ".cache"), { recursive: true });
    let slicerInput = inputPath;

    if (extension === "3mf") {
      const canonicalDir = path.join(workDir, "canonical-source");
      await mkdir(canonicalDir, { recursive: true });
      slicerInput = path.join(workDir, "geometry-only.3mf");
      await canonicalize3mf({
        inputPath,
        outputPath: slicerInput,
        stagingDir: canonicalDir,
        sourceUnit
      });
    }

    const requestedOutput = path.join(outputDir, "insight.gcode.3mf");
    const invocation = buildOrcaCommand({
      orcaBinary: this.orcaBinary,
      inputPath: slicerInput,
      outputPath: requestedOutput,
      outputDir,
      extension,
      unitScale,
      profileFiles: profile.files
    });
    const execution = await this.run(invocation.command, invocation.args, {
      cwd: workDir,
      timeoutMs: this.timeoutMs,
      env: {
        ...process.env,
        HOME: runtimeHome,
        XDG_CONFIG_HOME: path.join(runtimeHome, ".config"),
        XDG_CACHE_HOME: path.join(runtimeHome, ".cache"),
        TMPDIR: workDir
      }
    });

    if (execution.code !== 0) {
      const error = new Error(classifyExecutionFailure(execution));
      error.details = safeFailureDetails(execution);
      throw error;
    }

    let archive;
    try {
      archive = await findOutputArchive(outputDir, requestedOutput);
    } catch (error) {
      const classified = classifyExecutionFailure(execution);
      if (classified !== "SLICER_UNAVAILABLE") throw Object.assign(new Error(classified), { cause: error });
      throw error;
    }
    const sliceInfoXml = await readArchiveMember(archive, "Metadata/slice_info.config", this.run);
    const gcode = await readFirstGcode(archive, this.run);
    return parseSliceResult({
      sliceInfoXml,
      gcode,
      maxWeightGrams: this.maxWeightGrams,
      maxPrintTimeSeconds: this.maxPrintTimeSeconds
    });
  }
}

async function findOutputArchive(outputDir, requestedOutput) {
  try {
    await access(requestedOutput);
    return requestedOutput;
  } catch {
    const files = await readdir(outputDir);
    const candidates = files.filter((file) => /\.gcode\.3mf$|\.3mf$/i.test(file)).sort();
    if (candidates.length !== 1) throw new Error("SLICER_OUTPUT_AMBIGUOUS");
    return path.join(outputDir, candidates[0]);
  }
}

async function readArchiveMember(archive, member, run) {
  const result = await run("unzip", ["-p", archive, member], { timeoutMs: 20_000 });
  return result.code === 0 && result.stdout ? result.stdout : null;
}

async function readFirstGcode(archive, run) {
  const listed = await run("unzip", ["-Z1", archive], { timeoutMs: 20_000 });
  if (listed.code !== 0) return null;
  const candidates = listed.stdout.split(/\r?\n/).filter((name) => /^Metadata\/[^/]+\.gcode$/i.test(name)).sort();
  if (candidates.length === 0) return null;
  return readArchiveMember(archive, candidates[0], run);
}

function safeFailureDetails(execution) {
  return {
    code: execution.code,
    signal: execution.signal,
    stderrTail: execution.stderr.slice(-2000),
    outputTruncated: execution.outputTruncated
  };
}

export function classifyExecutionFailure(execution) {
  const output = `${execution?.stdout ?? ""}\n${execution?.stderr ?? ""}`;
  if (/outside.{0,40}(build|print)|does not fit|exceed.{0,40}(build|plate)|too large for.{0,40}(plate|bed)/i.test(output)) {
    return "MODEL_OUTSIDE_BUILD_VOLUME";
  }
  if (/too many (triangles|facets)|model.{0,30}too complex|out of memory|bad_alloc/i.test(output)) {
    return "MODEL_TOO_COMPLEX";
  }
  if (/(invalid|failed).{0,30}(preset|profile)|load.{0,30}(preset|profile).{0,30}failed/i.test(output)) {
    return "SLICER_PROFILE_INVALID";
  }
  return "SLICER_UNAVAILABLE";
}
