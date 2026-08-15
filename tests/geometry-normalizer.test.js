import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial
} from "three";
import { normalizeGeometry } from "../src/analysis/geometry-normalizer.js";

describe("normalizeGeometry", () => {
  it("aplica matrixWorld de grupos aninhados", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ], 3));
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    const group = new Group();
    mesh.position.set(2, 0, 0);
    group.position.set(3, 0, 0);
    group.add(mesh);

    const normalized = normalizeGeometry(group);
    expect([...normalized.positions.slice(0, 3)]).toEqual([5, 0, 0]);
    expect(normalized).toMatchObject({
      meshCount: 1,
      rawVertexCount: 3,
      triangleCount: 1
    });
  });

  it("normaliza BufferGeometry indexada", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ], 3));
    geometry.setIndex([0, 1, 2]);
    const normalized = normalizeGeometry(new Mesh(
      geometry,
      new MeshBasicMaterial()
    ));

    expect(normalized.positions).toHaveLength(9);
    expect(normalized.triangleCount).toBe(1);
  });
});
