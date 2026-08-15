import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseModel } from "../src/analysis/model-parser.js";
import { createBinaryStlFixture } from "./fixtures/binary-stl.js";
import { MinimalDOMParser } from "./helpers/minimal-dom-parser.js";

function fixtureFile(name, bytes) {
  return {
    name,
    async arrayBuffer() {
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      );
    }
  };
}

describe("parseModel", () => {
  it("interpreta STL ASCII com o loader oficial", async () => {
    const bytes = await readFile(new URL("./fixtures/triangle.stl", import.meta.url));
    const result = await parseModel(fixtureFile("triangle.stl", bytes), "stl");

    expect(result.format).toBe("stl");
    expect(result.meshCount).toBe(1);
    expect(result.object3D.geometry.getAttribute("position").count).toBe(3);
  });

  it("interpreta STL binário com o loader oficial", async () => {
    const bytes = new Uint8Array(createBinaryStlFixture());
    const result = await parseModel(fixtureFile("triangle.stl", bytes), "stl");
    expect(result.object3D.geometry.getAttribute("position").count).toBe(3);
  });

  it("interpreta OBJ triangular com o loader oficial", async () => {
    const bytes = await readFile(new URL("./fixtures/triangle.obj", import.meta.url));
    const result = await parseModel(fixtureFile("triangle.obj", bytes), "obj");

    expect(result.format).toBe("obj");
    expect(result.meshCount).toBe(1);
    expect(result.object3D.children[0].geometry.getAttribute("position").count).toBe(3);
  });

  it("interpreta fixture 3MF válida com o loader oficial", async () => {
    const originalDOMParser = globalThis.DOMParser;
    globalThis.DOMParser = MinimalDOMParser;

    try {
      const bytes = await readFile(new URL("./fixtures/triangle.3mf", import.meta.url));
      const result = await parseModel(fixtureFile("triangle.3mf", bytes), "3mf");

      expect(result.format).toBe("3mf");
      expect(result.meshCount).toBe(1);
      expect(result.object3D.children[0].children[0].geometry
        .getAttribute("position").count).toBe(3);
    } finally {
      globalThis.DOMParser = originalDOMParser;
    }
  });

  it("rejeita formato fora do contrato", async () => {
    await expect(parseModel(fixtureFile("model.ply", new Uint8Array([1])), "ply"))
      .rejects.toMatchObject({ code: "UNSUPPORTED_STRUCTURE" });
  });
});
