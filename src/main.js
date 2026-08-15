import { galleryItems } from "./gallery/gallery.data.js";
import { renderGallery } from "./gallery/gallery.js";
import { initUploadShell } from "./upload/upload-shell.js";

renderGallery(galleryItems);
initUploadShell();
