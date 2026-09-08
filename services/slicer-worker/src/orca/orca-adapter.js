import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { buildOrcaCommand } from "./command.js";
import { canonicalize3mf } from "./canonicalize-3mf.js";
import { runProcess } from "./process.js";
import { parseSliceResult } from "./result-parser.js";
import { normalizeModelGeometry } from "./model-normalizer.js";

export class OrcaSlicerAdapter {
  constructor({
    orcaBinary,
    timeoutMs = 105_000,
    maxWeightGrams = 100_000,
    maxPrintTimeSeconds = 36_000_000,
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
    const runtimeDir = path.join(runtimeHome, ".runtime");
    await mkdir(outputDir, { recursive: true });
    await mkdir(path.join(runtimeHome, ".config"), { recursive: true });
    await mkdir(path.join(runtimeHome, ".cache"), { recursive: true });
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    let slicerInput;

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
    } else {
      slicerInput = path.join(workDir, `normalized-input.${extension}`);
      await normalizeModelGeometry({
        inputPath,
        outputPath: slicerInput,
        extension,
        unitScale
      });
    }

    const requestedOutput = path.join(outputDir, "insight.gcode.3mf");
    const invocation = buildOrcaCommand({
      orcaBinary: this.orcaBinary,
      inputPath: slicerInput,
      outputPath: requestedOutput,
      outputDir,
      profileFiles: profile.files
    });
    let execution;
    try {
      execution = await this.run(invocation.command, invocation.args, {
        cwd: workDir,
        timeoutMs: this.timeoutMs,
        env: {
          ...process.env,
          HOME: runtimeHome,
          XDG_CONFIG_HOME: path.join(runtimeHome, ".config"),
          XDG_CACHE_HOME: path.join(runtimeHome, ".cache"),
          XDG_RUNTIME_DIR: runtimeDir,
          TMPDIR: workDir
        }
      });
    } catch (cause) {
      if (cause?.message === "SLICER_TIMEOUT") {
        cause.details = safeFailureDetails(cause.details ?? {});
        throw cause;
      }
      const error = new Error("SLICER_UNAVAILABLE", { cause });
      error.details = safeFailureDetails(cause?.details ?? {});
      throw error;
    }

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
    code: execution?.code ?? null,
    signal: execution?.signal ?? null,
    orcaReturnCode: deriveOrcaReturnCode(execution),
    stdoutTail: String(execution?.stdout ?? "").slice(-2000),
    stderrTail: String(execution?.stderr ?? "").slice(-2000),
    outputTruncated: execution?.outputTruncated === true
  };
}

export function classifyExecutionFailure(execution) {
  const output = `${execution?.stdout ?? ""}\n${execution?.stderr ?? ""}`;
  const orcaReturnCode = deriveOrcaReturnCode(execution);
  if (
    execution?.signal === "SIGSEGV"
    || execution?.code === 139
    || /segmentation fault|sigsegv/i.test(output)
  ) {
    return "ORCA_PROCESS_CRASH";
  }
  if (/outside.{0,40}(build|print)|does not fit|exceed.{0,40}(build|plate)|too large for.{0,40}(plate|bed)/i.test(output)) {
    return "MODEL_OUTSIDE_BUILD_VOLUME";
  }
  if (orcaReturnCode === -24) return "ORCA_FILE_VERSION_UNSUPPORTED";
  if (orcaReturnCode === -50) return "ORCA_NO_SUITABLE_OBJECTS";
  if (orcaReturnCode === -100) return "ORCA_SLICING_ERROR";
  if (/too many (triangles|facets)|model.{0,30}too complex|out of memory|bad_alloc/i.test(output)) {
    return "MODEL_TOO_COMPLEX";
  }
  if (/(invalid|failed).{0,30}(preset|profile)|load.{0,30}(preset|profile).{0,30}failed/i.test(output)) {
    return "SLICER_PROFILE_INVALID";
  }
  return "SLICER_UNAVAILABLE";
}

export function deriveOrcaReturnCode(execution) {
  const code = execution?.code;
  if ([-24, -50, -100].includes(code)) return code;
  const converted = new Map([[232, -24], [206, -50], [156, -100]]);
  if (converted.has(code)) return converted.get(code);
  const output = `${execution?.stdout ?? ""}\n${execution?.stderr ?? ""}`;
  const named = [
    [/CLI_FILE_VERSION_NOT_SUPPORTED/i, -24],
    [/CLI_NO_SUITABLE_OBJECTS/i, -50],
    [/CLI_SLICING_ERROR/i, -100]
  ];
  for (const [pattern, value] of named) {
    if (pattern.test(output)) return value;
  }
  const match = output.match(/(?:return|returned|exit(?:ed)?(?:\s+with)?(?:\s+code)?|error)\D{0,20}(-(?:24|50|100))\b/i);
  return match ? Number(match[1]) : null;
}
