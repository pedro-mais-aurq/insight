import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normalizeModelUnits
} from "../src/orca/normalize-model.js";

test(
  "OBJ em mm com coordenadas negativas é transladado para origem sem alterar dimensões",
  async () => {
    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          "insight-normalize-obj-"
        )
      );

    try {
      const input =
        path.join(
          root,
          "input.obj"
        );

      const output =
        path.join(
          root,
          "output.obj"
        );

      await writeFile(
        input,
        [
          "o shifted",
          "v -45.9 -57.17 0.199",
          "v 94.528 -57.17 0.199",
          "v -45.9 -28.9 6.2",
          "f 1 2 3"
        ].join("\n")
      );

      await normalizeModelUnits({
        inputPath: input,
        outputPath: output,
        extension: "obj",
        unitScale: 1
      });

      const vertices =
        readObjVertices(
          await readFile(
            output,
            "utf8"
          )
        );

      const bounds =
        boundsOf(vertices);

      approx(
        bounds.minX,
        0
      );

      approx(
        bounds.minY,
        0
      );

      approx(
        bounds.minZ,
        0
      );

      approx(
        bounds.maxX
          - bounds.minX,
        140.428
      );

      approx(
        bounds.maxY
          - bounds.minY,
        28.27
      );

      approx(
        bounds.maxZ
          - bounds.minZ,
        6.001
      );
    } finally {
      await rm(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "normalização converte unidade mas não faz scale-to-fit",
  async () => {
    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          "insight-normalize-scale-"
        )
      );

    try {
      const input =
        path.join(
          root,
          "input.obj"
        );

      const output =
        path.join(
          root,
          "output.obj"
        );

      /*
       * 20 cm = 200 mm.
       *
       * O normalizador deve manter
       * 200 mm, não reduzir para
       * caber na impressora.
       */
      await writeFile(
        input,
        [
          "v 50 20 10",
          "v 70 20 10",
          "v 50 21 10",
          "f 1 2 3"
        ].join("\n")
      );

      await normalizeModelUnits({
        inputPath: input,
        outputPath: output,
        extension: "obj",
        unitScale: 10
      });

      const vertices =
        readObjVertices(
          await readFile(
            output,
            "utf8"
          )
        );

      const bounds =
        boundsOf(vertices);

      approx(
        bounds.minX,
        0
      );

      approx(
        bounds.maxX
          - bounds.minX,
        200
      );
    } finally {
      await rm(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

test(
  "binary STL em mm é transladado para origem preservando geometria",
  async () => {
    const root =
      await mkdtemp(
        path.join(
          os.tmpdir(),
          "insight-normalize-stl-"
        )
      );

    try {
      const input =
        path.join(
          root,
          "input.stl"
        );

      const output =
        path.join(
          root,
          "output.stl"
        );

      const source =
        createBinaryStl([
          [
            [-5, -7, 2],
            [10, -7, 2],
            [-5, 3, 6]
          ]
        ]);

      await writeFile(
        input,
        source
      );

      await normalizeModelUnits({
        inputPath: input,
        outputPath: output,
        extension: "stl",
        unitScale: 1
      });

      const normalized =
        await readFile(output);

      const vertices =
        readBinaryStlVertices(
          normalized
        );

      const bounds =
        boundsOf(vertices);

      approx(
        bounds.minX,
        0
      );

      approx(
        bounds.minY,
        0
      );

      approx(
        bounds.minZ,
        0
      );

      approx(
        bounds.maxX
          - bounds.minX,
        15
      );

      approx(
        bounds.maxY
          - bounds.minY,
        10
      );

      approx(
        bounds.maxZ
          - bounds.minZ,
        4
      );
    } finally {
      await rm(
        root,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);

function readObjVertices(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const match =
        line.match(
          /^\s*v\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/
        );

      if (!match) {
        return null;
      }

      return [
        Number(match[1]),
        Number(match[2]),
        Number(match[3])
      ];
    })
    .filter(Boolean);
}

function createBinaryStl(
  triangles
) {
  const buffer =
    Buffer.alloc(
      84
      + triangles.length * 50
    );

  buffer.writeUInt32LE(
    triangles.length,
    80
  );

  let offset = 84;

  for (
    const triangle
    of triangles
  ) {
    /*
     * normal = 0,0,0
     */
    buffer.writeFloatLE(
      0,
      offset
    );

    buffer.writeFloatLE(
      0,
      offset + 4
    );

    buffer.writeFloatLE(
      0,
      offset + 8
    );

    for (
      let vertex = 0;
      vertex < 3;
      vertex += 1
    ) {
      const [
        x,
        y,
        z
      ] = triangle[vertex];

      const vertexOffset =
        offset
        + 12
        + vertex * 12;

      buffer.writeFloatLE(
        x,
        vertexOffset
      );

      buffer.writeFloatLE(
        y,
        vertexOffset + 4
      );

      buffer.writeFloatLE(
        z,
        vertexOffset + 8
      );
    }

    buffer.writeUInt16LE(
      0,
      offset + 48
    );

    offset += 50;
  }

  return buffer;
}

function readBinaryStlVertices(
  buffer
) {
  const count =
    buffer.readUInt32LE(80);

  const result = [];

  let offset = 84;

  for (
    let triangle = 0;
    triangle < count;
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

      result.push([
        buffer.readFloatLE(
          vertexOffset
        ),
        buffer.readFloatLE(
          vertexOffset + 4
        ),
        buffer.readFloatLE(
          vertexOffset + 8
        )
      ]);
    }

    offset += 50;
  }

  return result;
}

function boundsOf(vertices) {
  assert.ok(
    vertices.length > 0
  );

  const xs =
    vertices.map(
      ([x]) => x
    );

  const ys =
    vertices.map(
      ([, y]) => y
    );

  const zs =
    vertices.map(
      ([, , z]) => z
    );

  return {
    minX:
      Math.min(...xs),

    maxX:
      Math.max(...xs),

    minY:
      Math.min(...ys),

    maxY:
      Math.max(...ys),

    minZ:
      Math.min(...zs),

    maxZ:
      Math.max(...zs)
  };
}

function approx(
  actual,
  expected,
  tolerance = 1e-4
) {
  assert.ok(
    Math.abs(
      actual - expected
    ) <= tolerance,
    `${actual} != ${expected}`
  );
}