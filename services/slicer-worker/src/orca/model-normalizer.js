import { readFile, writeFile } from "node:fs/promises";
import { ESTIMATION_BUILD_VOLUME_MM } from "../profile/profile-definitions.js";

const SUPPORTED_UNIT_SCALES = new Set([1, 10, 1_000, 25.4]);
const NUMBER = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
const STL_VERTEX = new RegExp(`^(\\s*)vertex\\s+(${NUMBER})\\s+(${NUMBER})\\s+(${NUMBER})\\s*$`, "i");
const OBJ_VERTEX = new RegExp(`^(\\s*)v\\s+(${NUMBER})\\s+(${NUMBER})\\s+(${NUMBER})(\\s+.*)?$`, "i");

export async function normalizeModelGeometry({
  inputPath,
  outputPath,
  extension,
  unitScale,
  buildVolumeMm = ESTIMATION_BUILD_VOLUME_MM
}) {
  if (!SUPPORTED_UNIT_SCALES.has(unitScale)) throw new Error("UNIT_SCALE_INVALID");
  const source = await readFile(inputPath);
  if (source.length === 0) throw new Error("MODEL_NOT_SLICEABLE");

  if (extension === "obj") {
    return normalizeObj(source, outputPath, unitScale, buildVolumeMm);
  }
  if (extension === "stl") {
    return normalizeStl(source, outputPath, unitScale, buildVolumeMm);
  }
  throw new Error("MODEL_NOT_SLICEABLE");
}

async function normalizeObj(source, outputPath, unitScale, buildVolumeMm) {
  const text = decodeUtf8(source);
  const lines = text.split(/\r?\n/);
  const vertices = [];
  let faceCount = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(OBJ_VERTEX);
    if (match) vertices.push({ index, match, point: parsePoint(match.slice(2, 5)) });
    else if (/^\s*v(?:\s|$)/i.test(lines[index])) throw new Error("MODEL_NOT_SLICEABLE");
    if (/^\s*f(?:\s|$)/i.test(lines[index])) faceCount += 1;
  }
  if (vertices.length < 3 || faceCount === 0) throw new Error("MODEL_NOT_SLICEABLE");

  const geometry = geometryPolicy(vertices.map(({ point }) => point), unitScale, buildVolumeMm);
  const byLine = new Map(vertices.map((vertex) => [vertex.index, vertex]));
  const outputLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:mtllib|usemtl)(?:\s|$)/i.test(line)) continue;
    const vertex = byLine.get(index);
    if (!vertex) {
      outputLines.push(line);
      continue;
    }
    const point = normalizePoint(vertex.point, geometry.min, unitScale);
    outputLines.push(
      `${vertex.match[1]}v ${point.map(formatNumber).join(" ")}${vertex.match[5] ?? ""}`
    );
  }

  await writeFile(outputPath, `${outputLines.join("\n").replace(/\n+$/u, "")}\n`, { mode: 0o600 });
  return Object.freeze({ outputPath, ...geometry, format: "obj" });
}

async function normalizeStl(source, outputPath, unitScale, buildVolumeMm) {
  const triangleCount = source.length >= 84 ? source.readUInt32LE(80) : -1;
  const expectedLength = triangleCount >= 0 ? 84 + triangleCount * 50 : -1;
  if (triangleCount > 0 && expectedLength === source.length) {
    return normalizeBinaryStl(source, outputPath, triangleCount, unitScale, buildVolumeMm);
  }
  return normalizeAsciiStl(source, outputPath, unitScale, buildVolumeMm);
}

async function normalizeBinaryStl(source, outputPath, triangleCount, unitScale, buildVolumeMm) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + 12 + vertex * 12;
      const point = [
        source.readFloatLE(vertexOffset),
        source.readFloatLE(vertexOffset + 4),
        source.readFloatLE(vertexOffset + 8)
      ];
      updateBounds(point, min, max);
    }
    offset += 50;
  }

  const geometry = geometryPolicyFromBounds(min, max, unitScale, buildVolumeMm);
  const output = Buffer.from(source);
  offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const vertexOffset = offset + 12 + vertex * 12;
      const point = normalizePoint([
        source.readFloatLE(vertexOffset),
        source.readFloatLE(vertexOffset + 4),
        source.readFloatLE(vertexOffset + 8)
      ], geometry.min, unitScale);
      output.writeFloatLE(point[0], vertexOffset);
      output.writeFloatLE(point[1], vertexOffset + 4);
      output.writeFloatLE(point[2], vertexOffset + 8);
    }
    offset += 50;
  }
  await writeFile(outputPath, output, { mode: 0o600 });
  return Object.freeze({ outputPath, ...geometry, triangleCount, format: "stl-binary" });
}

