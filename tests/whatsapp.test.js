import { describe, expect, it } from "vitest";
import {
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  createWhatsAppView,
  normalizeWhatsAppNumber
} from "../src/contact/whatsapp.js";

const NUMBER = "5531999999999";

function completeContext() {
  return {
    filename: "engrenagem.stl",
    format: "stl",
    dimensions: { x: 42.5, y: 31, z: 10.25 },
    material: "PLA",
    layerHeightMm: 0.2,
    weightGrams: 63.51,
    printTimeSeconds: 5400,
    price: { totalPrice: 205.62, currency: "BRL" },
    estimateStatus: "completed"
  };
}

function fakeElement() {
  const attributes = new Map();
  return {
    dataset: {},
    hidden: false,
    textContent: "",
    href: "",
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) {
      attributes.delete(name);
      if (name === "href") this.href = "";
    },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };
}

function whatsappViewHarness() {
  const panel = fakeElement();
  const summary = fakeElement();
  const configWarning = fakeElement();
  const links = [fakeElement(), fakeElement()];
  const selectors = {
    "[data-whatsapp-panel]": panel,
    "[data-whatsapp-summary]": summary,
    "[data-whatsapp-config-warning]": configWarning
  };
  const root = {
    querySelector: (selector) => selectors[selector],
    querySelectorAll: () => links
  };
  return { root, panel, summary, configWarning, links };
}

describe("mensagem progressiva do WhatsApp", () => {
  it("sucesso contém apenas os valores comerciais disponíveis", () => {
    const message = buildWhatsAppMessage(completeContext());

    expect(message).toContain("engrenagem.stl");
    expect(message).toContain("42,5 × 31 × 10,25 mm");
    expect(message).toContain("Material: PLA");
    expect(message).toContain("Camada: 0,2 mm");
    expect(message).toContain("Peso estimado: 63,51 g");
    expect(message).toContain("Tempo estimado: 1 h 30 min");
    expect(message).toMatch(/Valor estimado: R\$\s?205,62/);
    expect(message).not.toMatch(/undefined|null|NaN/);
  });

  it("falha do slicer ainda gera link e não inventa peso, tempo ou preço", () => {
    const context = {
      filename: "busto.3mf",
      format: "3mf",
      dimensions: { x: 95, y: 75, z: 160 },
      material: "PLA",
      layerHeightMm: 0.2,
      estimateStatus: "failed",
      errorCode: "ORCA_SLICING_ERROR",
      weightGrams: undefined,
      printTimeSeconds: null,
      price: { totalPrice: Number.NaN, currency: "BRL" }
    };
    const message = buildWhatsAppMessage(context);
    const url = buildWhatsAppUrl({ number: NUMBER, message });

    expect(url).toMatch(/^https:\/\/wa\.me\/5531999999999\?text=/);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe(message);
    expect(message).toContain("estimativa automática de fabricação não pôde ser finalizada");
    expect(message).not.toContain("Peso estimado");
    expect(message).not.toContain("Tempo estimado");
    expect(message).not.toContain("Valor estimado");
    expect(message).not.toMatch(/undefined|null|NaN/);
  });

  it("diferencia warning físico de limite da estimativa automática", () => {
    const physicalWarning = buildWhatsAppMessage({
      ...completeContext(),
      capacityWarning: { kind: "physical_reference" }
    });
    expect(physicalWarning).toContain("180 × 180 × 180 mm da impressora de referência");

    const automaticLimit = buildWhatsAppMessage({
      ...completeContext(),
      estimateStatus: "failed",
      errorCode: "MODEL_OUTSIDE_BUILD_VOLUME",
      weightGrams: null,
      printTimeSeconds: null,
      price: null
    });
    expect(automaticLimit).toContain("limite suportado pela estimativa automática");
    expect(automaticLimit).not.toContain("não pode ser impresso");
  });
});

describe("CTA do WhatsApp", () => {
  it("fica funcional tanto no sucesso quanto na falha", () => {
    const harness = whatsappViewHarness();
    const view = createWhatsAppView(harness.root, { number: NUMBER });

    view.render(completeContext());
    expect(harness.panel.hidden).toBe(false);
    expect(harness.links.every((link) => link.href.startsWith("https://wa.me/"))).toBe(true);

    view.render({
      ...completeContext(),
      estimateStatus: "failed",
      errorCode: "SLICER_UNAVAILABLE",
      weightGrams: null,
      printTimeSeconds: null,
      price: null
    });
    expect(harness.links.every((link) => link.href.startsWith("https://wa.me/"))).toBe(true);
    expect(harness.summary.textContent).toContain("análise personalizada");
  });

  it("falha fechado quando o número oficial não foi configurado", () => {
    const harness = whatsappViewHarness();
    const view = createWhatsAppView(harness.root, { number: "" });
    view.render(completeContext());

    expect(harness.panel.dataset.whatsappState).toBe("unconfigured");
    expect(harness.configWarning.hidden).toBe(false);
    expect(harness.links.every((link) => link.getAttribute("aria-disabled") === "true")).toBe(true);
  });

  it("não oferece contato para um arquivo ainda não confirmado", () => {
    const harness = whatsappViewHarness();
    const view = createWhatsAppView(harness.root, { number: NUMBER });
    view.render({
      filename: "arquivo.exe",
      contactAvailable: false,
      estimateStatus: "unavailable"
    });
    expect(harness.panel.hidden).toBe(true);
  });

  it("normaliza somente números plausíveis com DDI", () => {
    expect(normalizeWhatsAppNumber("+55 (31) 99999-9999")).toBe(NUMBER);
    expect(normalizeWhatsAppNumber("123")).toBe("");
  });
});
