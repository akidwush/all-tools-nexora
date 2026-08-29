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
      fontFamily: "Comic Neue",
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
                <label>Ukuran kertas<select id="napPaper"><option value="A5">A5</option><option value="A4">A4</option></select></label>
                <label>Font PDF<select id="napFont"><option value="Comic Neue">Comic Neue</option><option value="Helvetica">Helvetica</option><option value="Times-Roman">Times Roman</option></select></label>
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
      settings = { paperSize: "A5", fontFamily: "Comic Neue", fontSize: 11, lineHeight: 1.5, margin: 42, startEachSectionOnNewPage: true };
      root.querySelector("#napPaper").value = settings.paperSize;
      root.querySelector("#napFont").value = settings.fontFamily;
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
      releasePdf();
    };
    renderSections();
  }

  window.renderTextToPdf = renderTextToPdf;
})();
