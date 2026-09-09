import { galleryItems } from "./gallery/gallery.data.js";
import { renderGallery } from "./gallery/gallery.js";
import { initLazyHeroPrinter } from "./hero/hero-loader.js";

renderGallery(galleryItems);
initLazyHeroPrinter(document.querySelector("[data-hero-printer]"));
initUploadWhenReady(document.querySelector("[data-upload-root]"));

function initUploadWhenReady(root) {
  if (!root) return;

  let started = false;
  let observer = null;
  const start = async () => {
    if (started) return;
    started = true;
    observer?.disconnect();
    try {
      const { initUploadShell } = await import("./upload/upload-shell.js");
      initUploadShell();
      root.dataset.uploadInitialization = "ready";
    } catch (error) {
      root.dataset.uploadInitialization = "failed";
      const status = document.querySelector("[data-upload-status]");
      if (status) {
        status.textContent = "Não foi possível carregar o envio agora. Atualize a página e tente novamente.";
        status.hidden = false;
      }
      console.error("[upload] Falha ao carregar o fluxo de envio.", error);
    }
  };

  if (typeof IntersectionObserver === "function") {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) start();
    }, { rootMargin: "500px 0px" });
    observer.observe(root);
  }

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(start, { timeout: 1500 });
  } else {
    setTimeout(start, 0);
  }
}
