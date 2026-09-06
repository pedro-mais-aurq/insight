import {
  readFile,
  writeFile
} from "node:fs/promises";

/*
 * Apesar do nome histórico normalizeModelUnits,
 * esta etapa agora possui duas responsabilidades
 * estritamente geométricas:
 *
 * 1. converter a unidade declarada para milímetros;
 * 2. remover a translação absoluta arbitrária do arquivo,
 *    colocando minX/minY/minZ em 0.
 *
 * NÃO:
 * - redimensiona;
 * - rotaciona;
 * - reorganiza componentes;
 * - altera proporções;
 * - faz scale-to-fit.
 *
 * Portanto, um objeto de 200 mm continua tendo 200 mm
 * depois desta etapa e deve continuar sendo rejeitado
 * caso exceda o volume da impressora.
 */
export async function normalizeModelUnits({
  inputPath,
  outputPath,
  extension,
  unitScale
}) {
  if (
    !Number.isFinite(unitScale)
    || unitScale <= 0
  ) {
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

  throw new Error(
    "UNIT_NORMALIZATION_UNSUPPORTED"
  );
}

async function normalizeObj({
  inputPath,
  outputPath,
  unitScale
}) {
  const source =
    await readFile(inputPath, "utf8");

  const lines =
    source.split(/\r?\n/);

  const bounds =
    createBounds();

  /*
   * Primeira passagem:
   * calcula bounding box após conversão para mm.
   */
  for (const line of lines) {
    const match =
      matchObjVertex(line);

    if (!match) {
      continue;
    }

    const x = Number(match[2]);
    const y = Number(match[3]);
    const z = Number(match[4]);

    includeScaledPoint(
      bounds,
      x,
      y,
      z,
      unitScale
    );
  }

  assertHasGeometry(bounds);

  /*
   * Segunda passagem:
   * escala e translada os vértices.
   *
   * minX/minY/minZ tornam-se 0,
   * sem modificar dimensões/orientação.
   */
  const normalized =
    lines
      .map((line) => {
        const match =
          matchObjVertex(line);

        if (!match) {
          return line;
        }

        const x = Number(match[2]);
        const y = Number(match[3]);
        const z = Number(match[4]);

        const [
          normalizedX,
          normalizedY,
          normalizedZ
        ] = normalizePoint(
          x,
          y,
          z,
          unitScale,
          bounds
        );

        return (
          match[1]
          + formatNumber(normalizedX)
          + " "
          + formatNumber(normalizedY)
          + " "
          + formatNumber(normalizedZ)
          + match[5]
        );
      })
      .join("\n");

  await writeFile(
    outputPath,
    normalized,
    {
      mode: 0o600
    }
  );

  return outputPath;
}

async function normalizeStl({
  inputPath,
  outputPath,
  unitScale
}) {
  const buffer =
    await readFile(inputPath);

  if (isBinaryStl(buffer)) {
    return normalizeBinaryStl({
      buffer,
      outputPath,
      unitScale
    });
  }

  return normalizeAsciiStl({
    buffer,
    outputPath,
    unitScale
  });
}

async function normalizeBinaryStl({
  buffer,
  outputPath,
  unitScale
}) {
  const normalized =
    Buffer.from(buffer);

  const triangleCount =
    normalized.readUInt32LE(80);

  const bounds =
    createBounds();

  /*
   * Primeira passagem:
   * encontra o bounding box em milímetros.
   */
  let offset = 84;

  for (
    let triangle = 0;
    triangle < triangleCount;
    triangle += 1
  ) {
    /*
     * Binary STL:
     *
     * 12 bytes normal
     * 36 bytes vértices
     * 2 bytes attribute byte count
     */
    for (
      let vertex = 0;
      vertex < 3;
      vertex += 1
    ) {
      const vertexOffset =
        offset
        + 12
        + vertex * 12;

      const x =
        normalized.readFloatLE(
          vertexOffset
        );

      const y =
        normalized.readFloatLE(
          vertexOffset + 4
        );

      const z =
        normalized.readFloatLE(
          vertexOffset + 8
        );

      includeScaledPoint(
        bounds,
        x,
        y,
        z,
        unitScale
      );
    }

    offset += 50;
  }

  assertHasGeometry(bounds);

  /*
   * Segunda passagem:
   * converte unidade e remove translação.
   *
   * As normais permanecem intocadas.
   */
  offset = 84;

  for (
    let triangle = 0;
    triangle < triangleCount;
    triangle += 1
  ) {
    for (
      let vertex = 0;
      vertex < 3;
      vertex += 1
    ) {
      const vertexOffset =
        offset
        + 12
        + vertex * 12;

      const x =
        normalized.readFloatLE(
          vertexOffset
        );

      const y =
        normalized.readFloatLE(
          vertexOffset + 4
        );

      const z =
        normalized.readFloatLE(
          vertexOffset + 8
        );

      const [
        normalizedX,
        normalizedY,
        normalizedZ
      ] = normalizePoint(
        x,
        y,
        z,
        unitScale,
        bounds
      );

      normalized.writeFloatLE(
        normalizedX,
        vertexOffset
      );

      normalized.writeFloatLE(
        normalizedY,
        vertexOffset + 4
      );

      normalized.writeFloatLE(
        normalizedZ,
        vertexOffset + 8
      );
    }

    offset += 50;
  }

  await writeFile(
    outputPath,
    normalized,
    {
      mode: 0o600
    }
  );

  return outputPath;
}

async function normalizeAsciiStl({
  buffer,
  outputPath,
  unitScale
}) {
  const source =
    buffer.toString("utf8");

  const bounds =
    createBounds();

  /*
   * Primeira passagem:
   * encontra todos os vertex do ASCII STL.
   */
  for (
    const match of source.matchAll(
      asciiStlVertexRegex()
    )
  ) {
    const x = Number(match[2]);
    const y = Number(match[3]);
    const z = Number(match[4]);

    includeScaledPoint(
      bounds,
      x,
      y,
      z,
      unitScale
    );
  }

  assertHasGeometry(bounds);

  /*
   * Segunda passagem:
   * escala e translada.
   */
  const normalized =
    source.replace(
      asciiStlVertexRegex(),
      (
        _,
        prefix,
        xs,
        ys,
        zs
      ) => {
        const x = Number(xs);
        const y = Number(ys);
        const z = Number(zs);

        const [
          normalizedX,
          normalizedY,
          normalizedZ
        ] = normalizePoint(
          x,
          y,
          z,
          unitScale,
          bounds
        );

        return (
          prefix
          + formatNumber(normalizedX)
          + " "
          + formatNumber(normalizedY)
          + " "
          + formatNumber(normalizedZ)
        );
      }
    );

  await writeFile(
    outputPath,
    normalized,
    {
      mode: 0o600
    }
  );

  return outputPath;
}

function matchObjVertex(line) {
  /*
   * Apenas "v".
   *
   * Não captura:
   * vn
   * vt
   * vp
   */
  return line.match(
    /^(\s*v\s+)([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)(.*)$/
  );
}

function asciiStlVertexRegex() {
  return (
    /^(\s*vertex\s+)([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/gim
  );
}

function createBounds() {
  return {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    pointCount: 0
  };
}

function includeScaledPoint(
  bounds,
  x,
  y,
  z,
  unitScale
) {
  if (
    ![x, y, z].every(
      Number.isFinite
    )
  ) {
    throw new Error(
      "MODEL_COORDINATE_INVALID"
    );
  }

  const scaledX =
    x * unitScale;

  const scaledY =
    y * unitScale;

  const scaledZ =
    z * unitScale;

  if (
    ![
      scaledX,
      scaledY,
      scaledZ
    ].every(Number.isFinite)
  ) {
    throw new Error(
      "MODEL_COORDINATE_INVALID"
    );
  }

  bounds.minX =
    Math.min(
      bounds.minX,
      scaledX
    );

  bounds.minY =
    Math.min(
      bounds.minY,
      scaledY
    );

  bounds.minZ =
    Math.min(
      bounds.minZ,
      scaledZ
    );

  bounds.maxX =
    Math.max(
      bounds.maxX,
      scaledX
    );

  bounds.maxY =
    Math.max(
      bounds.maxY,
      scaledY
    );

  bounds.maxZ =
    Math.max(
      bounds.maxZ,
      scaledZ
    );

  bounds.pointCount += 1;
}

function normalizePoint(
  x,
  y,
  z,
  unitScale,
  bounds
) {
  if (
    ![x, y, z].every(
      Number.isFinite
    )
  ) {
    throw new Error(
      "MODEL_COORDINATE_INVALID"
    );
  }

  const normalizedX =
    x * unitScale
    - bounds.minX;

  const normalizedY =
    y * unitScale
    - bounds.minY;

  const normalizedZ =
    z * unitScale
    - bounds.minZ;

  if (
    ![
      normalizedX,
      normalizedY,
      normalizedZ
    ].every(Number.isFinite)
  ) {
    throw new Error(
      "MODEL_COORDINATE_INVALID"
    );
  }

  return [
    normalizeNegativeZero(
      normalizedX
    ),
    normalizeNegativeZero(
      normalizedY
    ),
    normalizeNegativeZero(
      normalizedZ
    )
  ];
}

function assertHasGeometry(bounds) {
  if (
    bounds.pointCount === 0
    || ![
      bounds.minX,
      bounds.minY,
      bounds.minZ,
      bounds.maxX,
      bounds.maxY,
      bounds.maxZ
    ].every(Number.isFinite)
  ) {
    throw new Error("MODEL_EMPTY");
  }
}

function isBinaryStl(buffer) {
  if (buffer.length < 84) {
    return false;
  }

  const triangles =
    buffer.readUInt32LE(80);

  const expectedLength =
    84 + triangles * 50;

  return (
    expectedLength
    === buffer.length
  );
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    throw new Error(
      "MODEL_COORDINATE_INVALID"
    );
  }

  return Number(
    normalizeNegativeZero(value)
      .toPrecision(15)
  ).toString();
}

function normalizeNegativeZero(value) {
  return Object.is(value, -0)
    ? 0
    : value;
}