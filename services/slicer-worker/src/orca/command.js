export function buildOrcaCommand({
  orcaBinary,
  inputPath,
  outputPath,
  outputDir,
  extension,
  unitScale,
  profileFiles
}) {
  const args = [
    "-a",
    "--server-args=-screen 0 1024x768x24",
    orcaBinary,
    inputPath,
    "--load-settings", profileFiles.machine,
    "--load-settings", profileFiles.process,
    "--load-filaments", profileFiles.filament,
    "--arrange", "0",
    "--ensure-on-bed",
    "--slice", "0",
    "--outputdir", outputDir,
    "--export-3mf", outputPath
  ];

  if (extension !== "3mf" && unitScale !== 1) {
    args.push("--scale", String(unitScale));
  }

  return Object.freeze({ command: "xvfb-run", args: Object.freeze(args) });
}
