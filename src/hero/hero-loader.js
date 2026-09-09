export function initLazyHeroPrinter(
  container,
  {
    loadModule = () => import("./hero-printer.js"),
    observerFactory = defaultObserverFactory,
    scheduleIdle = defaultScheduleIdle
  } = {}
) {
  if (!container) return () => {};

  let started = false;
  let disposed = false;
  let disposePrinter = null;
  let observer = null;
  let cancelIdle = () => {};
  container.dataset.heroPrinterState = "loading";

  async function start() {
    if (started || disposed) return;
    started = true;
    observer?.disconnect();
    cancelIdle();

    try {
      const module = await loadModule();
      if (disposed) return;
      if (typeof module?.initHeroPrinter !== "function") {
        throw new TypeError("HERO_MODULE_INVALID");
      }
      disposePrinter = module.initHeroPrinter(container) ?? null;
      container.dataset.heroPrinterState = container.hasAttribute("data-hero-printer-fallback")
        ? "fallback"
        : "ready";
    } catch (error) {
      markHeroFallback(container);
      console.error("[hero] Falha ao carregar a visualização 3D.", error);
    }
  }

  observer = observerFactory?.((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      start();
    }
  }) ?? null;
  observer?.observe(container);
  cancelIdle = scheduleIdle(start);

  return () => {
    disposed = true;
    observer?.disconnect();
    cancelIdle();
    disposePrinter?.();
  };
}

export function markHeroFallback(container) {
  if (!container) return;
  container.setAttribute("data-hero-printer-fallback", "");
  container.dataset.heroPrinterState = "fallback";
}

function defaultObserverFactory(callback) {
  return typeof IntersectionObserver === "function"
    ? new IntersectionObserver(callback, { rootMargin: "240px 0px" })
    : null;
}

function defaultScheduleIdle(callback) {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(callback, { timeout: 1200 });
    return () => cancelIdleCallback(id);
  }

  const id = setTimeout(callback, 0);
  return () => clearTimeout(id);
}
