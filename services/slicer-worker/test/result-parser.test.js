import assert from "node:assert/strict";
import test from "node:test";
import { parseDuration, parseGcode, parseSliceInfo, parseSliceResult } from "../src/orca/result-parser.js";

const xml = `<?xml version="1.0"?><config><plate>
  <metadata key="prediction" value="4571"/>
  <metadata key="weight" value="63.51"/>
  <metadata key="first_layer_time" value="71915370231415445715746291712.000000"/>
  <filament id="1" used_g="63.51"/>
</plate></config>`;

test("prioriza prediction/weight e ignora first_layer_time inválido", () => {
  assert.deepEqual(parseSliceInfo(xml), {
    weightGrams: 63.51,
    printTimeSeconds: 4571,
    source: "slice_info.config"
  });
});

test("soma used_g quando metadata weight não existe", () => {
  const result = parseSliceInfo(`<config><plate><metadata key="prediction" value="120"/><filament used_g="2.5"/><filament used_g="1.25"/></plate></config>`);
  assert.equal(result.weightGrams, 3.75);
});

test("usa comentários de G-code como fallback", () => {
  const gcode = `; filament used [g] = 42.94\n; estimated printing time (normal mode) = 1h 33m 15s\n`;
  assert.deepEqual(parseGcode(gcode), {
    weightGrams: 42.94,
    printTimeSeconds: 5595,
    source: "gcode-comments"
  });
  assert.equal(parseDuration("1d 2h 3m 4s"), 93784);
});

test("rejeita resultados acima dos limites de sanidade", () => {
  assert.throws(() => parseSliceResult({
    sliceInfoXml: `<config><plate><metadata key="prediction" value="36000001"/><metadata key="weight" value="2"/></plate></config>`
  }), /SLICER_OUTPUT_OUT_OF_RANGE/);
});

test("aceita faixa comercial ampliada compatível com o pricing engine", () => {
  assert.deepEqual(parseSliceResult({ sliceInfoXml: `<config><plate><metadata key="prediction" value="3000000"/><metadata key="weight" value="50000"/></plate></config>` }), {
    weightGrams: 50_000,
    printTimeSeconds: 3_000_000,
    source: "slice_info.config",
    supportUsed: null,
    warnings: []
  });
});

test("rejeita output parcial, inválido, zero, negativo e não finito", () => {
  const cases = [
    `<config><plate><metadata key="prediction" value="120"/></plate></config>`,
    `<config><plate><metadata key="weight" value="2"/></plate></config>`,
    `<config><plate><metadata key="prediction" value="0"/><metadata key="weight" value="2"/></plate></config>`,
    `<config><plate><metadata key="prediction" value="120"/><metadata key="weight" value="-2"/></plate></config>`,
    `<config><plate><metadata key="prediction" value="NaN"/><metadata key="weight" value="2"/></plate></config>`,
    `<not-xml`
  ];
  for (const sliceInfoXml of cases) {
    assert.throws(() => parseSliceResult({ sliceInfoXml }), /SLICER_OUTPUT_MISSING/);
  }
});

test("limites defensivos são configuráveis", () => {
  assert.throws(() => parseSliceResult({
    sliceInfoXml: xml,
    maxWeightGrams: 60,
    maxPrintTimeSeconds: 5_000
  }), /SLICER_OUTPUT_OUT_OF_RANGE/);
});
