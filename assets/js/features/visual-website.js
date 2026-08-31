(function () {
  "use strict";

  const root = document.getElementById("nxVisualWebsite");
  if (!root) return;

  const grid = document.getElementById("nxVisualGrid");
  const search = document.getElementById("nxVisualSearch");
  const clear = document.getElementById("nxVisualClear");
  const filters = document.getElementById("nxVisualFilters");
  const resultText = document.getElementById("nxVisualResultText");
  const total = document.getElementById("nxVisualTotal");
  const more = document.getElementById("nxVisualMore");
  const room = document.getElementById("nxVisualRoom");
  const frame = document.getElementById("nxVisualFrame");
  const loader = document.getElementById("nxVisualLoader");
  const roomTitle = document.getElementById("nxVisualRoomTitle");
  const roomMeta = document.getElementById("nxVisualRoomMeta");
  const back = document.getElementById("nxVisualBack");
  const reload = document.getElementById("nxVisualReload");
  const fullscreen = document.getElementById("nxVisualFullscreen");

  const PAGE_SIZE = 18;
  const categoryLabels = Object.freeze({
    all: "Semua",
    motion: "Motion",
    geometry: "Geometry",
    space: "Space",
    nature: "Nature",
    interface: "UI",
    loaders: "Loader",
    characters: "Character",
    celebration: "Celebration"
  });
  const categoryIcons = Object.freeze({
    motion: "fa-wand-magic-sparkles",
    geometry: "fa-shapes",
    space: "fa-meteor",
    nature: "fa-leaf",
    interface: "fa-window-maximize",
    loaders: "fa-spinner",
    characters: "fa-user-astronaut",
    celebration: "fa-heart"
  });
  const categoryColors = Object.freeze({
    motion: "#a78bfa",
    geometry: "#67e8f9",
    space: "#818cf8",
    nature: "#6ee7b7",
    interface: "#f0abfc",
    loaders: "#fbbf24",
    characters: "#fb7185",
    celebration: "#f472b6"
  });

  let demos = [];
  let category = "all";
  let visible = PAGE_SIZE;
  let activeDemo = null;
  let restoreFocus = null;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function normalizedQuery() {
    return String(search.value || "").trim().toLocaleLowerCase("id");
  }

  function filteredDemos() {
    const query = normalizedQuery();
    return demos.filter((demo) => {
      if (category !== "all" && demo.category !== category) return false;
      if (!query) return true;
      return `${demo.title} ${demo.filename} ${demo.category} ${demo.engine}`.toLocaleLowerCase("id").includes(query);
    });
  }

  function cardMarkup(demo) {
    const accent = categoryColors[demo.category] || categoryColors.motion;
    const icon = categoryIcons[demo.category] || categoryIcons.motion;
    return `<button class="nx-visual-card" type="button" data-visual-id="${escapeHtml(demo.id)}" style="--card-accent:${accent}" aria-label="Buka ${escapeHtml(demo.title)}">
      <span class="nx-visual-card-top"><span class="nx-visual-card-icon"><i class="fa-solid ${icon}"></i></span><span class="nx-visual-card-number">${String(demo.order).padStart(2, "0")}</span></span>
      <h3>${escapeHtml(demo.title)}</h3>
      <span class="nx-visual-card-meta"><span class="nx-visual-tag">${escapeHtml(demo.engine)}</span><span class="nx-visual-tag">${demo.network ? "online" : "offline"}</span></span>
    </button>`;
  }

  function render() {
    const matches = filteredDemos();
    const shown = matches.slice(0, visible);
    if (shown.length) {
      grid.innerHTML = shown.map(cardMarkup).join("");
    } else {
      grid.innerHTML = '<div class="nx-visual-empty"><i class="fa-solid fa-magnifying-glass"></i>Tidak ada visual yang cocok. Coba kata kunci atau kategori lain.</div>';
    }
    const label = categoryLabels[category] || categoryLabels.all;
    resultText.innerHTML = `<strong>${shown.length}</strong> dari ${matches.length} visual · ${escapeHtml(label)}`;
    more.hidden = shown.length >= matches.length;
    if (!more.hidden) more.textContent = `Tampilkan ${Math.min(PAGE_SIZE, matches.length - shown.length)} visual lagi`;
    clear.hidden = !search.value;
  }

  function renderFilters() {
    const counts = demos.reduce((result, demo) => {
      result[demo.category] = (result[demo.category] || 0) + 1;
      return result;
    }, { all: demos.length });
    const categories = ["all", ...Object.keys(categoryLabels).filter((key) => key !== "all" && counts[key])];
    filters.innerHTML = categories.map((key) => `<button class="nx-visual-filter${key === category ? " active" : ""}" type="button" data-visual-category="${key}" aria-pressed="${key === category}">${categoryLabels[key]} <span>${counts[key] || 0}</span></button>`).join("");
  }

  function openDemo(demo, sourceButton) {
    if (!demo) return;
    activeDemo = demo;
    restoreFocus = sourceButton || document.activeElement;
    roomTitle.textContent = demo.title;
    roomMeta.textContent = `${categoryLabels[demo.category] || demo.category} · ${demo.engine}`;
    loader.classList.remove("is-ready");
    frame.title = demo.title;
    frame.src = demo.path;
    room.classList.add("active");
    room.setAttribute("aria-hidden", "false");
    document.body.classList.add("nx-visual-room-open");
    back.focus({ preventScroll: true });
  }

  function closeDemo() {
    if (!room.classList.contains("active")) return;
    room.classList.remove("active");
    room.setAttribute("aria-hidden", "true");
    document.body.classList.remove("nx-visual-room-open");
    frame.src = "about:blank";
    activeDemo = null;
    if (restoreFocus && typeof restoreFocus.focus === "function") restoreFocus.focus({ preventScroll: true });
  }

  function reloadDemo() {
    if (!activeDemo) return;
    loader.classList.remove("is-ready");
    frame.src = "about:blank";
    window.setTimeout(() => { if (activeDemo) frame.src = activeDemo.path; }, 30);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement && room.requestFullscreen) room.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-visual-id]");
    if (!button) return;
    openDemo(demos.find((demo) => demo.id === button.dataset.visualId), button);
  });
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-visual-category]");
    if (!button) return;
    category = button.dataset.visualCategory || "all";
    visible = PAGE_SIZE;
    renderFilters();
    render();
  });
  search.addEventListener("input", () => { visible = PAGE_SIZE; render(); });
  clear.addEventListener("click", () => { search.value = ""; search.focus(); visible = PAGE_SIZE; render(); });
  more.addEventListener("click", () => { visible += PAGE_SIZE; render(); });
  back.addEventListener("click", closeDemo);
  reload.addEventListener("click", reloadDemo);
  fullscreen.addEventListener("click", toggleFullscreen);
  frame.addEventListener("load", () => {
    if (frame.src && !frame.src.endsWith("about:blank")) loader.classList.add("is-ready");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && room.classList.contains("active")) closeDemo();
  });

  fetch("assets/visuals/manifest.json", { cache: "no-cache", credentials: "same-origin" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((manifest) => {
      demos = Array.isArray(manifest.demos) ? manifest.demos : [];
      total.textContent = String(demos.length);
      root.dataset.ready = "true";
      renderFilters();
      render();
    })
    .catch(() => {
      grid.innerHTML = '<div class="nx-visual-empty"><i class="fa-solid fa-triangle-exclamation"></i>Katalog visual gagal dimuat. Muat ulang halaman untuk mencoba lagi.</div>';
      resultText.textContent = "Katalog tidak tersedia";
      more.hidden = true;
    });

  window.NexoraVisualWebsite = Object.freeze({ close: closeDemo, count: () => demos.length });
})();
