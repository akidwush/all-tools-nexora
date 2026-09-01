(function () {
  "use strict";

  var API = "/api/ai/novel-cover";
  var GENRES = ["Fantasy", "Romance", "Villainess", "Yuri", "Academy", "Isekai", "Action", "Dark Fantasy", "Sci-Fi", "Mystery", "Horror", "Modern Fantasy"];
  var state = { providers: [], image: null, plan: null, titleY: 0.08, drag: false, styleType: "fal", last: null, colorTouched: false };
  var FONT_STACKS = {
    "editorial-serif": 'Georgia,"Times New Roman",serif',
    "modern-serif": '"Palatino Linotype","Book Antiqua",Georgia,serif',
    "clean-sans": '"Nexora Cover Sans",Arial,sans-serif',
    "display-sans": '"Nexora Cover Display","Arial Black",Arial,sans-serif'
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function options(values, selected) {
    return values.map(function (value) { return '<option' + (value === selected ? " selected" : "") + ">" + escapeHtml(value) + "</option>"; }).join("");
  }

  function field(root, key) { return root.querySelector('[data-nc="' + key + '"]'); }
  function selectedRadio(root, name) { var selected = root.querySelector('input[name="' + name + '"]:checked'); return selected ? selected.value : ""; }
  function director() {
    if (!window.NexoraNovelCoverDirector) throw new Error("AI Cover Director belum termuat. Muat ulang halaman.");
    return window.NexoraNovelCoverDirector;
  }

  function html() {
    var flashModel = "google/" + "gem" + "ini-3.1-flash-image-preview";
    return '<section class="nc-shell nc-director-shell">' +
      '<header class="nc-hero"><span><i class="fa-solid fa-wand-magic-sparkles"></i> NEXORA // AI COVER DIRECTOR</span><h2>Nexora Novel Cover Generator</h2><p>Ceritakan novelmu. AI menentukan art direction, komposisi, palet, ruang judul, dan tipografi cover secara otomatis.</p></header>' +
      '<div class="nc-layout"><form class="nc-form" data-nc="form">' +
      '<details class="nc-section" open><summary><b>01</b><strong>Detail Novel</strong><small>CUKUP INI</small></summary><div class="nc-body">' +
      '<label>Judul Novel<input data-nc="title" maxlength="160" value="My Novel" required></label>' +
      '<label>Author<input data-nc="author" maxlength="120" value="Ynrwrtie"></label>' +
      '<label>Genre<select data-nc="genre">' + options(GENRES, "Fantasy") + '</select></label>' +
      '<label class="wide">Sinopsis Singkat<textarea data-nc="description" maxlength="3000" rows="5" placeholder="Konflik utama, dunia cerita, dan momen yang harus terasa pada cover…" required></textarea><small data-nc="count">0 / 3000</small></label>' +
      '<label class="wide">Karakter Utama <small class="nc-optional">opsional</small><textarea data-nc="character" maxlength="1200" rows="3" placeholder="Penampilan, pakaian, ekspresi, dan ciri penting…"></textarea></label>' +
      '</div></details>' +
      '<section class="nc-director-card"><div class="nc-director-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div><div><b>Creative direction otomatis</b><p data-nc="director-state">Genre, komposisi, palet, title zone, dan typography ditentukan AI.</p><div class="nc-director-tags" data-nc="director-tags"></div></div><span class="nc-auto-badge">AUTO</span></section>' +
      '<details class="nc-section nc-advanced"><summary><b>02</b><strong>Advanced</strong><small>OPSIONAL</small></summary><div class="nc-body">' +
      '<fieldset class="wide nc-segment"><legend>Generation Mode</legend><label><input type="radio" name="mode" value="puter" checked><span>Puter Free <small>Default</small></span></label><label><input type="radio" name="mode" value="auto"><span>Pro Auto</span></label><label><input type="radio" name="mode" value="manual"><span>Pro Manual</span></label><label><input type="radio" name="mode" value="compare"><span>Compare</span></label></fieldset>' +
      '<label class="wide" data-nc="puter-model-field">Artwork Model<select data-nc="puter-model"><option value="google/imagen-4.0-fast" selected>Imagen 4 Fast — Cover Default</option><option value="openai/gpt-image-2">GPT Image 2</option><option value="' + flashModel + '">Nexora Flash Image</option><option value="qwen/qwen-image-2.0-pro">Qwen Image 2 Pro</option><option value="black-forest-labs/flux-schnell">FLUX Schnell</option><option value="openai/gpt-image-1-mini">GPT Image Mini — draft</option></select></label>' +
      '<label class="wide" data-nc="provider-field" hidden>Provider Pro<select data-nc="provider"><option value="auto">Auto — best available</option></select></label>' +
      '<div class="wide nc-providers" data-nc="compare" hidden></div><p class="wide nc-warning" data-nc="warning" hidden>Compare memakai beberapa generation dan dapat menggunakan lebih banyak API credit.</p>' +
      '<label>Variations<select data-nc="variations"><option value="1">1 cover</option><option value="2">2 covers</option><option value="4">4 covers</option></select></label><label>Seed<input data-nc="seed" type="number" min="0" max="4294967295" placeholder="Random"></label>' +
      '<label class="nc-upload" data-nc="reference-field">Reference Character<input data-nc="reference" type="file" accept="image/png,image/jpeg,image/webp"><span>Upload JPG/PNG/WebP</span><small data-nc="ref-name">Pro provider · maks 4 MB</small></label>' +
      '<label class="nc-upload" data-nc="style-reference-field">Style Reference<input data-nc="style-ref" type="file" accept="image/png,image/jpeg,image/webp"><span>Upload style guide</span><small data-nc="style-name">Pro provider tertentu</small></label>' +
      '<label class="wide nc-check" data-nc="nexora-style-field" hidden><input data-nc="nexora-style" type="checkbox"> Nexora Cover Style</label>' +
      '<label class="wide">Arahan Tambahan<textarea data-nc="direction" maxlength="800" rows="2" placeholder="Hanya jika ada detail yang benar-benar wajib…"></textarea></label>' +
      '</div></details>' +
      '<section class="nc-puter-account" data-nc="puter-account"><i class="fa-solid fa-cloud"></i><div><b data-nc="puter-name">Menyiapkan Puter…</b><small data-nc="puter-usage">Login tidak dilakukan otomatis.</small></div><button type="button" data-nc="puter-connect"><i class="fa-solid fa-right-to-bracket"></i><span>Hubungkan Puter</span></button></section>' +
      '<div class="nc-cost" data-nc="cost">Mode gratis: <b>AI Cover Director + 1 artwork</b> memakai allowance akun Puter.</div>' +
      '<label class="nc-local-upload"><input data-nc="artwork" type="file" accept="image/png,image/jpeg,image/webp"><i class="fa-solid fa-upload"></i><span><b>Pakai Artwork Sendiri</b><small data-nc="artwork-name">Director tetap memasang typography otomatis</small></span></label>' +
      '<button class="nc-generate" data-nc="generate"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Buat Cover Profesional</span></button><p class="nc-status" data-nc="status" hidden></p></form>' +
      '<aside class="nc-output"><div class="nc-empty" data-nc="empty"><i class="fa-regular fa-image"></i><h3>Cover Siap Terbit</h3><p>Artwork, hierarchy, dan typography final akan muncul di sini.</p></div>' +
      '<div class="nc-final" data-nc="results" hidden><header class="nc-result-head"><div><small>AI COVER DIRECTOR</small><h3>Cover Siap Terbit</h3></div><span data-nc="provider-label"></span></header>' +
      '<div class="nc-direction-summary" data-nc="direction-summary"></div>' +
      '<section class="nc-composer" data-nc="composer" hidden><div class="nc-canvas"><canvas data-nc="canvas"></canvas></div>' +
      '<div class="nc-primary-actions"><button type="button" data-nc="png"><i class="fa-solid fa-download"></i> Download PNG</button><button type="button" data-nc="regen"><i class="fa-solid fa-rotate"></i> Konsep Lain</button></div>' +
      '<details class="nc-editor" data-nc="editor"><summary><span><i class="fa-solid fa-sliders"></i> Edit Lanjutan</span><small>opsional</small></summary><div class="nc-controls">' +
      '<label>Title<input data-nc="ctitle"></label><label>Author<input data-nc="cauthor"></label>' +
      '<label>Typography<select data-nc="font"><option value="editorial-serif">Editorial Serif</option><option value="modern-serif">Modern Serif</option><option value="clean-sans">Clean Sans</option><option value="display-sans">Display Sans</option></select></label>' +
      '<label>Size Adjustment<input data-nc="size" type="range" min="-20" max="20" value="0"></label>' +
      '<label>Color<input data-nc="color" type="color" value="#ffffff"></label><label>Alignment<select data-nc="align"><option>center</option><option>left</option><option>right</option></select></label>' +
      '<fieldset class="wide nc-position"><legend>Title Position</legend><button type="button" data-pos="top">Top</button><button type="button" data-pos="center">Center</button><button type="button" data-pos="bottom">Bottom</button></fieldset>' +
      '<label class="nc-check"><input data-nc="stroke" type="checkbox"> Fine Stroke</label><label class="nc-check"><input data-nc="shadow" type="checkbox" checked> Soft Shadow</label>' +
      '<button class="wide nc-jpeg" type="button" data-nc="jpg">Download JPEG</button></div></details></section>' +
      '<details class="nc-source"><summary>Artwork sumber dan provider</summary><div class="nc-result-grid" data-nc="grid"></div></details></div></aside></div></section>';
  }

  function status(root, message, kind) {
    var node = field(root, "status");
    node.textContent = message;
    node.dataset.kind = kind || "info";
    node.hidden = !message;
  }

  function basicInput(root) {
    return { title: field(root, "title").value, author: field(root, "author").value, genre: field(root, "genre").value, description: field(root, "description").value, character: field(root, "character").value, aspectRatio: "2:3", typographyMode: "overlay", customDirection: field(root, "direction").value };
  }

  function updateDirectionPreview(root) {
    var plan = director().createLocalPlan(basicInput(root));
    field(root, "director-tags").innerHTML = [plan.visualStyle, plan.mood, plan.titleZone + " title"].map(function (value) { return "<span>" + escapeHtml(value) + "</span>"; }).join("");
  }

  function mode(root) {
    var value = selectedRadio(root, "mode");
    var free = value === "puter";
    field(root, "provider-field").hidden = value !== "manual";
    field(root, "compare").hidden = value !== "compare";
    field(root, "warning").hidden = value !== "compare";
    field(root, "variations").disabled = value === "compare" || free;
    field(root, "reference").disabled = free;
    field(root, "style-ref").disabled = free;
    field(root, "reference-field").classList.toggle("is-disabled", free);
    field(root, "style-reference-field").classList.toggle("is-disabled", free);
    if (window.NexoraNovelCoverPuter) window.NexoraNovelCoverPuter.sync(root, value);
    if (!free && !root.__ncProvidersRequested) { root.__ncProvidersRequested = true; loadProviders(root); }
  }

  async function loadProviders(root) {
    try {
      var response = await fetch(API);
      var data = await response.json();
      if (!data.ok) throw new Error("PROVIDER_STATUS_FAILED");
      state.providers = data.providers || [];
      state.providers.forEach(function (provider) {
        var option = document.createElement("option");
        option.value = provider.id;
        option.disabled = !provider.enabled;
        option.textContent = provider.name + (provider.enabled ? "" : " — unavailable");
        field(root, "provider").appendChild(option);
        var label = document.createElement("label");
        label.innerHTML = '<input type="checkbox" value="' + escapeHtml(provider.id) + '" ' + (provider.enabled ? "" : "disabled") + '><span><b>' + escapeHtml(provider.name) + "</b><small>" + (provider.enabled ? "API key configured" : "API key unavailable") + "</small></span>";
        field(root, "compare").appendChild(label);
      });
      if (data.nexoraStyle && (data.nexoraStyle.fal || data.nexoraStyle.recraft)) {
        state.styleType = data.nexoraStyle.fal ? "fal" : "recraft";
        field(root, "nexora-style-field").hidden = false;
      }
    } catch (_) { status(root, "Status provider Pro belum dapat dimuat. Mode gratis tetap tersedia.", "error"); }
  }

  function readReference(fileValue) {
    return new Promise(function (resolve, reject) {
      if (!fileValue) return resolve(null);
      if (["image/jpeg", "image/png", "image/webp"].indexOf(fileValue.type) === -1 || fileValue.size > 4000000) return reject(new Error("Reference harus JPG/PNG/WebP maksimal 4 MB."));
      var reader = new FileReader();
      reader.onload = function () { resolve({ dataUrl: reader.result, fileName: fileValue.name }); };
      reader.onerror = function () { reject(new Error("Reference gagal dibaca.")); };
      reader.readAsDataURL(fileValue);
    });
  }

  async function collectPayload(root) {
    var value = basicInput(root);
    var generationMode = selectedRadio(root, "mode");
    var free = generationMode === "puter";
    var compared = Array.prototype.slice.call(field(root, "compare").querySelectorAll("input:checked")).map(function (item) { return item.value; });
    if (generationMode === "compare" && (compared.length < 2 || compared.length > 4)) throw new Error("Pilih 2–4 provider.");
    var plan = director().createLocalPlan(value);
    return Object.assign(value, {
      mode: generationMode, provider: field(root, "provider").value, providers: compared,
      variations: free ? 1 : Number(field(root, "variations").value), seed: field(root, "seed").value,
      mood: plan.mood, composition: plan.composition, visualStyle: plan.visualStyle, director: plan,
      customDirection: [director().providerDirection(plan), value.customDirection].filter(Boolean).join(" ").slice(0, 800),
      useNexoraStyle: field(root, "nexora-style").checked, nexoraStyleType: state.styleType,
      referenceImage: free ? null : await readReference(field(root, "reference").files[0]),
      styleReference: free ? null : await readReference(field(root, "style-ref").files[0])
    });
  }

  function source(image) { return image && (image.base64 || image.url) || ""; }
  function resultRows(data) { return data.mode === "compare" ? data.result : [data.result]; }

  function setSummary(root, plan) {
    if (!plan) return;
    field(root, "direction-summary").innerHTML = [["Style", plan.visualStyle], ["Mood", plan.mood], ["Layout", plan.titleZone + " · " + plan.alignment], ["Typography", plan.fontMood]].map(function (item) { return '<span><small>' + escapeHtml(item[0]) + '</small><b>' + escapeHtml(item[1]) + '</b></span>'; }).join("");
    field(root, "director-state").textContent = plan.source === "ai-director" ? "AI creative brief diterapkan pada artwork dan typography." : "Genre-safe creative brief diterapkan otomatis.";
    field(root, "director-tags").innerHTML = [plan.visualStyle, plan.mood, plan.titleZone + " title"].map(function (value) { return "<span>" + escapeHtml(value) + "</span>"; }).join("");
  }

  function show(root, data) {
    var compare = data.mode === "compare";
    var rows = resultRows(data);
    field(root, "empty").hidden = true;
    field(root, "results").hidden = false;
    field(root, "grid").innerHTML = rows.map(function (row, index) {
      if (compare && !row.ok) return '<article class="nc-card error"><p>' + escapeHtml(row.error.message) + "</p></article>";
      var result = compare ? row.result : row;
      var image = result.images[0];
      return '<article class="nc-card"><img src="' + escapeHtml(source(image)) + '" loading="lazy" decoding="async"><footer><small>' + escapeHtml(result.provider) + " · " + escapeHtml(result.model) + '</small><button type="button" data-use="' + index + '">Gunakan Artwork</button></footer></article>';
    }).join("");
    field(root, "grid").querySelectorAll("[data-use]").forEach(function (button) {
      button.onclick = function () { var row = rows[Number(button.dataset.use)]; var result = compare ? row.result : row; if (result) compose(root, result.images[0], result.provider, result.director || data.director); };
    });
    var first = rows.find(function (row) { return !compare || row.ok; });
    var result = compare ? first && first.result : first;
    if (result) compose(root, result.images[0], result.provider, result.director || data.director);
  }

  async function generate(root) {
    var button = field(root, "generate");
    try {
      button.disabled = true;
      button.querySelector("span").textContent = "AI Director sedang bekerja…";
      var payload = await collectPayload(root);
      if (!payload.title.trim() || payload.description.trim().length < 20) throw new Error("Judul wajib dan sinopsis minimal 20 karakter.");
      var data;
      if (payload.mode === "puter") {
        status(root, "AI Cover Director menyusun komposisi khusus novelmu…", "loading");
        if (!window.NexoraNovelCoverPuter) throw new Error("Modul Puter belum termuat. Muat ulang halaman.");
        data = await window.NexoraNovelCoverPuter.generate(root, payload);
      } else {
        status(root, "Cover Director mengirim creative brief ke provider Pro…", "loading");
        var response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        data = await response.json().catch(function () { return {}; });
        if (!response.ok || !data.ok) { var providerError = new Error(data.message || "Cover gagal dibuat."); providerError.diagnostics = Array.isArray(data.diagnostics) ? data.diagnostics : []; throw providerError; }
        data.director = payload.director;
        if (data.mode === "compare") data.result.forEach(function (row) { if (row.ok) row.result.director = payload.director; });
        else data.result.director = payload.director;
      }
      state.last = data;
      show(root, data);
      status(root, "Cover profesional siap. Typography dan hierarchy sudah dipasang otomatis.", "success");
    } catch (error) {
      var detail = (error.diagnostics || []).map(function (item) { return item.provider + ": " + item.message; }).join(" · ");
      status(root, (error.message || "Cover gagal dibuat.") + (detail ? " — " + detail : ""), "error");
    } finally { button.disabled = false; mode(root); }
  }

  function zoneY(zone) { return zone === "center" ? 0.38 : zone === "bottom" ? 0.67 : 0.075; }
  function measureTracked(context, text, tracking) {
    var width = 0;
    Array.from(text).forEach(function (character, index, characters) { width += context.measureText(character).width + (index < characters.length - 1 ? tracking : 0); });
    return width;
  }
  function trackedText(context, text, x, y, tracking, maxWidth, stroke) {
    var characters = Array.from(text), width = Math.min(maxWidth, measureTracked(context, text, tracking));
    var start = context.textAlign === "left" ? x : context.textAlign === "right" ? x - width : x - width / 2;
    characters.forEach(function (character) { if (stroke) context.strokeText(character, start, y); else context.fillText(character, start, y); start += context.measureText(character).width + tracking; });
  }
  function wrapTitle(context, title, maxWidth, tracking) {
    var words = String(title || "").trim().split(/\s+/).filter(Boolean), lines = [], row = "";
    words.forEach(function (word) { var next = row ? row + " " + word : word; if (!row || measureTracked(context, next, tracking) <= maxWidth) row = next; else { lines.push(row); row = word; } });
    if (row) lines.push(row);
    while (lines.length > 3) lines[2] += " " + lines.pop();
    return lines;
  }

  function drawBackdrop(context, width, height, typography) {
    if (!typography.backdrop) return;
    var gradient;
    if (typography.zone === "bottom") {
      gradient = context.createLinearGradient(0, height * 0.58, 0, height);
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(1, typography.darkText ? "rgba(255,250,242,.35)" : "rgba(8,5,14,.42)");
    } else {
      gradient = context.createLinearGradient(0, 0, 0, height * 0.38);
      gradient.addColorStop(0, typography.darkText ? "rgba(255,250,242,.38)" : "rgba(8,5,14,.46)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  function draw(root) {
    if (!state.image || !state.plan) return;
    var canvas = field(root, "canvas"), context = canvas.getContext("2d");
    canvas.width = state.image.naturalWidth;
    canvas.height = state.image.naturalHeight;
    context.drawImage(state.image, 0, 0);
    var width = canvas.width, height = canvas.height;
    var typography = director().typography(context, width, height, state.plan);
    var authorTypography = director().typography(context, width, height, Object.assign({}, state.plan, { titleZone: "bottom" }));
    drawBackdrop(context, width, height, typography);
    if (!state.colorTouched) field(root, "color").value = typography.color;
    var fontMood = field(root, "font").value || typography.fontMood;
    var title = field(root, "ctitle").value.trim();
    if (["display-sans", "clean-sans"].indexOf(fontMood) !== -1 && ["Action", "Sci-Fi", "Horror"].indexOf(field(root, "genre").value) !== -1) title = title.toUpperCase();
    var adjustment = 1 + Number(field(root, "size").value || 0) / 100;
    var size = Math.max(width * 0.052, width * director().titleScale(title) * adjustment);
    var tracking = Math.max(1, size * (fontMood.indexOf("serif") !== -1 ? 0.012 : 0.025));
    var maxWidth = width * 0.82, stack = FONT_STACKS[fontMood] || FONT_STACKS["editorial-serif"], lines;
    do { context.font = "700 " + size + "px " + stack; lines = wrapTitle(context, title, maxWidth, tracking); if (lines.length <= 3 && lines.every(function (line) { return measureTracked(context, line, tracking) <= maxWidth; })) break; size -= width * 0.005; } while (size > width * 0.045);
    context.textAlign = field(root, "align").value || typography.align;
    context.textBaseline = "top";
    context.lineJoin = "round";
    var x = context.textAlign === "left" ? width * 0.09 : context.textAlign === "right" ? width * 0.91 : width / 2;
    var lineHeight = size * 1.08;
    var y = Math.max(height * 0.045, Math.min(height - lines.length * lineHeight - height * 0.16, state.titleY * height));
    if (field(root, "shadow").checked) { context.shadowColor = typography.darkText ? "rgba(255,255,255,.36)" : "rgba(0,0,0,.55)"; context.shadowBlur = Math.max(3, width * 0.009); context.shadowOffsetY = Math.max(1, width * 0.003); }
    context.fillStyle = field(root, "color").value;
    lines.forEach(function (line, index) {
      if (field(root, "stroke").checked) { context.strokeStyle = typography.darkText ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.6)"; context.lineWidth = Math.max(1, size * 0.018); trackedText(context, line, x, y + index * lineHeight, tracking, maxWidth, true); }
      trackedText(context, line, x, y + index * lineHeight, tracking, maxWidth, false);
    });
    context.shadowColor = "transparent";
    var ornamentY = y + lines.length * lineHeight + size * 0.16, ornamentWidth = Math.min(width * 0.22, size * 2.4);
    var ornamentCenter = context.textAlign === "left" ? x + ornamentWidth / 2 : context.textAlign === "right" ? x - ornamentWidth / 2 : width / 2;
    context.strokeStyle = typography.accent; context.globalAlpha = 0.78; context.lineWidth = Math.max(1, width * 0.0015); context.beginPath();
    context.moveTo(ornamentCenter - ornamentWidth / 2, ornamentY); context.lineTo(ornamentCenter - width * 0.012, ornamentY); context.moveTo(ornamentCenter + width * 0.012, ornamentY); context.lineTo(ornamentCenter + ornamentWidth / 2, ornamentY); context.stroke();
    context.save(); context.translate(ornamentCenter, ornamentY); context.rotate(Math.PI / 4); context.fillStyle = typography.accent; context.fillRect(-width * 0.004, -width * 0.004, width * 0.008, width * 0.008); context.restore(); context.globalAlpha = 1;
    var author = field(root, "cauthor").value.trim().toUpperCase();
    if (author) {
      var authorSize = Math.max(18, width * 0.027), authorTracking = Math.max(1, width * 0.0035);
      context.font = "600 " + authorSize + "px " + FONT_STACKS["clean-sans"]; context.textAlign = "center"; context.textBaseline = "middle";
      context.shadowColor = typography.darkText ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.7)"; context.shadowBlur = Math.max(2, width * 0.006);
      context.fillStyle = authorTypography.color;
      trackedText(context, author, width / 2, height * 0.935, authorTracking, width * 0.78, false); context.shadowColor = "transparent";
    }
  }

  function applyPlan(root, plan) {
    state.plan = plan || director().createLocalPlan(basicInput(root));
    state.titleY = zoneY(state.plan.titleZone);
    state.colorTouched = false;
    field(root, "font").value = state.plan.fontMood;
    field(root, "align").value = state.plan.alignment;
    field(root, "size").value = "0";
    field(root, "stroke").checked = false;
    field(root, "shadow").checked = true;
    setSummary(root, state.plan);
  }

  function compose(root, imageValue, provider, plan) {
    var image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = function () {
      state.image = image;
      field(root, "ctitle").value = field(root, "title").value;
      field(root, "cauthor").value = field(root, "author").value;
      applyPlan(root, plan);
      field(root, "composer").hidden = false;
      field(root, "provider-label").textContent = provider;
      draw(root);
      if (document.fonts && typeof document.fonts.load === "function") {
        Promise.all([
          document.fonts.load("700 64px 'Nexora Cover Display'"),
          document.fonts.load("600 32px 'Nexora Cover Sans'")
        ]).then(function () { draw(root); }).catch(function () {});
      }
      field(root, "results").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    image.onerror = function () { status(root, "Artwork tidak dapat dibuka di composer karena izin CDN provider.", "error"); };
    image.src = source(imageValue);
  }

  function download(root, type) {
    draw(root);
    field(root, "canvas").toBlob(function (blob) {
      if (!blob) return;
      var link = document.createElement("a"); link.href = URL.createObjectURL(blob);
      link.download = (field(root, "ctitle").value || "nexora-cover").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + (type === "image/png" ? ".png" : ".jpg");
      link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    }, type, type === "image/jpeg" ? 0.94 : undefined);
  }

  function bind(root) {
    field(root, "form").onsubmit = function (event) { event.preventDefault(); generate(root); };
    root.querySelectorAll('input[name="mode"]').forEach(function (input) { input.onchange = function () { mode(root); }; });
    field(root, "description").oninput = function (event) { field(root, "count").textContent = event.target.value.length + " / 3000"; updateDirectionPreview(root); };
    field(root, "genre").onchange = function () { updateDirectionPreview(root); };
    [["reference", "ref-name"], ["style-ref", "style-name"]].forEach(function (pair) { field(root, pair[0]).onchange = function (event) { field(root, pair[1]).textContent = event.target.files[0] ? event.target.files[0].name : "Opsional · maks 4 MB"; }; });
    ["ctitle", "cauthor", "font", "size", "align", "stroke", "shadow"].forEach(function (key) { field(root, key).oninput = function () { draw(root); }; });
    field(root, "color").oninput = function () { state.colorTouched = true; draw(root); };
    root.querySelectorAll("[data-pos]").forEach(function (button) { button.onclick = function () { state.titleY = zoneY(button.dataset.pos); draw(root); }; });
    var canvas = field(root, "canvas");
    canvas.onpointerdown = function (event) { state.drag = true; canvas.setPointerCapture(event.pointerId); };
    canvas.onpointermove = function (event) { if (!state.drag) return; var bounds = canvas.getBoundingClientRect(); state.titleY = Math.max(0.045, Math.min(0.78, (event.clientY - bounds.top) / bounds.height)); draw(root); };
    canvas.onpointerup = canvas.onpointercancel = function () { state.drag = false; };
    field(root, "png").onclick = function () { download(root, "image/png"); };
    field(root, "jpg").onclick = function () { download(root, "image/jpeg"); };
    field(root, "regen").onclick = function () { generate(root); };
    if (window.NexoraNovelCoverPuter) window.NexoraNovelCoverPuter.bind(root, { show: show, status: status, input: basicInput });
    updateDirectionPreview(root);
    mode(root);
  }

  window.renderNovelCoverGenerator = function (root) { root.innerHTML = html(); bind(root); };
  window.NexoraNovelCover = Object.freeze({ wrapTitle: wrapTitle, zoneY: zoneY });
})();
