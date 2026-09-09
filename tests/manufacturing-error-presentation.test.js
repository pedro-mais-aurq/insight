import { describe, expect, it } from "vitest";
import { getManufacturingErrorPresentation } from "../src/manufacturing/manufacturing-error-presentation.js";

describe("apresentação dos erros reais de manufacturing", () => {
  it.each([
    ["ORCA_SLICING_ERROR", "Não conseguimos concluir"],
    ["SLICER_UNAVAILABLE", "temporariamente indisponível"],
    ["SLICER_PROFILE_MISMATCH", "Não conseguimos concluir"],
    ["MODEL_OUTSIDE_BUILD_VOLUME", "limite suportado pela estimativa automática"]
  ])("traduz %s sem usá-lo como mensagem principal", (code, expectedCopy) => {
    const presentation = getManufacturingErrorPresentation(code);
    expect(presentation.title).toContain(expectedCopy);
    expect(`${presentation.title} ${presentation.description}`).not.toContain(code);
    expect(presentation.action).toMatch(/WhatsApp|personalizada/);
  });

  it("usa fallback compreensível sem remover o diagnóstico interno", () => {
    const presentation = getManufacturingErrorPresentation("UNKNOWN_INTERNAL_CODE");
    expect(presentation.title).toBe("Não conseguimos concluir automaticamente a estimativa");
  });
});
