import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { normalizeModelGeometry } from "../src/orca/model-normalizer.js";

test("normaliza mm/cm/m/inch para a mesma geometria sem flags do Orca", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-units-"));
  try {
    const outputs = [];
    for (const [name, unitScale] of [["mm", 1], ["cm", 10], ["m", 1_000], ["inch", 25.4]]) {
      const inputPath = path.join(root, `${name}.obj`);
      const outputPath = path.join(root, `${name}-normalized.obj`);
      await writeFile(inputPath, cubeObj(20 / unitScale, -7 / unitScale));
      const result = await normalizeModelGeometry({ inputPath, outputPath, extension: "obj", unitScale });
      assert.deepEqual(result.dimensionsMm, { x: 20, y: 20, z: 20 });
      outputs.push(await readFile(outputPath, "utf8"));
    }
    for (const output of outputs.slice(1)) assert.equal(output, outputs[0]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("aceita coordenadas negativas e modelo maior que 180 mm, sem auto-scale", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-negative-"));
  try {
    const inputPath = path.join(root, "model.obj");
    const outputPath = path.join(root, "normalized.obj");
    await writeFile(inputPath, cubeObj(300, -500));
    const result = await normalizeModelGeometry({ inputPath, outputPath, extension: "obj", unitScale: 1 });
    assert.deepEqual(result.dimensionsMm, { x: 300, y: 300, z: 300 });
    const output = await readFile(outputPath, "utf8");
    assert.match(output, /^v 0 0 0$/m);
    assert.match(output, /^v 300 300 300$/m);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejeita dimensão acima do volume virtual antes de gerar input do Orca", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-volume-"));
  try {
    const inputPath = path.join(root, "model.obj");
    const outputPath = path.join(root, "normalized.obj");
    await writeFile(inputPath, cubeObj(2_001, 0));
    await assert.rejects(
      () => normalizeModelGeometry({ inputPath, outputPath, extension: "obj", unitScale: 1 }),
      /MODEL_OUTSIDE_BUILD_VOLUME/
    );
    await assert.rejects(() => access(outputPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normaliza STL binário deslocado sem alterar contagem de triângulos", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "insight-binary-stl-"));
  try {
    const inputPath = path.join(root, "triangle.stl");
    const outputPath = path.join(root, "normalized.stl");
    await writeFile(inputPath, binaryTriangle([[-5, -10, 2], [15, -10, 2], [-5, 10, 2]]));
    const result = await normalizeModelGeometry({ inputPath, outputPath, extension: "stl", unitScale: 1 });
    assert.deepEqual(result.dimensionsMm, { x: 20, y: 20, z: 0 });
    assert.equal(result.triangleCount, 1);
    const output = await readFile(outputPath);
    assert.equal(output.readUInt32LE(80), 1);
    assert.deepEqual([output.readFloatLE(96), output.readFloatLE(100), output.readFloatLE(104)], [0, 0, 0]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function cubeObj(size, origin) {
  const high = origin + size;
  return `v ${origin} ${origin} ${origin}
v ${high} ${origin} ${origin}
v ${high} ${high} ${origin}
v ${origin} ${high} ${origin}
v ${origin} ${origin} ${high}
v ${high} ${origin} ${high}
v ${high} ${high} ${high}
v ${origin} ${high} ${high}
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;
}

function binaryTriangle(points) {
  const output = Buffer.alloc(84 + 50);
  output.writeUInt32LE(1, 80);
  for (let index = 0; index < points.length; index += 1) {
    const offset = 84 + 12 + index * 12;
    output.writeFloatLE(points[index][0], offset);
    output.writeFloatLE(points[index][1], offset + 4);
    output.writeFloatLE(points[index][2], offset + 8);
  }
  return output;
}
