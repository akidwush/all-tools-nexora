/* Nexora Auto PDF */
(function () {
  "use strict";

  var MAX_SECTIONS = 5;
  var requestSequence = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function wordCount(value) {
    var clean = String(value || "").trim();
    return clean ? clean.split(/\s+/u).length : 0;
  }

  function numberFormat(value) {
    try { return new Intl.NumberFormat("id-ID").format(value); }
    catch { return String(value); }
  }

  function safeFilename(value) {
    return String(value || "nexora-document").trim()
      .replace(/\.pdf$/i, "")
      .normalize("NFKD")
      .replace(/[^a-z0-9 _-]+/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 64) || "nexora-document";
  }

  function renderTextToPdf(root) {
    if (!root) return;
    if (typeof root.__napCleanup === "function") root.__napCleanup();

    var sections = [{ id: "nap-section-1", title: "BAB 1", content: "" }];
    var settings = {
      paperSize: "A5",
      fontFamily: "Helvetica",
      fontSize: 11,
      lineHeight: 1.5,
      margin: 42,
      startEachSectionOnNewPage: true
    };
    var pdfUrl = "";
    var pdfBlob = null;
    var renderedSignature = "";
    var busy = false;

    root.innerHTML = `
      <main class="nap" aria-label="Nexora Auto PDF">
        <header class="nap-hero">
          <div>
            <span class="nap-kicker"><i class="fa-solid fa-file-pdf"></i> NEXORA DOCUMENT ENGINE</span>
            <h2>Teks panjang menjadi PDF rapi.</h2>
            <p>Tempel tulisan tanpa membagi jumlah kata. Paragraf dan dialog mengalir otomatis ke halaman berikutnya dalam layout A5.</p>
          </div>
          <div class="nap-hero-meta" aria-label="Informasi fitur">
            <span><i class="fa-solid fa-shield-halved"></i> API key aman di server</span>
            <span><i class="fa-solid fa-layer-group"></i> Maksimal 5 bagian</span>
          </div>
        </header>

        <div class="nap-layout">
          <section class="nap-editor" aria-label="Editor dokumen">
            <div class="nap-panel-head">
              <div><span>01 · EDITOR</span><h3>Isi dokumen</h3></div>
              <button id="napReset" class="nap-quiet" type="button"><i class="fa-solid fa-rotate-left"></i> Reset</button>
            </div>

            <details class="nap-format">
              <summary><span><i class="fa-solid fa-sliders"></i> Pengaturan format</span><i class="fa-solid fa-chevron-down"></i></summary>
              <div class="nap-format-grid">
                <div class="nap-field nap-choice-field">
                  <span class="nap-field-label">Ukuran kertas</span>
                  <div class="nap-select" data-nap-select="napPaper">
                    <select id="napPaper" class="nap-native-select" aria-hidden="true" tabindex="-1">
                      <option value="A5">A5</option>
                      <option value="A4">A4</option>
                    </select>
                    <button id="napPaperTrigger" class="nap-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="napPaperMenu">
                      <span data-nap-selected>A5</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                    </button>
                    <div id="napPaperMenu" class="nap-select-menu" role="listbox" aria-label="Ukuran kertas" hidden>
                      <button class="nap-select-option" type="button" role="option" aria-selected="true" data-value="A5" data-label="A5" data-description="Ringkas · cocok untuk novel">
                        <span class="nap-select-dot" aria-hidden="true"></span><span><strong>A5</strong><small>Ringkas · cocok untuk novel</small></span>
                      </button>
                      <button class="nap-select-option" type="button" role="option" aria-selected="false" data-value="A4" data-label="A4" data-description="Standar · ruang lebih luas">
                        <span class="nap-select-dot" aria-hidden="true"></span><span><strong>A4</strong><small>Standar · ruang lebih luas</small></span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="nap-field nap-choice-field">
                  <span class="nap-field-label">Font PDF</span>
                  <div class="nap-select nap-select--font" data-nap-select="napFont">
                    <select id="napFont" class="nap-native-select" aria-hidden="true" tabindex="-1">
                      <option value="Helvetica">Helvetica</option>
                      <option value="Times-Roman">Times Roman</option>
                    </select>
                    <button id="napFontTrigger" class="nap-select-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="napFontMenu">
                      <span data-nap-selected>Helvetica</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                    </button>
                    <div id="napFontMenu" class="nap-select-menu" role="listbox" aria-label="Font PDF" hidden>
                      <button class="nap-select-option" type="button" role="option" aria-selected="true" data-value="Helvetica" data-label="Helvetica" data-description="Bersih dan modern">
                        <span class="nap-select-dot" aria-hidden="true"></span><span><strong>Helvetica</strong><small>Bersih dan modern</small></span>
                      </button>
                      <button class="nap-select-option" type="button" role="option" aria-selected="false" data-value="Times-Roman" data-label="Times Roman" data-description="Klasik dan formal">
                        <span class="nap-select-dot" aria-hidden="true"></span><span><strong>Times Roman</strong><small>Klasik dan formal</small></span>
                      </button>
                    </div>
                  </div>
                </div>
                <label>Ukuran font<input id="napFontSize" type="number" min="8" max="18" value="11"></label>
                <label>Jarak baris<input id="napLineHeight" type="number" min="1.1" max="2.2" step="0.1" value="1.5"></label>
                <label>Margin (pt)<input id="napMargin" type="number" min="20" max="90" value="42"></label>
                <label class="nap-check"><input id="napNewPage" type="checkbox" checked><span>Mulai setiap bagian di halaman baru</span></label>
              </div>
            </details>

            <div id="napSections" class="nap-sections"></div>
            <button id="napAdd" class="nap-add" type="button"><i class="fa-solid fa-plus"></i> Tambah bagian</button>
          </section>

          <aside class="nap-result" aria-label="Hasil PDF">
            <div class="nap-panel-head nap-result-head">
              <div><span>02 · HASIL PDF</span><h3>Preview dokumen</h3></div>
              <b id="napState">SIAP</b>
            </div>
            <div class="nap-stats"><span><i class="fa-solid fa-align-left"></i> <b id="napWords">0</b> kata</span><span><i class="fa-regular fa-file"></i> <b id="napPages">—</b> halaman</span></div>
            <div id="napPreview" class="nap-preview">
              <div class="nap-empty"><i class="fa-regular fa-file-pdf"></i><strong>Belum ada preview</strong><p>Isi dokumen lalu tekan “Buat Preview”.</p></div>
            </div>
            <label class="nap-filename">Nama file<input id="napFilename" value="nexora-document" maxlength="64" autocomplete="off"></label>
            <div id="napMessage" class="nap-message" role="status" aria-live="polite"></div>
            <div class="nap-actions">
              <button id="napGenerate" class="nap-preview-button" type="button"><i class="fa-regular fa-file-lines"></i><span>Buat Preview</span></button>
              <button id="napDownload" class="nap-download-button" type="button"><i class="fa-solid fa-download"></i><span>Unduh PDF</span></button>
            </div>
            <p class="nap-privacy"><i class="fa-solid fa-circle-check"></i> File diteruskan sebagai binary PDF dan tidak disimpan oleh Nexora.</p>
          </aside>
        </div>
      </main>`;

    var sectionRoot = root.querySelector("#napSections");
    var addButton = root.querySelector("#napAdd");
    var stateBadge = root.querySelector("#napState");
    var wordsNode = root.querySelector("#napWords");
    var pagesNode = root.querySelector("#napPages");
    var previewNode = root.querySelector("#napPreview");
    var messageNode = root.querySelector("#napMessage");
    var generateButton = root.querySelector("#napGenerate");
    var downloadButton = root.querySelector("#napDownload");
    var filenameInput = root.querySelector("#napFilename");
    var customSelectCleanups = [];
    var customSelectSync = {};

    function closeCustomSelect(wrapper, restoreFocus) {
      if (!wrapper) return;
      var trigger = wrapper.querySelector(".nap-select-trigger");
      var menu = wrapper.querySelector(".nap-select-menu");
      wrapper.classList.remove("is-open");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (menu) menu.hidden = true;
      if (restoreFocus && trigger) trigger.focus({ preventScroll: true });
    }

    function closeAllCustomSelects(except) {
      root.querySelectorAll(".nap-select.is-open").forEach(function (wrapper) {
        if (wrapper !== except) closeCustomSelect(wrapper, false);
      });
    }

    function setupCustomSelect(selectId) {
      var select = root.querySelector("#" + selectId);
      var wrapper = root.querySelector('[data-nap-select="' + selectId + '"]');
      if (!select || !wrapper) return function () {};
      var trigger = wrapper.querySelector(".nap-select-trigger");
      var selectedLabel = wrapper.querySelector("[data-nap-selected]");
      var menu = wrapper.querySelector(".nap-select-menu");
      var options = Array.from(wrapper.querySelectorAll(".nap-select-option"));

      function sync() {
        var option = options.find(function (item) { return item.dataset.value === select.value; }) || options[0];
        if (!option) return;
        if (selectedLabel) selectedLabel.textContent = option.dataset.label || option.textContent.trim();
        options.forEach(function (item) {
          var active = item === option;
          item.setAttribute("aria-selected", active ? "true" : "false");
          item.classList.toggle("is-selected", active);
        });
      }

      function openMenu(focusTarget) {
        closeAllCustomSelects(wrapper);
        wrapper.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        menu.hidden = false;
        if (focusTarget) {
          var selected = options.find(function (item) { return item.getAttribute("aria-selected") === "true"; });
          var target = focusTarget === "last" ? options[options.length - 1] : selected || options[0];
          requestAnimationFrame(function () { target?.focus({ preventScroll: true }); });
        }
      }

      function choose(option) {
        if (!option || !option.dataset.value) return;
        select.value = option.dataset.value;
        sync();
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeCustomSelect(wrapper, true);
      }

      function onTriggerClick() {
        if (wrapper.classList.contains("is-open")) closeCustomSelect(wrapper, false);
        else openMenu(false);
      }

      function onTriggerKeydown(event) {
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMenu("selected");
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          openMenu("last");
        } else if (event.key === "Escape") {
          closeCustomSelect(wrapper, false);
        }
      }

      function onMenuClick(event) {
        var option = event.target.closest(".nap-select-option");
        if (option) choose(option);
      }

      function onMenuKeydown(event) {
        var current = event.target.closest(".nap-select-option");
        if (!current) return;
        var index = options.indexOf(current);
        if (event.key === "Escape") {
          event.preventDefault();
          closeCustomSelect(wrapper, true);
          return;
        }
        if (event.key === "Home" || event.key === "End" || event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          var nextIndex = index;
          if (event.key === "Home") nextIndex = 0;
          if (event.key === "End") nextIndex = options.length - 1;
          if (event.key === "ArrowDown") nextIndex = (index + 1) % options.length;
          if (event.key === "ArrowUp") nextIndex = (index - 1 + options.length) % options.length;
          options[nextIndex]?.focus({ preventScroll: true });
        }
      }

      trigger.addEventListener("click", onTriggerClick);
      trigger.addEventListener("keydown", onTriggerKeydown);
      menu.addEventListener("click", onMenuClick);
      menu.addEventListener("keydown", onMenuKeydown);
      select.addEventListener("change", sync);
      customSelectSync[selectId] = sync;
      sync();

      return function () {
        trigger.removeEventListener("click", onTriggerClick);
        trigger.removeEventListener("keydown", onTriggerKeydown);
        menu.removeEventListener("click", onMenuClick);
        menu.removeEventListener("keydown", onMenuKeydown);
        select.removeEventListener("change", sync);
      };
    }

    customSelectCleanups.push(setupCustomSelect("napPaper"));
    customSelectCleanups.push(setupCustomSelect("napFont"));

    function handleCustomSelectOutside(event) {
      if (!root.contains(event.target) || !event.target.closest(".nap-select")) closeAllCustomSelects(null);
    }
    document.addEventListener("pointerdown", handleCustomSelectOutside);

    function signature() {
      return JSON.stringify({ sections: sections.map(function (section) { return { title: section.title.trim(), content: section.content.trim() }; }), settings: settings });
    }

    function totalWords() {
      return sections.reduce(function (total, section) { return total + wordCount(section.content); }, 0);
    }

    function setMessage(message, isError) {
      messageNode.textContent = message || "";
      messageNode.classList.toggle("is-error", Boolean(isError));
    }

    function setDirty() {
      wordsNode.textContent = numberFormat(totalWords());
      var stale = Boolean(pdfUrl && renderedSignature !== signature());
      stateBadge.textContent = stale ? "PERLU DIPERBARUI" : pdfUrl ? "SELESAI" : "SIAP";
      stateBadge.className = stale ? "is-warning" : pdfUrl ? "is-ready" : "";
      generateButton.querySelector("span").textContent = stale ? "Perbarui Preview" : "Buat Preview";
    }

    function sectionMarkup(section, index) {
      return `<article class="nap-section" data-section-id="${escapeHtml(section.id)}">
        <header><span>${index + 1}</span><strong>Bagian ${index + 1}</strong><em>${numberFormat(wordCount(section.content))} kata</em>${sections.length > 1 ? '<button type="button" data-remove aria-label="Hapus bagian ' + (index + 1) + '"><i class="fa-solid fa-trash-can"></i></button>' : ""}</header>
        <div><input data-field="title" maxlength="180" value="${escapeHtml(section.title)}" placeholder="Judul bagian, misalnya BAB ${index + 1}" aria-label="Judul bagian ${index + 1}">
        <textarea data-field="content" maxlength="80000" placeholder="Tempel teks di sini…&#10;&#10;Paragraf berikutnya akan tetap terpisah.&#10;&#10;&quot;Dialog juga dipertahankan.&quot;" aria-label="Isi bagian ${index + 1}" spellcheck="true">${escapeHtml(section.content)}</textarea></div>
      </article>`;
    }

    function renderSections() {
      sectionRoot.innerHTML = sections.map(sectionMarkup).join("");
      addButton.disabled = sections.length >= MAX_SECTIONS;
      addButton.innerHTML = sections.length >= MAX_SECTIONS ? '<i class="fa-solid fa-check"></i> Maksimal 5 bagian' : '<i class="fa-solid fa-plus"></i> Tambah bagian';
      setDirty();
    }

    function setBusy(nextBusy, label) {
      busy = nextBusy;
      generateButton.disabled = nextBusy;
      downloadButton.disabled = nextBusy;
      addButton.disabled = nextBusy || sections.length >= MAX_SECTIONS;
      stateBadge.className = nextBusy ? "is-working" : stateBadge.className;
      stateBadge.textContent = nextBusy ? "MEMPROSES" : stateBadge.textContent;
      generateButton.querySelector("i").className = nextBusy ? "fa-solid fa-circle-notch fa-spin" : "fa-regular fa-file-lines";
      generateButton.querySelector("span").textContent = nextBusy ? (label || "Menyusun PDF…") : "Buat Preview";
      if (!nextBusy) setDirty();
    }

    function releasePdf() {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      pdfUrl = "";
      pdfBlob = null;
      renderedSignature = "";
      pagesNode.textContent = "—";
    }

    function showPreview(url, pages) {
      previewNode.innerHTML = `<iframe src="${escapeHtml(url)}#toolbar=0&navpanes=0&view=FitH" title="Preview Nexora Auto PDF"></iframe>
        <div class="nap-mobile-preview"><i class="fa-regular fa-file-pdf"></i><strong>PDF siap dibuka</strong><p>${escapeHtml(pages)} halaman · preview final</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Buka Preview PDF</a></div>`;
    }

    async function responseError(response) {
      try {
        var payload = await response.json();
        return payload.message || "PDF gagal dibuat.";
      } catch { return "PDF gagal dibuat. Coba lagi."; }
    }

    async function generatePdf(downloadAfter) {
      if (busy) return;
      var hasContent = sections.some(function (section) { return section.title.trim() || section.content.trim(); });
      if (!hasContent) {
        setMessage("Masukkan judul atau isi dokumen terlebih dahulu.", true);
        sectionRoot.querySelector("textarea")?.focus();
        return;
      }

      var currentSignature = signature();
      if (pdfBlob && renderedSignature === currentSignature) {
        if (downloadAfter) downloadCurrent();
        return;
      }

      var sequence = ++requestSequence;
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 90_000);
      setMessage("Paragraf sedang dibungkus dan dibagi ke halaman…", false);
      setBusy(true, downloadAfter ? "Menyiapkan unduhan…" : "Menyusun PDF…");
      try {
        var response = await fetch("/api/tools/text-to-pdf", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/pdf" },
          body: JSON.stringify({
            sections: sections.map(function (section) { return { title: section.title, content: section.content }; }),
            settings: settings,
            filename: safeFilename(filenameInput.value)
          })
        });
        if (!response.ok) throw new Error(await responseError(response));
        var contentType = String(response.headers.get("content-type") || "");
        if (!contentType.includes("application/pdf")) throw new Error("Server tidak mengembalikan file PDF yang valid.");
        var blob = await response.blob();
        if (sequence !== requestSequence) return;
        releasePdf();
        pdfBlob = blob;
        pdfUrl = URL.createObjectURL(blob);
        renderedSignature = currentSignature;
        var pageHeader = String(response.headers.get("x-pdf-pages") || "");
        var pageCount = /^\d+$/.test(pageHeader) ? pageHeader : "?";
        pagesNode.textContent = pageCount;
        showPreview(pdfUrl, pageCount);
        setMessage("PDF berhasil dibuat. Preview dan unduhan sudah siap.", false);
        if (downloadAfter) downloadCurrent();
      } catch (error) {
        var message = error && error.name === "AbortError" ? "Pembuatan PDF terlalu lama. Coba lagi." : (error.message || "PDF gagal dibuat.");
        setMessage(message, true);
      } finally {
        clearTimeout(timer);
        if (sequence === requestSequence) setBusy(false);
      }
    }

    function downloadCurrent() {
      if (!pdfUrl || !pdfBlob) return;
      var link = document.createElement("a");
      link.href = pdfUrl;
      link.download = safeFilename(filenameInput.value) + ".pdf";
      link.dataset.historyRecorded = "1";
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (typeof window.recordDownload === "function") window.recordDownload("Nexora Auto PDF", "PDF", pdfUrl, link.download, link.download);
      setMessage("Unduhan PDF dimulai.", false);
    }

    sectionRoot.addEventListener("input", function (event) {
      var field = event.target.closest("[data-field]");
      var card = event.target.closest("[data-section-id]");
      if (!field || !card) return;
      var section = sections.find(function (item) { return item.id === card.dataset.sectionId; });
      if (!section) return;
      section[field.dataset.field] = field.value;
      var counter = card.querySelector("header em");
      if (counter) counter.textContent = numberFormat(wordCount(section.content)) + " kata";
      setDirty();
    });

    sectionRoot.addEventListener("click", function (event) {
      var remove = event.target.closest("[data-remove]");
      var card = event.target.closest("[data-section-id]");
      if (!remove || !card || sections.length === 1) return;
      sections = sections.filter(function (section) { return section.id !== card.dataset.sectionId; });
      renderSections();
    });

    addButton.addEventListener("click", function () {
      if (sections.length >= MAX_SECTIONS) return;
      sections.push({ id: "nap-section-" + Date.now(), title: "BAB " + (sections.length + 1), content: "" });
      renderSections();
      sectionRoot.lastElementChild?.querySelector("input")?.focus();
    });

    root.querySelector("#napReset").addEventListener("click", function () {
      requestSequence++;
      releasePdf();
      sections = [{ id: "nap-section-" + Date.now(), title: "BAB 1", content: "" }];
      settings = { paperSize: "A5", fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.5, margin: 42, startEachSectionOnNewPage: true };
      root.querySelector("#napPaper").value = settings.paperSize;
      root.querySelector("#napFont").value = settings.fontFamily;
      customSelectSync.napPaper?.();
      customSelectSync.napFont?.();
      root.querySelector("#napFontSize").value = settings.fontSize;
      root.querySelector("#napLineHeight").value = settings.lineHeight;
      root.querySelector("#napMargin").value = settings.margin;
      root.querySelector("#napNewPage").checked = true;
      filenameInput.value = "nexora-document";
      previewNode.innerHTML = '<div class="nap-empty"><i class="fa-regular fa-file-pdf"></i><strong>Belum ada preview</strong><p>Isi dokumen lalu tekan “Buat Preview”.</p></div>';
      setMessage("Editor dikosongkan.", false);
      renderSections();
    });

    [
      ["#napPaper", "paperSize", String], ["#napFont", "fontFamily", String],
      ["#napFontSize", "fontSize", Number], ["#napLineHeight", "lineHeight", Number], ["#napMargin", "margin", Number]
    ].forEach(function (binding) {
      root.querySelector(binding[0]).addEventListener("change", function (event) {
        settings[binding[1]] = binding[2](event.target.value);
        setDirty();
      });
    });
    root.querySelector("#napNewPage").addEventListener("change", function (event) { settings.startEachSectionOnNewPage = event.target.checked; setDirty(); });
    generateButton.addEventListener("click", function () { generatePdf(false); });
    downloadButton.addEventListener("click", function () { generatePdf(true); });
    filenameInput.addEventListener("change", function () { filenameInput.value = safeFilename(filenameInput.value); });

    root.__napCleanup = function () {
      requestSequence++;
      document.removeEventListener("pointerdown", handleCustomSelectOutside);
      customSelectCleanups.forEach(function (cleanup) { cleanup(); });
      releasePdf();
    };
    renderSections();
  }

  window.renderTextToPdf = renderTextToPdf;
})();
