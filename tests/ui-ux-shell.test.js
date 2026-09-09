import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/css/style.css", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const heroLoader = readFileSync(
  new URL("../src/hero/hero-loader.js", import.meta.url),
  "utf8"
);

describe("shell UI/UX", () => {
  it("renderiza cinco operações independentes com região viva", () => {
    const steps = [...html.matchAll(/data-flow-step="([^"]+)"/g)]
      .map((match) => match[1]);
    expect(steps).toEqual([
      "upload",
      "analysis",
      "preparation",
      "manufacturing",
      "pricing"
    ]);
    expect(html).toContain("class=\"flow-steps\" aria-live=\"polite\"");
    expect(html).toContain("data-flow-root aria-labelledby=\"estimation-flow-title\" hidden");
  });

  it("progress indicators possuem semântica sem porcentagem estática inventada", () => {
    expect((html.match(/role="progressbar"/g) ?? [])).toHaveLength(5);
    expect((html.match(/aria-valuemin="0"/g) ?? [])).toHaveLength(5);
    expect((html.match(/aria-valuemax="100"/g) ?? [])).toHaveLength(5);
    expect(html).not.toContain("aria-valuenow=");
    expect(html).not.toMatch(/Calculando[^<]*\d+%/);
  });

  it("header 3D parte de fallback estável e carrega sob demanda", () => {
    expect(html).toContain("data-hero-printer-state=\"loading\"");
    expect(main).toContain("initLazyHeroPrinter");
    expect(heroLoader).toContain("data-hero-printer-fallback");
    expect(css).toContain("[data-hero-printer-fallback]::after");
  });

  it("usa a logo SVG oficial em todos os pontos de identidade", () => {
    const logoAssets = [...html.matchAll(/(?:src|href)="([^"]*insight-logo[^"]*)"/g)]
      .map((match) => match[1]);
    expect(new Set(logoAssets)).toEqual(new Set(["assets/image/insight-logo.svg"]));
  });

  it("mantém o painel preto restrito ao arquivo, preview e medidas", () => {
    const uploadPanel = html.slice(
      html.indexOf("data-upload-root"),
      html.indexOf("data-manufacturing-root")
    );
    expect(uploadPanel).toContain("data-upload-title");
    expect(uploadPanel).toContain("data-model-viewer");
    expect(uploadPanel).toContain("data-analysis-dimensions");
    expect(uploadPanel).toContain("data-analysis-area");
    expect(uploadPanel).toContain("data-analysis-volume");
    expect(uploadPanel).not.toContain("data-upload-status");
    expect(uploadPanel).not.toContain("data-analysis-warnings");
    expect(uploadPanel).not.toMatch(/Triângulos|Meshes|Vértices|Malha fechada|Arestas abertas|Non-manifold|Componentes/);
  });

  it("remove as labels técnicas e comerciais da apresentação", () => {
    expect(html).not.toContain("Estimativa técnica");
    expect(html).not.toContain("Estimativa comercial");
    expect(html).not.toContain("Ver histórico da análise");
  });

  it("remove a seção de acompanhamento e entrega um footer completo", () => {
    expect(html).not.toContain("href=\"#pedido\"");
    expect(html).not.toContain("id=\"pedido\"");
    expect(html).toContain("class=\"container footer-main\"");
    expect(html).toContain("class=\"footer-callout\"");
    expect(html).toContain("class=\"container footer-bottom\"");
  });

  it("mantém título e preview próximos no painel do modelo", () => {
    const uploadRule = css.match(/\.upload \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(uploadRule).toContain("justify-content: flex-start");
    expect(uploadRule).toContain("gap: 14px");
  });
});

describe("contratos responsivos", () => {
  it.each([
    [320, "compact"],
    [375, "compact"],
    [390, "compact"],
    [430, "compact"],
    [768, "mobile"],
    [1366, "desktop"],
    [1440, "desktop"]
  ])("%i px é coberto pela política %s", (width, policy) => {
    const resolved = width <= 480 ? "compact" : width <= 800 ? "mobile" : "desktop";
    expect(resolved).toBe(policy);
    if (policy === "compact") expect(css).toContain("@media(max-width:480px)");
    if (policy === "mobile") expect(css).toContain("@media(max-width:800px)");
    if (policy === "desktop") expect(css).toContain("width: min(1180px, calc(100% - 40px))");
  });

  it("protege conteúdo longo e reduz movimento quando solicitado", () => {
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain(".btn.whatsapp");
  });
});
