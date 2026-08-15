// Galeria de trabalhos já feitos.
// Para adicionar uma nova peça, acrescente um objeto com a mesma estrutura.
const baseUrl = import.meta.env.BASE_URL;
export const galleryItems = Object.freeze([
  Object.freeze({
    title: "Invincible",
    img: `${baseUrl}assets/image/gallery/invincible.jpeg`,
    tags: Object.freeze(["Estátua colecionável", "Multicolor"])
  }),
  Object.freeze({
    title: "Miolo de roda Ford",
    img: `${baseUrl}assets/image/gallery/ford-miolo-roda.png`,
    tags: Object.freeze(["PETG", "Automotivo"])
  }),
  Object.freeze({
    title: "Cthulhu",
    img: `${baseUrl}assets/image/gallery/cthulhu.png`,
    tags: Object.freeze(["Resina", "Miniatura"])
  })
]);
