import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { buildOrcaCommand } from "./command.js";
import { canonicalize3mf } from "./canonicalize-3mf.js";
import { runProcess } from "./process.js";
import { parseSliceResult } from "./result-parser.js";
import { normalizeModelUnits } from "./normalize-model.js";

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
    const runtimeDir = path.join(runtimeHome, ".runtime");

    await mkdir(outputDir, { recursive: true });
    await mkdir(path.join(runtimeHome, ".config"), { recursive: true });
    await mkdir(path.join(runtimeHome, ".cache"), { recursive: true });
    await mkdir(runtimeDir, {
      recursive: true,
      mode: 0o700
    });
    let slicerInput = inputPath;

    if (extension === "3mf") {
      const canonicalDir =
        path.join(workDir, "canonical-source");

      await mkdir(
        canonicalDir,
        { recursive: true }
      );

      slicerInput =
        path.join(workDir, "geometry-only.3mf");

      await canonicalize3mf({
        inputPath,
        outputPath: slicerInput,
        stagingDir: canonicalDir,
        sourceUnit
      });
    } else if (unitScale !== 1) {
      slicerInput =
        path.join(
          workDir,
          `normalized-input.${extension}`
        );

      await normalizeModelUnits({
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
        XDG_RUNTIME_DIR: runtimeDir,
        TMPDIR: workDir
      }
    });

    if (execution.code !== 0) {
      const error = new Error(
        classifyExecutionFailure(execution, {
          extension
        })
      );
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
    stdoutTail: execution.stdout.slice(-4000),
    stderrTail: execution.stderr.slice(-4000),
    outputTruncated: execution.outputTruncated
  };
}

export function classifyExecutionFailure(
  execution,
  { extension } = {}
) {
  const output =
    `${execution?.stdout ?? ""}\n` +
    `${execution?.stderr ?? ""}`;

  /*
   * Orca CLI_NO_SUITABLE_OBJECTS = -50.
   *
   * Em Unix o exit code aparece como:
   *   256 - 50 = 206
   *
   * Para OBJ/STL processamos um único modelo;
   * portanto -50 aqui significa que não existe
   * objeto imprimível completamente dentro da cama.
   *
   * Não fazemos esse mapeamento automaticamente
   * para 3MF porque -50 também pode representar
   * uma plate vazia nesse formato.
   */
  const noSuitableObjects =
    /\breturn\s+-50\b/i.test(output) ||
    execution?.code === 206;

  if (
    extension !== "3mf" &&
    noSuitableObjects
  ) {
    return "MODEL_OUTSIDE_BUILD_VOLUME";
  }

  if (
    /outside.{0,40}(build|print)|does not fit|exceed.{0,40}(build|plate)|too large for.{0,40}(plate|bed)/i
      .test(output)
  ) {
    return "MODEL_OUTSIDE_BUILD_VOLUME";
  }

  if (
    /too many (triangles|facets)|model.{0,30}too complex|out of memory|bad_alloc/i
      .test(output)
  ) {
    return "MODEL_TOO_COMPLEX";
  }

  if (
    /(invalid|failed).{0,30}(preset|profile)|load.{0,30}(preset|profile).{0,30}failed/i
      .test(output)
  ) {
    return "SLICER_PROFILE_INVALID";
  }

  return "SLICER_UNAVAILABLE";
}
