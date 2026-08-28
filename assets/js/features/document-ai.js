/* Nexora Document AI VVIP */
(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char];
    });
  }

  function fileSize(bytes) {
    if (bytes < 1000) return bytes + " B";
    if (bytes < 1_000_000) return (bytes / 1000).toFixed(1) + " KB";
    return (bytes / 1_000_000).toFixed(2) + " MB";
  }

  function safeName(value) {
    return String(value || "document-ai").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "document-ai";
  }

  function download(name, content, type) {
    var link = document.createElement("a");
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvCell(value) {
    var text = String(value ?? "");
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function markdown(value) {
    var source = escapeHtml(value || "Informasi tidak ditemukan.");
    source = source.replace(/^### (.+)$/gm, "<h4>$1</h4>").replace(/^## (.+)$/gm, "<h3>$1</h3>").replace(/^# (.+)$/gm, "<h2>$1</h2>");
    source = source.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\[Halaman ([^\]]+)\]/g, '<span class="nda-page-ref">Halaman $1</span>');
    return source.split(/\n{2,}/).map(function (block) {
      if (/^<h[234]>/.test(block)) return block;
      var lines = block.split("\n");
      if (lines.every(function (line) { return /^[-*] /.test(line); })) return "<ul>" + lines.map(function (line) { return "<li>" + line.slice(2) + "</li>"; }).join("") + "</ul>";
      return "<p>" + lines.join("<br>") + "</p>";
    }).join("");
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("File tidak dapat dibaca.")); };
      reader.readAsDataURL(file);
    });
  }

  function imageElement(file) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(file);
      image.onload = function () { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Gambar tidak dapat dibuka.")); };
      image.src = url;
    });
  }

  function imageBitmap(file) {
    if (typeof createImageBitmap === "function") return createImageBitmap(file).catch(function () { return imageElement(file); });
    return imageElement(file);
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob(function (blob) { if (blob) resolve(blob); else reject(new Error("Optimasi gambar gagal.")); }, type, quality);
        return;
      }
      try {
        var parts = canvas.toDataURL(type, quality).split(",");
        var binary = atob(parts[1] || "");
        var bytes = new Uint8Array(binary.length);
        for (var index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        resolve(new Blob([bytes], { type: type }));
      } catch (error) { reject(new Error("Optimasi gambar tidak didukung browser ini.")); }
    });
  }

  async function prepareFile(file, mime) {
    if (!mime.startsWith("image/")) return { data: await readFile(file), mime: mime, bytes: file.size };
    var bitmap = await imageBitmap(file);
    var width = Number(bitmap.width || bitmap.naturalWidth || 0);
    var height = Number(bitmap.height || bitmap.naturalHeight || 0);
    var maxSide = 1800;
    if (!width || !height) { if (typeof bitmap.close === "function") bitmap.close(); throw new Error("Resolusi gambar tidak dapat dibaca."); }
    if (Math.max(width, height) <= maxSide && file.size <= 1_200_000) {
      if (typeof bitmap.close === "function") bitmap.close();
      return { data: await readFile(file), mime: mime, bytes: file.size, width: width, height: height };
    }
    var scale = Math.min(1, maxSide / Math.max(width, height));
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    var context = canvas.getContext("2d", { alpha: false }) || canvas.getContext("2d");
    if (!context) { if (typeof bitmap.close === "function") bitmap.close(); throw new Error("Browser tidak dapat memproses gambar ini."); }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (typeof bitmap.close === "function") bitmap.close();
    var blob = await canvasBlob(canvas, "image/jpeg", .86);
    if (blob.size > 2_400_000) blob = await canvasBlob(canvas, "image/jpeg", .72);
    var result = { data: await readFile(blob), mime: "image/jpeg", bytes: blob.size, width: canvas.width, height: canvas.height };
    canvas.width = 1; canvas.height = 1;
    return result;
  }

  function renderDocumentAi(root) {
    if (!root) return;
    root.innerHTML = `
      <main class="nda" aria-label="Nexora Document AI">
        <header class="nda-hero">
          <div class="nda-hero-copy">
            <span class="nda-kicker"><i class="fa-solid fa-crown"></i> VVIP DOCUMENT INTELLIGENCE</span>
            <h2>Dokumen panjang, jawaban singkat.</h2>
            <p>Analisis PDF, scan, gambar, TXT, Markdown, atau CSV menggunakan Nexora AI. Ringkas, ekstrak tabel, buat catatan belajar, lalu tanyakan bagian apa pun.</p>
            <div class="nda-trust"><span><i class="fa-solid fa-shield-halved"></i> File tidak disimpan</span><span><i class="fa-solid fa-file-circle-check"></i> Referensi halaman</span><span><i class="fa-solid fa-language"></i> Bahasa Indonesia</span></div>
          </div>
          <div class="nda-reactor" aria-hidden="true"><i class="fa-solid fa-file-waveform"></i><span></span><span></span></div>
        </header>

        <section class="nda-workspace">
          <aside class="nda-input-panel">
            <div class="nda-panel-heading"><div><span>01 · SOURCE</span><h3>Pilih dokumen</h3></div><b id="ndaApiState">CHECKING</b></div>
            <input id="ndaFile" class="nda-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.md,.csv,application/pdf,image/jpeg,image/png,image/webp,text/plain,text/markdown,text/csv">
            <div class="nda-drop" id="ndaDrop">
              <span class="nda-drop-icon"><i class="fa-solid fa-cloud-arrow-up"></i></span>
              <strong>Pilih atau jatuhkan dokumen</strong>
              <small>PDF · JPG · PNG · WEBP · TXT · MD · CSV</small>
              <em>Dokumen 3 MB · foto kamera 12 MB</em>
              <button class="nda-file-picker" id="ndaChoose" type="button"><i class="fa-solid fa-folder-open"></i> Pilih File</button>
            </div>
            <article class="nda-file" id="ndaFileCard" hidden><span><i class="fa-regular fa-file-lines"></i></span><div><strong id="ndaFileName"></strong><small id="ndaFileMeta"></small></div><button id="ndaRemove" type="button" aria-label="Hapus dokumen"><i class="fa-solid fa-xmark"></i></button></article>

            <fieldset class="nda-modes">
              <legend>02 · MODE ANALISIS</legend>
              <label class="is-selected"><input type="radio" name="ndaMode" value="summary" checked><i class="fa-solid fa-align-left"></i><span><strong>Smart Summary</strong><small>Ringkasan dan fakta utama</small></span></label>
              <label><input type="radio" name="ndaMode" value="deep"><i class="fa-solid fa-magnifying-glass-chart"></i><span><strong>Deep Analysis</strong><small>Risiko, konteks, dan tindakan</small></span></label>
              <label><input type="radio" name="ndaMode" value="study"><i class="fa-solid fa-graduation-cap"></i><span><strong>Study Notes</strong><small>Catatan belajar terstruktur</small></span></label>
              <label><input type="radio" name="ndaMode" value="table"><i class="fa-solid fa-table-cells"></i><span><strong>Table Extract</strong><small>Ambil data menjadi CSV</small></span></label>
            </fieldset>

            <button class="nda-analyze" id="ndaAnalyze" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Analisis Dokumen</span><i class="fa-solid fa-arrow-right"></i></button>
            <div class="nda-progress" id="ndaProgress" hidden><span><i id="ndaProgressBar"></i></span><strong id="ndaProgressText">Membaca struktur dokumen…</strong></div>
            <p class="nda-message" id="ndaMessage" role="status" aria-live="polite"></p>
          </aside>

          <section class="nda-output-panel">
            <div class="nda-panel-heading"><div><span>03 · INTELLIGENCE OUTPUT</span><h3 id="ndaResultTitle">Workspace siap</h3></div><b class="nda-quota" id="ndaQuota">VVIP</b></div>
            <div class="nda-empty" id="ndaEmpty"><span><i class="fa-solid fa-file-shield"></i></span><h3>Belum ada dokumen dianalisis</h3><p>Pilih dokumen dan mode analisis. Hasil, tabel, serta ruang tanya-jawab akan tampil di sini.</p></div>
            <div class="nda-result" id="ndaResult" hidden>
              <nav class="nda-tabs" aria-label="Bagian hasil">
                <button class="is-active" data-nda-tab="summary" type="button">Ringkasan</button>
                <button data-nda-tab="points" type="button">Poin</button>
                <button data-nda-tab="text" type="button">Teks</button>
                <button data-nda-tab="tables" type="button">Tabel <span id="ndaTableCount">0</span></button>
                <button data-nda-tab="chat" type="button">Tanya AI</button>
              </nav>
              <div class="nda-document-meta" id="ndaDocumentMeta"></div>
              <section class="nda-tab-panel is-active" data-nda-panel="summary"><div class="nda-prose" id="ndaSummary"></div><div class="nda-actions-list" id="ndaActions"></div></section>
              <section class="nda-tab-panel" data-nda-panel="points"><div class="nda-point-grid" id="ndaPoints"></div><div class="nda-study" id="ndaStudy"></div></section>
              <section class="nda-tab-panel" data-nda-panel="text"><pre id="ndaText"></pre></section>
              <section class="nda-tab-panel" data-nda-panel="tables"><div class="nda-tables" id="ndaTables"></div></section>
              <section class="nda-tab-panel" data-nda-panel="chat">
                <div class="nda-chat" id="ndaChat"><div class="nda-ai-message"><i class="fa-solid fa-sparkles"></i><p>Tanyakan angka, kesimpulan, istilah, atau bagian tertentu dari dokumen ini.</p></div></div>
                <form class="nda-question" id="ndaQuestion"><textarea id="ndaQuestionInput" rows="2" maxlength="2000" placeholder="Contoh: Apa kesimpulan utama pada dokumen ini?"></textarea><button type="submit" aria-label="Kirim pertanyaan"><i class="fa-solid fa-arrow-up"></i></button></form>
              </section>
              <footer class="nda-export"><span><i class="fa-solid fa-lock"></i> Diproses sementara · sumber tidak disimpan</span><div><button data-nda-export="txt" type="button"><i class="fa-solid fa-file-lines"></i> TXT</button><button data-nda-export="json" type="button"><i class="fa-solid fa-code"></i> JSON</button><button data-nda-export="word" type="button"><i class="fa-solid fa-file-word"></i> Word</button></div></footer>
            </div>
          </section>
        </section>
      </main>`;

    var state = { file: null, fileData: "", analysis: null, history: [], busy: false, progressTimer: null };
    var fileInput = root.querySelector("#ndaFile");
    var drop = root.querySelector("#ndaDrop");
    var choose = root.querySelector("#ndaChoose");
    var analyze = root.querySelector("#ndaAnalyze");
    var message = root.querySelector("#ndaMessage");
    var fetcher = typeof window.NexoraFetch === "function" ? window.NexoraFetch : window.fetch.bind(window);

    function notify(text, error) {
      message.textContent = text || "";
      message.className = "nda-message" + (error ? " is-error" : text ? " is-success" : "");
    }

    function setBusy(busy) {
      state.busy = busy;
      analyze.disabled = busy || !state.file;
      fileInput.disabled = busy;
      root.querySelector("#ndaRemove").disabled = busy;
      root.querySelector("#ndaProgress").hidden = !busy;
      analyze.classList.toggle("is-loading", busy);
      analyze.querySelector("span").textContent = busy ? "Sedang Menganalisis…" : "Analisis Dokumen";
      if (!busy) {
        clearInterval(state.progressTimer);
        root.querySelector("#ndaProgressBar").style.width = "0";
      }
    }

    function startProgress() {
      var stages = ["Mengamankan dokumen…", "Membaca struktur dan halaman…", "Menyusun fakta penting…", "Memeriksa hasil analisis…"];
      var index = 0;
      var bar = root.querySelector("#ndaProgressBar");
      var text = root.querySelector("#ndaProgressText");
      bar.style.width = "12%";
      text.textContent = stages[0];
      state.progressTimer = setInterval(function () {
        index = Math.min(stages.length - 1, index + 1);
        text.textContent = stages[index];
        bar.style.width = 18 + index * 23 + "%";
      }, 2100);
    }

    function clearFile() {
      state.file = null;
      state.fileData = "";
      fileInput.value = "";
      root.querySelector("#ndaFileCard").hidden = true;
      drop.hidden = false;
      analyze.disabled = true;
      notify("");
    }

    function openFilePicker() {
      if (state.busy || fileInput.disabled) return;
      fileInput.value = "";
      fileInput.click();
    }

    async function selectFile(file) {
      var allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/markdown", "text/csv"];
      if (!file) return;
      var extension = (file.name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
      var mime = String(file.type || "").toLowerCase();
      if (!mime || mime === "application/octet-stream") mime = ({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", txt: "text/plain", md: "text/markdown", csv: "text/csv" })[extension] || mime;
      if (!allowed.includes(mime)) return notify("Format belum didukung. Gunakan PDF, gambar, TXT, Markdown, atau CSV.", true);
      var isImage = mime.startsWith("image/");
      if (file.size > (isImage ? 12_000_000 : 3_000_000)) return notify(isImage ? "Foto kamera maksimal 12 MB sebelum optimasi." : "Dokumen maksimal 3 MB.", true);
      try {
        notify(isImage ? "Mengoptimalkan foto untuk Android…" : "Membaca dokumen…");
        var prepared = await prepareFile(file, mime);
        if (prepared.bytes > 3_000_000) throw new Error("File masih melebihi 3 MB setelah optimasi.");
        state.fileData = prepared.data;
        state.file = { name: file.name, size: prepared.bytes, type: prepared.mime };
        root.querySelector("#ndaFileName").textContent = file.name;
        root.querySelector("#ndaFileMeta").textContent = fileSize(file.size) + (prepared.bytes !== file.size ? " → " + fileSize(prepared.bytes) : "") + " · " + (prepared.mime.split("/")[1] || "file").toUpperCase();
        root.querySelector("#ndaFileCard").hidden = false;
        drop.hidden = true;
        analyze.disabled = false;
        notify("Dokumen siap dianalisis.");
      } catch (error) { notify(error.message, true); }
    }

    function renderList(target, rows, icon) {
      target.innerHTML = rows.length ? rows.map(function (item, index) { return '<article><span><i class="' + icon + '"></i></span><div><b>' + String(index + 1).padStart(2, "0") + '</b><p>' + markdown(item) + '</p></div></article>'; }).join("") : '<div class="nda-no-data">Bagian ini tidak ditemukan pada dokumen.</div>';
    }

    function renderTables(tables) {
      var target = root.querySelector("#ndaTables");
      if (!tables.length) { target.innerHTML = '<div class="nda-no-data">Tidak ada tabel terstruktur yang terdeteksi.</div>'; return; }
      target.innerHTML = tables.map(function (table, tableIndex) {
        var columns = Math.max(table.headers.length, ...(table.rows || []).map(function (row) { return row.length; }), 1);
        var headers = table.headers.length ? table.headers : Array.from({ length: columns }, function (_, index) { return "Kolom " + (index + 1); });
        return '<article class="nda-table-card"><header><div><span>TABEL ' + (tableIndex + 1) + '</span><h4>' + escapeHtml(table.title) + '</h4></div><button type="button" data-nda-csv="' + tableIndex + '"><i class="fa-solid fa-download"></i> CSV</button></header><div class="nda-table-scroll"><table><thead><tr>' + headers.map(function (item) { return "<th>" + escapeHtml(item) + "</th>"; }).join("") + '</tr></thead><tbody>' + table.rows.map(function (row) { return "<tr>" + headers.map(function (_, index) { return "<td>" + escapeHtml(row[index] || "") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></article>";
      }).join("");
    }

    function renderAnalysis(payload) {
      var data = payload.analysis;
      state.analysis = data;
      state.history = [];
      root.querySelector("#ndaEmpty").hidden = true;
      root.querySelector("#ndaResult").hidden = false;
      root.querySelector("#ndaResultTitle").textContent = data.title;
      root.querySelector("#ndaDocumentMeta").innerHTML = '<span><i class="fa-regular fa-file"></i>' + escapeHtml(state.file.name) + '</span><span>' + escapeHtml(data.documentType) + '</span><span>' + escapeHtml(data.language) + '</span>';
      root.querySelector("#ndaSummary").innerHTML = markdown(data.summary);
      renderList(root.querySelector("#ndaActions"), data.actions || [], "fa-solid fa-check");
      renderList(root.querySelector("#ndaPoints"), data.keyPoints || [], "fa-solid fa-diamond");
      renderList(root.querySelector("#ndaStudy"), data.studyNotes || [], "fa-solid fa-graduation-cap");
      root.querySelector("#ndaText").textContent = data.extractedText || "Teks penting tidak tersedia untuk dokumen ini.";
      root.querySelector("#ndaTableCount").textContent = String((data.tables || []).length);
      renderTables(data.tables || []);
      root.querySelector("#ndaChat").innerHTML = '<div class="nda-ai-message"><i class="fa-solid fa-sparkles"></i><p>Analisis selesai. Sekarang Anda dapat bertanya tentang isi <strong>' + escapeHtml(state.file.name) + '</strong>.</p></div>';
      if (payload.quota) root.querySelector("#ndaQuota").textContent = payload.quota.remaining + " ANALISIS TERSISA";
    }

    async function api(body) {
      var response = await fetcher("/api/document-ai", {
        method: "POST", credentials: "same-origin", cache: "no-store", nexoraTimeoutMs: 85000, nexoraRetries: 0,
        headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(body)
      });
      var payload = await response.json().catch(function () { return {}; });
      if (!response.ok || !payload.ok) throw new Error(payload.message || "Document AI belum dapat memproses permintaan.");
      return payload;
    }

    async function runAnalysis() {
      if (!state.file || state.busy) return;
      setBusy(true); startProgress(); notify("");
      try {
        var mode = root.querySelector('input[name="ndaMode"]:checked').value;
        var payload = await api({ action: "analyze", mode: mode, fileName: state.file.name, mimeType: state.file.type, fileData: state.fileData });
        root.querySelector("#ndaProgressBar").style.width = "100%";
        renderAnalysis(payload);
        notify("Analisis selesai dan file sumber tidak disimpan.");
      } catch (error) { notify(error.message || "Analisis gagal.", true); }
      finally { setBusy(false); }
    }

    async function ask(event) {
      event.preventDefault();
      if (!state.file || !state.analysis || state.busy) return;
      var input = root.querySelector("#ndaQuestionInput");
      var question = input.value.trim();
      if (!question) return;
      var chat = root.querySelector("#ndaChat");
      chat.insertAdjacentHTML("beforeend", '<div class="nda-user-message"><p>' + escapeHtml(question) + '</p></div><div class="nda-ai-message is-thinking"><i class="fa-solid fa-spinner fa-spin"></i><p>Mencari jawaban di dalam dokumen…</p></div>');
      input.value = ""; state.busy = true; input.disabled = true; event.submitter.disabled = true; chat.scrollTop = chat.scrollHeight;
      try {
        var payload = await api({ action: "ask", question: question, history: state.history, fileName: state.file.name, mimeType: state.file.type, fileData: state.fileData });
        chat.querySelector(".is-thinking")?.remove();
        chat.insertAdjacentHTML("beforeend", '<div class="nda-ai-message"><i class="fa-solid fa-sparkles"></i><div>' + markdown(payload.answer) + "</div></div>");
        state.history.push({ role: "user", content: question }, { role: "assistant", content: payload.answer });
        state.history = state.history.slice(-6);
        root.querySelector("#ndaQuota").textContent = payload.quota.remaining + " PERTANYAAN TERSISA";
      } catch (error) {
        var thinking = chat.querySelector(".is-thinking");
        if (thinking) thinking.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i><p>' + escapeHtml(error.message || "Pertanyaan gagal diproses.") + "</p>";
      } finally { state.busy = false; input.disabled = false; event.submitter.disabled = false; input.focus(); chat.scrollTop = chat.scrollHeight; }
    }

    function exportResult(format) {
      if (!state.analysis) return;
      var a = state.analysis;
      var base = safeName(state.file.name) + "-nexora-ai";
      var text = a.title + "\n\n" + a.summary + "\n\nPOIN PENTING\n" + a.keyPoints.map(function (item) { return "- " + item; }).join("\n") + "\n\nTINDAKAN\n" + a.actions.map(function (item) { return "- " + item; }).join("\n") + "\n\nTEKS EKSTRAKSI\n" + a.extractedText;
      if (format === "json") return download(base + ".json", JSON.stringify(a, null, 2), "application/json;charset=utf-8");
      if (format === "word") {
        var html = '<!doctype html><html><head><meta charset="utf-8"><title>' + escapeHtml(a.title) + '</title></head><body><h1>' + escapeHtml(a.title) + '</h1>' + markdown(a.summary) + '<h2>Poin penting</h2><ul>' + a.keyPoints.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("") + '</ul><h2>Teks ekstraksi</h2><p>' + escapeHtml(a.extractedText).replace(/\n/g, "<br>") + "</p></body></html>";
        return download(base + ".doc", html, "application/msword;charset=utf-8");
      }
      download(base + ".txt", text, "text/plain;charset=utf-8");
    }

    choose.addEventListener("click", function (event) { event.stopPropagation(); openFilePicker(); });
    drop.addEventListener("click", function (event) { if (!event.target.closest("button")) openFilePicker(); });
    fileInput.addEventListener("change", function () { selectFile(fileInput.files && fileInput.files[0]); });
    ["dragenter", "dragover"].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.add("is-dragging"); }); });
    ["dragleave", "drop"].forEach(function (name) { drop.addEventListener(name, function (event) { event.preventDefault(); drop.classList.remove("is-dragging"); }); });
    drop.addEventListener("drop", function (event) { selectFile(event.dataTransfer && event.dataTransfer.files[0]); });
    root.querySelector("#ndaRemove").addEventListener("click", clearFile);
    analyze.addEventListener("click", runAnalysis);
    root.querySelectorAll('input[name="ndaMode"]').forEach(function (input) { input.addEventListener("change", function () { root.querySelectorAll(".nda-modes label").forEach(function (label) { label.classList.toggle("is-selected", label.contains(input) && input.checked); }); }); });
    root.querySelector(".nda-tabs").addEventListener("click", function (event) { var button = event.target.closest("[data-nda-tab]"); if (!button) return; root.querySelectorAll("[data-nda-tab]").forEach(function (item) { item.classList.toggle("is-active", item === button); }); root.querySelectorAll("[data-nda-panel]").forEach(function (panel) { panel.classList.toggle("is-active", panel.dataset.ndaPanel === button.dataset.ndaTab); }); });
    root.querySelector("#ndaQuestion").addEventListener("submit", ask);
    root.querySelector("#ndaResult").addEventListener("click", function (event) {
      var exportButton = event.target.closest("[data-nda-export]"); if (exportButton) return exportResult(exportButton.dataset.ndaExport);
      var csvButton = event.target.closest("[data-nda-csv]"); if (!csvButton || !state.analysis) return;
      var table = state.analysis.tables[Number(csvButton.dataset.ndaCsv)]; if (!table) return;
      var rows = [table.headers].concat(table.rows).map(function (row) { return row.map(csvCell).join(","); }).join("\r\n");
      download(safeName(state.file.name) + "-tabel-" + (Number(csvButton.dataset.ndaCsv) + 1) + ".csv", "\ufeff" + rows, "text/csv;charset=utf-8");
    });

    root.__nxCleanup = function () {
      clearInterval(state.progressTimer);
      state.file = null;
      state.fileData = "";
      state.analysis = null;
      state.history = [];
    };

    fetcher("/api/document-ai", { method: "GET", credentials: "same-origin", cache: "no-store", nexoraTimeoutMs: 8000, nexoraRetries: 0 }).then(function (response) { return response.json(); }).then(function (payload) {
      var badge = root.querySelector("#ndaApiState"); badge.textContent = payload.configured ? "NEXORA AI READY" : "KEY REQUIRED"; badge.classList.toggle("is-warning", !payload.configured);
      if (!payload.configured) notify("Nexora AI belum dikonfigurasi pada server.", true);
    }).catch(function () { var badge = root.querySelector("#ndaApiState"); badge.textContent = "API OFFLINE"; badge.classList.add("is-warning"); });
  }

  window.renderDocumentAi = renderDocumentAi;
})();
