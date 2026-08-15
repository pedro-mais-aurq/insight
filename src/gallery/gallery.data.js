// Galeria de trabalhos já feitos.
// Para adicionar uma nova peça, acrescente um objeto com a mesma estrutura.
import invincibleImg from "../../assets/image/gallery/invincible.jpeg";
import fordImg from "../../assets/image/gallery/ford-miolo-roda.png";
import cthulhuImg from "../../assets/image/gallery/cthulhu.png";

export const galleryItems = Object.freeze([
  Object.freeze({
    title: "Invincible",
    img: invincibleImg,
    tags: Object.freeze(["Estátua colecionável", "Multicolor"])
  }),
  Object.freeze({
    title: "Miolo de roda Ford",
    img: fordImg,
    tags: Object.freeze(["PETG", "Automotivo"])
  }),
  Object.freeze({
    title: "Cthulhu",
    img: cthulhuImg,
    tags: Object.freeze(["Resina", "Miniatura"])
  })
]);
