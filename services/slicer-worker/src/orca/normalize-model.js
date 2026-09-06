import {
  readFile,
  writeFile
} from "node:fs/promises";

export async function normalizeModelUnits({
  inputPath,
  outputPath,
  extension,
  unitScale
}) {
  if (unitScale === 1) {
    return inputPath;
  }

  if (!Number.isFinite(unitScale) || unitScale <= 0) {
    throw new Error("UNIT_SCALE_INVALID");
  }

  if (extension === "obj") {
    return normalizeObj({
      inputPath,
      outputPath,
      unitScale
    });
  }

  if (extension === "stl") {
    return normalizeStl({
      inputPath,
      outputPath,
      unitScale
    });
  }

  throw new Error("UNIT_NORMALIZATION_UNSUPPORTED");
}

async function normalizeObj({
  inputPath,
  outputPath,
  unitScale
}) {
  const source = await readFile(inputPath, "utf8");

  const normalized = source
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(
        /^(\s*v\s+)([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)(.*)$/
      );

      if (!match) {
        return line;
      }

      const x = Number(match[2]);
      const y = Number(match[3]);
      const z = Number(match[4]);

      if (![x, y, z].every(Number.isFinite)) {
        throw new Error("MODEL_COORDINATE_INVALID");
      }

      return (
        match[1] +
        formatNumber(x * unitScale) +
        " " +
        formatNumber(y * unitScale) +
        " " +
        formatNumber(z * unitScale) +
        match[5]
      );
    })
    .join("\n");

  await writeFile(outputPath, normalized, {
    mode: 0o600
  });

  return outputPath;
}

async function normalizeStl({
  inputPath,
  outputPath,
  unitScale
}) {
  const buffer = await readFile(inputPath);

  if (isBinaryStl(buffer)) {
    const normalized = Buffer.from(buffer);

    const triangleCount =
      normalized.readUInt32LE(80);

    let offset = 84;

    for (
      let triangle = 0;
      triangle < triangleCount;
      triangle += 1
    ) {
      /*
       * Cada triângulo:
       * 12 bytes normal
       * 36 bytes vértices
       * 2 bytes attribute count
       *
       * Normais não são escaladas.
       */
      for (let component = 0; component < 9; component += 1) {
        const position =
          offset + 12 + component * 4;

        const value =
          normalized.readFloatLE(position);

        if (!Number.isFinite(value)) {
          throw new Error("MODEL_COORDINATE_INVALID");
        }

        normalized.writeFloatLE(
          value * unitScale,
          position
        );
      }

      offset += 50;
    }

    await writeFile(
      outputPath,
      normalized,
      { mode: 0o600 }
    );

    return outputPath;
  }

  const source =
    buffer.toString("utf8");

  const normalized =
    source.replace(
      /^(\s*vertex\s+)([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/gim,
      (_, prefix, xs, ys, zs) => {
        const x = Number(xs);
        const y = Number(ys);
        const z = Number(zs);

        if (![x, y, z].every(Number.isFinite)) {
          throw new Error("MODEL_COORDINATE_INVALID");
        }

        return (
          prefix +
          formatNumber(x * unitScale) +
          " " +
          formatNumber(y * unitScale) +
          " " +
          formatNumber(z * unitScale)
        );
      }
    );

  await writeFile(
    outputPath,
    normalized,
    { mode: 0o600 }
  );

  return outputPath;
}

function isBinaryStl(buffer) {
  if (buffer.length < 84) {
    return false;
  }

  const triangles =
    buffer.readUInt32LE(80);

  const expectedLength =
    84 + triangles * 50;

  return expectedLength === buffer.length;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error("MODEL_COORDINATE_INVALID");
  }

  return Number(value.toPrecision(15)).toString();
}