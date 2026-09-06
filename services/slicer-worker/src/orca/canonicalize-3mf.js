import { mkdir, readFile, writeFile, utimes } from "node:fs/promises";
import path from "node:path";
import { runProcess } from "./process.js";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;
const UNIT_NAMES = Object.freeze({
  micron: "mm",
  millimeter: "mm",
  centimeter: "cm",
  meter: "m",
  inch: "inch"
});
const FIXED_TIME = new Date("2026-07-07T03:33:00.000Z");

export async function canonicalize3mf({ inputPath, outputPath, stagingDir, sourceUnit }) {
  const listed = await runProcess("unzip", ["-Z1", inputPath], { timeoutMs: 20_000 });
  if (listed.code !== 0) throw new Error("THREE_MF_INVALID");

  const entries = selectGeometryEntries(listed.stdout.split(/\r?\n/).filter(Boolean));
  if (!entries.includes("3D/3dmodel.model")) throw new Error("THREE_MF_GEOMETRY_MISSING");

  await mkdir(path.join(stagingDir, "3D"), { recursive: true });
  for (const entry of entries) {
    const extracted = await runProcess("unzip", ["-p", inputPath, entry], { timeoutMs: 20_000 });
    if (extracted.code !== 0 || !extracted.stdout) throw new Error("THREE_MF_INVALID");
    const destination = path.join(stagingDir, ...entry.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, extracted.stdout, { mode: 0o600 });
  }

  await assertDeclaredUnit(path.join(stagingDir, "3D/3dmodel.model"), sourceUnit);
  await mkdir(path.join(stagingDir, "_rels"), { recursive: true });
  await writeFile(path.join(stagingDir, "[Content_Types].xml"), CONTENT_TYPES, { mode: 0o600 });
  await writeFile(path.join(stagingDir, "_rels/.rels"), ROOT_RELS, { mode: 0o600 });

  const archiveEntries = ["[Content_Types].xml", "_rels/.rels", ...entries].sort();
  for (const entry of archiveEntries) await utimes(path.join(stagingDir, entry), FIXED_TIME, FIXED_TIME);
  const zipped = await runProcess("zip", ["-X", "-q", outputPath, ...archiveEntries], {
    cwd: stagingDir,
    timeoutMs: 20_000
  });
  if (zipped.code !== 0) throw new Error("THREE_MF_CANONICALIZATION_FAILED");
  return outputPath;
}

export function selectGeometryEntries(entries) {
  const selected = [];
  for (const entry of entries) {
    if (entry.includes("\\") || entry.startsWith("/") || entry.split("/").includes("..")) {
      throw new Error("THREE_MF_PATH_INVALID");
    }
    if (/^3D\/(?:[^/]+\/)*[^/]+\.model$/i.test(entry)) selected.push(entry);
  }
  return [...new Set(selected)].sort();
}

async function assertDeclaredUnit(modelPath, sourceUnit) {
  const xml = await readFile(modelPath, "utf8");
  const modelTag = xml.match(/<model\b[^>]*>/i)?.[0];
  if (!modelTag) throw new Error("THREE_MF_INVALID");
  const declared = modelTag.match(/\bunit\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "millimeter";
  if (UNIT_NAMES[declared] !== sourceUnit) throw new Error("THREE_MF_UNIT_MISMATCH");
}
