export function renderGallery(items) {
  const grid = document.getElementById("gallery-grid");

  if (!grid) {
    return;
  }

  if (!items || items.length === 0) {
    grid.innerHTML = '<div class="gallery-empty">Em breve, novas peças por aqui.</div>';
    return;
  }

  grid.innerHTML = items.map((item) => `
    <article class="gallery-item">
      <div class="gallery-thumb">
        <img src="${item.img}" alt="${item.title}" loading="lazy">
      </div>
      <div class="gallery-info">
        <h3>${item.title}</h3>
        <div class="gallery-tags">
          ${(item.tags || []).map((tag) => `<span class="gallery-tag">${tag}</span>`).join("")}
        </div>
      </div>
    </article>
  `).join("");
}
