import { describe, expect, it } from "vitest";
import {
  buildPhysicalMetrics,
  createUnknownUnit,
  createUserUnit,
  withUnitWarning
} from "../src/analysis/unit-converter.js";

const rawMetrics = {
  dimensions: { x: 1, y: 1, z: 1 },
  surfaceArea: 1,
  volume: 1
};

describe("conversão de unidades", () => {
  it.each([
    ["cm", 10],
    ["m", 1000],
    ["inch", 25.4]
  ])("converte uma unidade de %s para %s mm", (unit, expected) => {
    const physical = buildPhysicalMetrics(rawMetrics, createUserUnit(unit));
    expect(physical.dimensionsMm.x).toBe(expected);
  });

  it("aplica fator ao quadrado para área e ao cubo para volume", () => {
    const physical = buildPhysicalMetrics(rawMetrics, createUserUnit("cm"));
    expect(physical.surfaceAreaMm2).toBe(100);
    expect(physical.volumeMm3).toBe(1000);
  });

  it("mantém physicalMetrics null e warning quando a unidade é desconhecida", () => {
    const unit = createUnknownUnit();
    expect(buildPhysicalMetrics(rawMetrics, unit)).toBeNull();
    expect(withUnitWarning([], unit)).toEqual(["UNIT_UNKNOWN"]);
  });
});
