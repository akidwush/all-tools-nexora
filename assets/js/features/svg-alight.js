/* Nexora SVG -> Alight Motion XML v1.8 integration */
(function () {
  "use strict";

  var MAX_BYTES = 2 * 1024 * 1024;
  var CONVERT_TIMEOUT_MS = 35000;
  var MODES = {
    optimized: {
      label: "AM OPTIMIZED",
      title: "AM Optimized",
      sub: "Layer ringan · z-order aman · stroke native",
      maxShapes: 3000,
      minAreaPercent: 0.0004,
      precision: 4,
      nodeReduction: 38,
      microDetailPercent: 0.0015,
      maxOutputGroups: 320,
      groupByColor: true,
      removeStrokes: false,
      validateBounds: false
    },
    lossless: {
      label: "MAX FIDELITY",
      title: "Maximum Fidelity",
      sub: "Audit kesamaan · z-order asli · clipPath",
      maxShapes: 5000,
      minAreaPercent: 0,
      precision: 8,
      nodeReduction: 0,
      microDetailPercent: 0,
      maxOutputGroups: 1200,
      groupByColor: false,
      removeStrokes: false,
      validateBounds: true
    },
    accurate: {
      label: "ACCURATE · -35%",
      title: "Accurate Grouped",
      sub: "Node -35% · grouping warna presisi",
      maxShapes: 5000,
      minAreaPercent: 0,
      precision: 5,
      nodeReduction: 35,
      microDetailPercent: 0,
      maxOutputGroups: 1200,
      groupByColor: true,
      removeStrokes: true,
      validateBounds: false
    },
    balanced: {
      label: "BALANCED · -50%",
      title: "Balanced Grouped",
      sub: "Node -50% · detail dan ukuran seimbang",
      maxShapes: 2500,
      minAreaPercent: 0.0002,
      precision: 4,
      nodeReduction: 50,
      microDetailPercent: 0,
      maxOutputGroups: 1200,
      groupByColor: true,
      removeStrokes: true,
      validateBounds: false
    },
    lightweight: {
      label: "LIGHT · -65%",
      title: "Lightweight Grouped",
      sub: "Node -65% · prioritas file ringan",
      maxShapes: 1000,
      minAreaPercent: 0.001,
      precision: 3,
      nodeReduction: 65,
      microDetailPercent: 0,
      maxOutputGroups: 1200,
      groupByColor: true,
      removeStrokes: true,
      validateBounds: false
    }
  };

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function safeName(value) {
    return String(value || "nexora-alight")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "nexora-alight";
  }

  function formatBytes(value) {
    var bytes = Number(value) || 0;
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(2) + " MB";
  }

  function download(name, content) {
    var blob = new Blob([content], { type: "application/xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    var input = element("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function analyzeSvg(svg) {
    return {
      shapes: (svg.match(/<(?:path|rect|circle|ellipse|line|polygon|polyline)\b/gi) || []).length,
      paths: (svg.match(/<path\b/gi) || []).length,
      gradients: (svg.match(/<(?:linearGradient|radialGradient)\b/gi) || []).length,
      clips: (svg.match(/<(?:clipPath|mask)\b/gi) || []).length
    };
  }

  function metric(icon, label, value, sub) {
    var item = element("article", "nsa-stat");
    var glyph = element("i", icon);
    var content = element("div");
    content.append(element("span", "", label), element("strong", "", value), element("small", "", sub || ""));
    item.append(glyph, content);
    return item;
  }

  function warningText(value) {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") return String(value.message || value.detail || value.code || "Perbedaan fidelity terdeteksi");
    return String(value || "Peringatan konversi");
  }

  window.renderSvgAlight = function (body) {
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    body.innerHTML = `
      <main class="nsa nsa-v103 nsa-v108">
        <section class="nsa-hero">
          <div class="nsa-gridfx" aria-hidden="true"></div>
          <div class="nsa-copy">
            <div class="nsa-kicker"><i class="fa-solid fa-bezier-curve"></i><span>NEXORA MOTION VECTOR</span><b>ENGINE v1.8</b></div>
            <h2><span>SVG</span><strong>&lt;</strong><em>XML</em></h2>
            <p>Konversi SVG ke XML Alight Motion dengan AM Optimized dan Maximum Fidelity. Geometri, urutan layer, stroke, gradient, CSS, serta clipPath diproses oleh API resmi.</p>
            <div class="nsa-badges">
              <span><i class="fa-solid fa-shield-halved"></i> KEY SERVER-SIDE</span>
              <span><i class="fa-solid fa-layer-group"></i> Z-ORDER SAFE</span>
              <span><i class="fa-solid fa-check-double"></i> FIDELITY AUDIT</span>
              <span><i class="fa-solid fa-mobile-screen"></i> ANDROID SAFE READ</span>
            </div>
          </div>
        </section>

        <section class="nsa-grid">
          <article class="nsa-card">
            <header><div><span>01 · SOURCE</span><h3>SVG Input</h3></div><b id="nsaApiStatus">CHECKING</b></header>
            <label class="nsa-drop" id="nsaDrop" for="nsaFile">
              <input id="nsaFile" type="file" accept="image/svg+xml,.svg">
              <i class="nsa-drop-icon fa-solid fa-cloud-arrow-up"></i>
              <div><strong>Pilih atau jatuhkan SVG</strong><small>Maksimal 2 MB · sumber langsung disimpan di memori</small></div>
              <span>Pilih SVG</span>
            </label>
            <div class="nsa-file" id="nsaFileCard" hidden>
              <div class="nsa-thumb" id="nsaThumb"></div>
              <div><b id="nsaFileName"></b><span id="nsaFileMeta"></span></div>
              <button id="nsaRemove" type="button" aria-label="Hapus SVG"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="nsa-mode-head"><div><span>02 · PROFILE</span><h4>Mode kualitas</h4></div><b id="nsaModeBadge">AM OPTIMIZED</b></div>
            <div class="nsa-modes" id="nsaModes">
              <button type="button" data-quality="optimized"><i class="fa-solid fa-wand-magic-sparkles"></i><span><b>AM Optimized</b><small>Ringan, z-order aman, stroke native</small></span><em>✓</em></button>
              <button type="button" data-quality="lossless"><i class="fa-solid fa-gem"></i><span><b>Maximum Fidelity</b><small>Audit kesamaan dan fitur SVG penuh</small></span><em>✓</em></button>
              <button type="button" data-quality="accurate"><i class="fa-solid fa-crosshairs"></i><span><b>Accurate Grouped</b><small>Reduksi node 35%</small></span><em>✓</em></button>
              <button type="button" data-quality="balanced"><i class="fa-solid fa-scale-balanced"></i><span><b>Balanced Grouped</b><small>Reduksi node 50%</small></span><em>✓</em></button>
              <button type="button" data-quality="lightweight"><i class="fa-solid fa-feather"></i><span><b>Lightweight Grouped</b><small>Reduksi node 65%</small></span><em>✓</em></button>
            </div>

            <details class="nsa-advanced">
              <summary><span>Pengaturan lanjutan</span><small id="nsaAdvancedSummary">AM Optimized · dapat dituning</small></summary>
              <div class="nsa-advanced-grid">
                <label><span>Maks. shape sumber</span><input id="nsaMaxShapes" type="number" min="1" max="5000"></label>
                <label><span>Buang detail di bawah (%)</span><input id="nsaMinArea" type="number" min="0" max="5" step="0.0001"></label>
                <label><span>Kurangi node (%)</span><input id="nsaNodeReduction" type="number" min="0" max="80" step="1"></label>
                <label><span>Presisi koordinat</span><select id="nsaPrecision"><option value="3">3 desimal</option><option value="4">4 desimal</option><option value="5">5 desimal</option><option value="6">6 desimal</option><option value="8">8 desimal</option></select></label>
                <label><span>Detail mikro di bawah (%)</span><input id="nsaMicroDetail" type="number" min="0" max="0.25" step="0.0001"></label>
                <label><span>Maks. layer output</span><input id="nsaMaxGroups" type="number" min="20" max="1200" step="10"></label>
              </div>
              <p id="nsaProfileNote">AM Optimized membuang detail mikro dan menggabungkan warna hanya ketika urutan layer tetap aman.</p>
            </details>

            <button class="nsa-run" id="nsaRun" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Konversi ke Alight XML</span><b>→</b></button>
            <div class="nsa-progress"><span id="nsaProgressLabel">Pilih SVG untuk memulai</span><i><b id="nsaProgressBar"></b></i></div>
          </article>

          <article class="nsa-card nsa-output">
            <header><div><span>03 · OUTPUT</span><h3>Alight Motion XML</h3></div><b id="nsaReady" class="idle">WAITING</b></header>
            <div class="nsa-empty" id="nsaEmpty"><i class="fa-solid fa-code"></i><b>Belum ada XML</b><span>Statistik engine dan audit fidelity akan tampil di sini.</span></div>
            <div class="nsa-stats" id="nsaStats" hidden></div>
            <div class="nsa-warnings" id="nsaWarnings" hidden></div>
            <pre id="nsaCode" hidden></pre>
            <div class="nsa-actions" id="nsaActions" hidden><button id="nsaCopy" type="button"><i class="fa-regular fa-copy"></i> Salin XML</button><button id="nsaDownload" type="button"><i class="fa-solid fa-download"></i> Download XML</button></div>
          </article>
        </section>
        <div class="nsa-toast" id="nsaToast" role="status" aria-live="polite"></div>
      </main>`;

    var root = body.querySelector(".nsa");
    var fileInput = root.querySelector("#nsaFile");
    var drop = root.querySelector("#nsaDrop");
    var fileCard = root.querySelector("#nsaFileCard");
    var thumb = root.querySelector("#nsaThumb");
    var fileName = root.querySelector("#nsaFileName");
    var fileMeta = root.querySelector("#nsaFileMeta");
    var modes = root.querySelector("#nsaModes");
    var modeBadge = root.querySelector("#nsaModeBadge");
    var profileNote = root.querySelector("#nsaProfileNote");
    var run = root.querySelector("#nsaRun");
    var status = root.querySelector("#nsaApiStatus");
    var ready = root.querySelector("#nsaReady");
    var progressBar = root.querySelector("#nsaProgressBar");
    var progressLabel = root.querySelector("#nsaProgressLabel");
    var empty = root.querySelector("#nsaEmpty");
    var stats = root.querySelector("#nsaStats");
    var warnings = root.querySelector("#nsaWarnings");
    var code = root.querySelector("#nsaCode");
    var actions = root.querySelector("#nsaActions");
    var toast = root.querySelector("#nsaToast");
    var controls = {
      maxShapes: root.querySelector("#nsaMaxShapes"),
      minAreaPercent: root.querySelector("#nsaMinArea"),
      nodeReduction: root.querySelector("#nsaNodeReduction"),
      precision: root.querySelector("#nsaPrecision"),
      microDetailPercent: root.querySelector("#nsaMicroDetail"),
      maxOutputGroups: root.querySelector("#nsaMaxGroups")
    };
    var state = { file: null, svg: "", xml: "", quality: "optimized", url: "", busy: false, controller: null, destroyed: false };

    function notify(message, type) {
      toast.textContent = message;
      toast.className = "nsa-toast show " + (type || "");
      clearTimeout(toast._timer);
      toast._timer = setTimeout(function () { toast.className = "nsa-toast"; }, 3400);
    }

    function clearPreviewUrl() {
      if (state.url) URL.revokeObjectURL(state.url);
      state.url = "";
    }

    function resetOutput() {
      state.xml = "";
      code.textContent = "";
      code.hidden = true;
      actions.hidden = true;
      stats.hidden = true;
      warnings.hidden = true;
      warnings.textContent = "";
      empty.hidden = false;
    }

    function setBusy(value) {
      state.busy = value;
      run.disabled = value || !state.svg;
      fileInput.disabled = value;
      modes.querySelectorAll("button").forEach(function (button) { button.disabled = value; });
    }

    function applyMode(quality) {
      if (state.busy) return;
      var profile = MODES[quality] || MODES.optimized;
      state.quality = quality in MODES ? quality : "optimized";
      Object.keys(controls).forEach(function (key) { controls[key].value = profile[key]; });
      var lossless = state.quality === "lossless";
      var optimized = state.quality === "optimized";
      controls.maxShapes.disabled = lossless;
      controls.minAreaPercent.disabled = lossless;
      controls.nodeReduction.disabled = lossless;
      controls.precision.disabled = lossless;
      controls.microDetailPercent.disabled = !optimized;
      controls.maxOutputGroups.disabled = !optimized;
      modeBadge.textContent = profile.label;
      root.querySelector("#nsaAdvancedSummary").textContent = lossless ? "Dikunci oleh Maximum Fidelity" : optimized ? "AM Optimized · dapat dituning" : "Node -" + profile.nodeReduction + "% · dapat dituning";
      profileNote.textContent = lossless
        ? "Maximum Fidelity mengunci reduksi 0%, presisi 8, grouping OFF, stroke native ON, clipPath mask ON, dan audit kesamaan aktif."
        : optimized
          ? "AM Optimized membuang detail mikro dan melakukan safe color merge tanpa merusak z-order."
          : "Grouped mode memprioritaskan pengurangan node dan ukuran XML; stroke dapat diubah menjadi shape hasil grouping.";
      modes.querySelectorAll("button[data-quality]").forEach(function (button) {
        var active = button.dataset.quality === state.quality;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function setFile(file) {
      if (!file || file.size <= 0 || file.size > MAX_BYTES || (!/\.svg$/i.test(file.name) && file.type !== "image/svg+xml")) {
        notify(file && file.size > MAX_BYTES ? "SVG melebihi 2 MB." : "Pilih file SVG yang valid.", "err");
        return;
      }
      progressLabel.textContent = "Membaca SVG ke memori…";
      run.disabled = true;
      var reader = new FileReader();
      reader.onload = function () {
        if (state.destroyed) return;
        var source = String(reader.result || "");
        if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(source)) {
          notify("Isi file bukan dokumen SVG yang valid.", "err");
          progressLabel.textContent = "File SVG tidak valid";
          return;
        }
        state.file = file;
        state.svg = source;
        clearPreviewUrl();
        resetOutput();
        state.url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
        var image = element("img");
        image.src = state.url;
        image.alt = "Preview SVG " + file.name;
        image.onerror = function () { thumb.replaceChildren(element("div", "nsa-thumb-fallback", "SVG")); };
        thumb.replaceChildren(image);
        var info = analyzeSvg(source);
        fileName.textContent = file.name;
        fileMeta.textContent = formatBytes(file.size) + " · " + info.shapes + " shape · " + info.gradients + " gradient · " + info.clips + " clip/mask";
        fileCard.hidden = false;
        drop.classList.add("has-file");
        ready.className = "idle";
        ready.textContent = "READY";
        progressLabel.textContent = "SVG siap · sumber tersimpan aman di memori";
        run.disabled = false;
      };
      reader.onerror = function () {
        notify("File gagal dibaca. Pilih ulang SVG.", "err");
        progressLabel.textContent = "Gagal membaca SVG";
      };
      reader.onabort = reader.onerror;
      reader.readAsText(file);
    }

    function clearFile() {
      if (state.controller) state.controller.abort();
      state.file = null;
      state.svg = "";
      fileInput.value = "";
      clearPreviewUrl();
      resetOutput();
      fileCard.hidden = true;
      drop.classList.remove("has-file");
      ready.className = "idle";
      ready.textContent = "WAITING";
      progressLabel.textContent = "Pilih SVG untuk memulai";
      progressBar.style.width = "0%";
      run.disabled = true;
    }

    function currentOptions() {
      var profile = MODES[state.quality] || MODES.optimized;
      return {
        title: safeName(state.file && state.file.name),
        quality: state.quality,
        maxShapes: Number(controls.maxShapes.value),
        minAreaPercent: Number(controls.minAreaPercent.value),
        precision: Number(controls.precision.value),
        nodeReduction: Number(controls.nodeReduction.value),
        microDetailPercent: Number(controls.microDetailPercent.value),
        maxOutputGroups: Number(controls.maxOutputGroups.value),
        groupByColor: profile.groupByColor,
        removeStrokes: profile.removeStrokes,
        validateBounds: profile.validateBounds
      };
    }

    async function health() {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 7000);
      try {
        var response = await fetch("/api/svg-alight?verify=1", { cache: "no-store", signal: controller.signal });
        var data = await response.json();
        if (response.ok && data.configured && data.authorized) {
          status.className = "ok";
          status.innerHTML = '<i class="fa-solid fa-key"></i> API AUTH OK';
          status.title = "API key SVG→XML telah diverifikasi oleh endpoint /api/v1/auth.";
        } else if (data.configured) {
          status.className = "err";
          status.innerHTML = '<i class="fa-solid fa-key"></i> KEY DITOLAK';
          status.title = data.message || "API key belum lolos verifikasi provider.";
        } else {
          status.className = "warn";
          status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> KEY BELUM ADA';
          status.title = "Atur API key SVG→XML pada environment server/Vercel.";
        }
      } catch (error) {
        status.className = "warn";
        status.textContent = "API OFFLINE";
        status.title = error && error.message ? error.message : "Health check gagal.";
      } finally {
        clearTimeout(timer);
      }
    }

    function renderResult(data, options) {
      var profile = data.profile && data.profile.quality ? data.profile.quality : state.quality;
      var details = data.stats || {};
      var before = Number(details.nodesBefore || 0);
      var after = Number(details.nodesAfter || 0);
      var outputBytes = Number(details.outputBytes || new TextEncoder().encode(state.xml).byteLength);
      var rows = [];
      if (profile === "lossless") {
        var losses = data.fidelity && Array.isArray(data.fidelity.losses) ? data.fidelity.losses : [];
        rows = [
          metric("fa-solid fa-shapes", "Shape output", details.outputShapes ?? 0, "source order"),
          metric("fa-solid fa-diagram-project", "Nodes", before + " → " + after, "0% reduction"),
          metric("fa-solid fa-pen-nib", "Stroke native", details.strokes ?? 0, "dipertahankan"),
          metric("fa-solid fa-crop-simple", "clipPath mask", details.clipPathsApplied ?? 0, "diterapkan"),
          metric("fa-solid fa-check-double", "Audit fidelity", data.fidelity && data.fidelity.exact === true ? "Tanpa loss" : losses.length + " loss", "hasil engine"),
          metric("fa-solid fa-file-code", "XML", formatBytes(outputBytes), "Alight output")
        ];
      } else if (profile === "optimized") {
        rows = [
          metric("fa-solid fa-layer-group", "Layer output", details.outputShapes ?? 0, "maks. " + options.maxOutputGroups),
          metric("fa-solid fa-object-group", "Safe merge", details.safeColorMerges ?? 0, "z-order aman"),
          metric("fa-solid fa-eraser", "Detail mikro", details.microSubpathsRemoved ?? 0, "dibuang"),
          metric("fa-solid fa-diagram-project", "Nodes", before + " → " + after, "reduced " + Math.max(0, before - after)),
          metric("fa-solid fa-shield", "Z-order barrier", details.zOrderBarriers ?? 0, "terdeteksi"),
          metric("fa-solid fa-file-code", "XML", formatBytes(outputBytes), "Alight output")
        ];
      } else {
        rows = [
          metric("fa-solid fa-palette", "Group warna", details.colorGroups ?? details.outputShapes ?? 0, "grouped"),
          metric("fa-solid fa-object-group", "Shape digabung", details.mergedShapes ?? 0, "engine result"),
          metric("fa-solid fa-diagram-project", "Nodes", before + " → " + after, "target -" + options.nodeReduction + "%"),
          metric("fa-solid fa-pen-nib", "Stroke dihapus", details.strokesRemoved ?? 0, "grouped mode"),
          metric("fa-solid fa-file-code", "XML", formatBytes(outputBytes), "Alight output")
        ];
      }
      stats.replaceChildren.apply(stats, rows);
      stats.hidden = false;

      var warningRows = Array.isArray(data.warnings) ? data.warnings.map(warningText) : [];
      if (profile === "lossless" && data.fidelity) {
        var fidelityLosses = Array.isArray(data.fidelity.losses) ? data.fidelity.losses.map(warningText) : [];
        if (data.fidelity.exact === true) warningRows.unshift("✓ Audit fidelity: tidak ada kehilangan fitur yang diketahui.");
        else warningRows.unshift("Audit fidelity menemukan " + fidelityLosses.length + " perbedaan.");
        warningRows = warningRows.concat(fidelityLosses);
      }
      warnings.textContent = warningRows.map(function (row) { return row.charAt(0) === "✓" ? row : "⚠ " + row; }).join("\n");
      warnings.hidden = warningRows.length === 0;
      code.textContent = state.xml;
      code.hidden = false;
      actions.hidden = false;
      empty.hidden = true;
    }

    async function convert() {
      if (!state.svg || state.busy) return;
      state.controller = new AbortController();
      var timeout = setTimeout(function () { if (state.controller) state.controller.abort(); }, CONVERT_TIMEOUT_MS);
      setBusy(true);
      ready.className = "idle";
      ready.textContent = "WORKING";
      progressBar.style.width = "14%";
      progressLabel.textContent = "Mengirim SVG ke engine resmi…";
      try {
        var options = currentOptions();
        var response = await fetch("/api/svg-alight", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ svg: state.svg, options: options }),
          signal: state.controller.signal
        });
        progressBar.style.width = "72%";
        progressLabel.textContent = "Menyusun " + MODES[state.quality].title + "…";
        var raw = await response.text();
        var data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (_) {}
        if (!response.ok || !data.ok) throw new Error(data.message || data.error || ("HTTP " + response.status));
        state.xml = String(data.xml || "");
        if (!state.xml.trim().startsWith("<")) throw new Error("API tidak mengembalikan XML yang valid.");
        progressBar.style.width = "100%";
        progressLabel.textContent = "Selesai · " + MODES[state.quality].title;
        ready.className = "ok";
        ready.textContent = "XML READY";
        renderResult(data, options);
        notify(MODES[state.quality].title + " selesai.", "ok");
      } catch (error) {
        ready.className = "err";
        ready.textContent = "FAILED";
        var message = error && error.name === "AbortError"
          ? "Konversi melewati batas waktu 35 detik. Coba file lebih sederhana."
          : (error && error.message ? error.message : "Konversi gagal.");
        progressLabel.textContent = message;
        notify(message, "err");
      } finally {
        clearTimeout(timeout);
        state.controller = null;
        setTimeout(function () {
          if (state.destroyed) return;
          setBusy(false);
          progressBar.style.width = "0%";
        }, 350);
      }
    }

    fileInput.addEventListener("change", function () { if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]); });
    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (event) {
        event.preventDefault();
        drop.classList.remove("drag");
        if (name === "drop" && event.dataTransfer && event.dataTransfer.files[0]) setFile(event.dataTransfer.files[0]);
      });
    });
    modes.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-quality]");
      if (button) applyMode(button.dataset.quality);
    });
    root.querySelector("#nsaRemove").addEventListener("click", clearFile);
    run.addEventListener("click", convert);
    root.querySelector("#nsaCopy").addEventListener("click", function () {
      if (!state.xml) return;
      copyText(state.xml).then(function () { notify("XML disalin.", "ok"); }).catch(function () { notify("Clipboard ditolak browser.", "err"); });
    });
    root.querySelector("#nsaDownload").addEventListener("click", function () {
      if (state.xml) download(safeName(state.file && state.file.name) + "-alight.xml", state.xml);
    });

    applyMode("optimized");
    health();
    body.__nxCleanup = function () {
      state.destroyed = true;
      if (state.controller) state.controller.abort();
      clearPreviewUrl();
      clearTimeout(toast._timer);
    };
  };
})();
