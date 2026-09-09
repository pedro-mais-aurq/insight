import path from "node:path";

export function buildOrcaCommand({
  orcaBinary,
  inputPath,
  outputPath,
  outputDir,
  profileFiles
}) {
  const settings = `${profileFiles.process};${profileFiles.machine}`;
  const exportFilename = path.basename(outputPath);

  const args = [
    "-a",
    "--server-args=-screen 0 1024x768x24",
    orcaBinary,

    "--load-settings",
    settings,
    "--load-filaments",
    profileFiles.filament,
    "--arrange",
    "0",
    "--ensure-on-bed",
    "--slice",
    "0",
    "--outputdir",
    outputDir,
    "--export-3mf",
    exportFilename,
    inputPath
  ];

  return Object.freeze({ command: "xvfb-run", args: Object.freeze(args) });
}
