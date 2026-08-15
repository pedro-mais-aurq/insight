import { describe, expect, it } from "vitest";
import { BoxGeometry } from "three";
import { ANALYSIS_CONFIG } from "../src/config/analysis.config.js";
import {
  analyzeGeometry,
  shouldPerformTopology
} from "../src/analysis/geometry-metrics.js";

function positionsFromGeometry(geometry) {
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  return new Float32Array(nonIndexed.getAttribute("position").array);
}

function tetrahedron(offsetX = 0) {
  const vertex = (x, y, z) => [x + offsetX, y, z];
  const a = vertex(0, 0, 0);
  const b = vertex(1, 0, 0);
  const c = vertex(0, 1, 0);
  const d = vertex(0, 0, 1);
  return new Float32Array([
    ...a, ...c, ...b,
    ...a, ...b, ...d,
    ...a, ...d, ...c,
    ...b, ...c, ...d
  ]);
}

describe("analyzeGeometry", () => {
  it("calcula cubo fechado com dimensões, área, volume e topologia conhecidos", () => {
    const geometry = new BoxGeometry(2, 3, 4);
    const result = analyzeGeometry(positionsFromGeometry(geometry));

    expect(result.rawMetrics.dimensions).toEqual({ x: 2, y: 3, z: 4 });
    expect(result.rawMetrics.surfaceArea).toBeCloseTo(52, 6);
    expect(result.rawMetrics.volume).toBeCloseTo(24, 6);
    expect(result.topology).toMatchObject({
      performed: true,
      openEdgeCount: 0,
      nonManifoldEdgeCount: 0,
      connectedComponentCount: 1,
      watertight: true
    });
    expect(result.volumeReliable).toBe(true);
  });

  it("calcula volume conhecido de um tetraedro", () => {
    const result = analyzeGeometry(tetrahedron());
    expect(result.rawMetrics.volume).toBeCloseTo(1 / 6, 7);
  });

  it("detecta malha aberta e torna o volume não confiável", () => {
    const cube = positionsFromGeometry(new BoxGeometry(1, 1, 1));
    const openCube = cube.slice(9);
    const result = analyzeGeometry(openCube);

    expect(result.topology.openEdgeCount).toBeGreaterThan(0);
    expect(result.topology.watertight).toBe(false);
    expect(result.volumeReliable).toBe(false);
  });

  it("detecta aresta non-manifold", () => {
    const positions = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      1, 0, 0, 0, 0, 0, 0, -1, 0,
      0, 0, 0, 1, 0, 0, 0, 0, 1
    ]);
    const result = analyzeGeometry(positions);
    expect(result.topology.nonManifoldEdgeCount).toBeGreaterThan(0);
  });

  it("detecta triângulo degenerado", () => {
    const result = analyzeGeometry(new Float32Array([
      0, 0, 0, 1, 0, 0, 2, 0, 0
    ]));
    expect(result.topology.degenerateTriangleCount).toBe(1);
  });

  it("conta componentes desconectados", () => {
    const first = tetrahedron();
    const second = tetrahedron(10);
    const positions = new Float32Array(first.length + second.length);
    positions.set(first);
    positions.set(second, first.length);

    expect(analyzeGeometry(positions).topology.connectedComponentCount).toBe(2);
  });

  it("mantém métricas básicas e pula topologia acima do limite", () => {
    const result = analyzeGeometry(tetrahedron(), {
      ...ANALYSIS_CONFIG,
      topologyTriangleLimit: 2
    });

    expect(result.rawMetrics.surfaceArea).toBeGreaterThan(0);
    expect(result.topology.performed).toBe(false);
    expect(result.topology.watertight).toBeNull();
    expect(result.warnings).toContain("TOPOLOGY_SKIPPED_COMPLEXITY");
  });

  it("aplica a fronteira topológica oficial de 500 mil triângulos", () => {
    expect(shouldPerformTopology(500_000)).toBe(true);
    expect(shouldPerformTopology(500_001)).toBe(false);
  });

  it("rejeita NaN e Infinity", () => {
    expect(() => analyzeGeometry(new Float32Array([
      0, 0, 0, 1, 0, 0, Number.NaN, 1, 0
    ]))).toThrowError(expect.objectContaining({ code: "INVALID_COORDINATES" }));
  });
});
