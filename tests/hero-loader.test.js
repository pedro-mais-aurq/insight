import { describe, expect, it, vi } from "vitest";
import {
  initLazyHeroPrinter,
  markHeroFallback
} from "../src/hero/hero-loader.js";

function fakeContainer() {
  const attributes = new Set();
  return {
    dataset: {},
    setAttribute(name) { attributes.add(name); },
    removeAttribute(name) { attributes.delete(name); },
    hasAttribute(name) { return attributes.has(name); }
  };
}

describe("carregamento resiliente do header 3D", () => {
  it("possui fallback explícito", () => {
    const container = fakeContainer();
    markHeroFallback(container);
    expect(container.hasAttribute("data-hero-printer-fallback")).toBe(true);
    expect(container.dataset.heroPrinterState).toBe("fallback");
  });

  it("ativa o fallback quando o módulo 3D falha", async () => {
    const container = fakeContainer();
    let intersect;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    initLazyHeroPrinter(container, {
      loadModule: () => Promise.reject(new Error("network")),
      observerFactory(callback) {
        intersect = callback;
        return { observe() {}, disconnect() {} };
      },
      scheduleIdle: () => () => {}
    });

    intersect([{ isIntersecting: true }]);
    await vi.waitFor(() => {
      expect(container.dataset.heroPrinterState).toBe("fallback");
    });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("marca o header como pronto após inicialização bem-sucedida", async () => {
    const container = fakeContainer();
    let intersect;
    initLazyHeroPrinter(container, {
      loadModule: () => Promise.resolve({ initHeroPrinter: vi.fn() }),
      observerFactory(callback) {
        intersect = callback;
        return { observe() {}, disconnect() {} };
      },
      scheduleIdle: () => () => {}
    });

    intersect([{ isIntersecting: true }]);
    await vi.waitFor(() => {
      expect(container.dataset.heroPrinterState).toBe("ready");
    });
  });
});