async function normalizeAsciiStl(source, outputPath, unitScale, buildVolumeMm) {
  const text = decodeUtf8(source);
  if (!/^\s*solid(?:\s|$)/i.test(text)) throw new Error("MODEL_NOT_SLICEABLE");
  const lines = text.split(/\r?\n/);
  const vertices = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(STL_VERTEX);
    if (match) vertices.push({ index, match, point: parsePoint(match.slice(2, 5)) });
    else if (/^\s*vertex(?:\s|$)/i.test(lines[index])) throw new Error("MODEL_NOT_SLICEABLE");
  }
  if (vertices.length < 3 || vertices.length % 3 !== 0) throw new Error("MODEL_NOT_SLICEABLE");

  const geometry = geometryPolicy(vertices.map(({ point }) => point), unitScale, buildVolumeMm);
  const byLine = new Map(vertices.map((vertex) => [vertex.index, vertex]));
  const outputLines = lines.map((line, index) => {
    const vertex = byLine.get(index);
    if (!vertex) return line;
    const point = normalizePoint(vertex.point, geometry.min, unitScale);
    return `${vertex.match[1]}vertex ${point.map(formatNumber).join(" ")}`;
  });
  await writeFile(outputPath, `${outputLines.join("\n").replace(/\n+$/u, "")}\n`, { mode: 0o600 });
  return Object.freeze({
    outputPath,
    ...geometry,
    triangleCount: vertices.length / 3,
    format: "stl-ascii"
  });
}

function geometryPolicy(points, unitScale, buildVolumeMm) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    updateBounds(point, min, max);
  }
  return geometryPolicyFromBounds(min, max, unitScale, buildVolumeMm);
}

function geometryPolicyFromBounds(min, max, unitScale, buildVolumeMm) {
  const dimensionsMm = {
    x: canonicalNumber((max[0] - min[0]) * unitScale),
    y: canonicalNumber((max[1] - min[1]) * unitScale),
    z: canonicalNumber((max[2] - min[2]) * unitScale)
  };
  assertBuildVolume(dimensionsMm, buildVolumeMm);
  return Object.freeze({ min: Object.freeze(min), dimensionsMm: Object.freeze(dimensionsMm) });
}

function updateBounds(point, min, max) {
  if (point.length !== 3 || point.some((value) => !Number.isFinite(value))) {
    throw new Error("MODEL_NOT_SLICEABLE");
  }
  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], point[axis]);
    max[axis] = Math.max(max[axis], point[axis]);
  }
}

export function assertBuildVolume(dimensionsMm, buildVolumeMm = ESTIMATION_BUILD_VOLUME_MM) {
  const axes = ["x", "y", "z"];
  if (axes.some((axis) => (
    !Number.isFinite(dimensionsMm?.[axis])
    || dimensionsMm[axis] < 0
  ))) {
    throw new Error("MODEL_NOT_SLICEABLE");
  }
  if (axes.some((axis) => dimensionsMm[axis] > buildVolumeMm[axis] + 1e-6)) {
    throw new Error("MODEL_OUTSIDE_BUILD_VOLUME");
  }
}

function normalizePoint(point, min, unitScale) {
  return point.map((value, axis) => canonicalNumber((value - min[axis]) * unitScale));
}

function parsePoint(values) {
  const point = values.map(Number);
  if (point.some((value) => !Number.isFinite(value))) throw new Error("MODEL_NOT_SLICEABLE");
  return point;
}

function decodeUtf8(source) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(source);
  } catch (error) {
    throw new Error("MODEL_NOT_SLICEABLE", { cause: error });
  }
}

function normalizeZero(value) {
  return Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value;
}

function formatNumber(value) {
  return normalizeZero(value).toString();
}

function canonicalNumber(value) {
  return normalizeZero(Number(value.toPrecision(15)));
}
