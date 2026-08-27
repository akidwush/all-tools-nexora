(function () {
  "use strict";

  var REQUEST_TIMEOUT_MS = 30 * 1000;
  var MAX_URL_LENGTH = 4096;
  var sessionState = {
    inputUrl: "",
    result: null,
    loading: false,
    error: ""
  };

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(value);
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "absolute";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    var copied = document.execCommand("copy");
    field.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error("COPY_FAILED"));
  }

  function validInput(value) {
    var raw = String(value || "").trim();
    if (!raw || raw.length > MAX_URL_LENGTH) return false;
    try {
      var parsed = new URL(raw);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
    } catch (_) { return false; }
  }

  function displayValue(value) {
    return String(value == null ? "" : value).trim().slice(0, 500);
  }

  window.renderAioDownloader = function renderAioDownloader(body) {
    if (!body) return;
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    var alive = true;
    var controller = null;
    var timer = 0;
    var toastTimer = 0;

    body.innerHTML = "" +
      '<main class="naio">' +
        '<section class="naio-hero">' +
          '<span class="naio-hero-icon"><i class="fa-solid fa-cloud-arrow-down"></i></span>' +
          '<div><span class="naio-kicker">UNIVERSAL MEDIA TOOL</span><h2>All In One Downloader</h2><p>Tempel link media, lalu pilih hasil download yang benar-benar tersedia.</p></div>' +
        '</section>' +
        '<section class="naio-card naio-form-card">' +
          '<div class="naio-section-title"><span><i class="fa-solid fa-link"></i></span><div><strong>Masukkan link media</strong><small>Request hanya berjalan setelah tombol dipilih.</small></div></div>' +
          '<form id="naioForm" novalidate>' +
            '<label for="naioUrl">URL Video / Media</label>' +
            '<div class="naio-input-row">' +
              '<input id="naioUrl" type="url" inputmode="url" autocomplete="url" spellcheck="false" maxlength="4096" placeholder="Tempel link video atau media…" aria-describedby="naioHint">' +
              '<button id="naioPaste" class="naio-paste" type="button"><i class="fa-regular fa-paste"></i><span>Paste</span></button>' +
            '</div>' +
            '<p id="naioHint" class="naio-hint">Gunakan link dengan awalan http:// atau https://.</p>' +
            '<button id="naioSubmit" class="naio-primary" type="submit"><i class="fa-solid fa-download"></i><span>Ambil Media</span></button>' +
          '</form>' +
          '<p id="naioFeedback" class="naio-feedback" role="status" aria-live="polite"></p>' +
        '</section>' +
        '<section id="naioResult" class="naio-card naio-result" aria-live="polite">' +
          '<div class="naio-empty"><i class="fa-regular fa-circle-down"></i><strong>Hasil media muncul di sini</strong><span>Nexora tidak memutar video otomatis dan tidak menyimpan hasil download.</span></div>' +
        '</section>' +
        '<p class="naio-legal"><i class="fa-solid fa-shield-halved"></i> Unduh hanya media yang memang boleh kamu simpan. Media privat, berbayar, atau terlindungi tidak akan dibypass.</p>' +
        '<div id="naioToast" class="naio-toast" role="status" aria-live="polite" hidden></div>' +
      '</main>';

    var root = body.querySelector(".naio");
    var form = body.querySelector("#naioForm");
    var input = body.querySelector("#naioUrl");
    var paste = body.querySelector("#naioPaste");
    var submit = body.querySelector("#naioSubmit");
    var feedback = body.querySelector("#naioFeedback");
    var result = body.querySelector("#naioResult");
    var toast = body.querySelector("#naioToast");

    function showToast(message, type) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.className = "naio-toast " + (type === "error" ? "is-error" : "is-ok");
      toast.hidden = false;
      toastTimer = setTimeout(function () { if (alive) toast.hidden = true; }, 1800);
    }

    function setFeedback(message, type) {
      feedback.textContent = message || "";
      feedback.className = "naio-feedback" + (type ? " is-" + type : "");
    }

    function setBusy(busy) {
      sessionState.loading = busy;
      submit.disabled = busy;
      input.disabled = busy;
      paste.disabled = busy;
      root.setAttribute("aria-busy", busy ? "true" : "false");
      submit.querySelector("i").className = busy ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-download";
      submit.querySelector("span").textContent = busy ? "Memproses media…" : "Ambil Media";
    }

    function appendMetadata(host, data) {
      var values = [
        ["fa-user", data.author],
        ["fa-globe", data.platform],
        ["fa-clock", data.duration]
      ].filter(function (entry) { return displayValue(entry[1]); });
      if (!values.length) return;
      var meta = document.createElement("div");
      meta.className = "naio-meta";
      values.forEach(function (entry) {
        var chip = document.createElement("span");
        var icon = document.createElement("i");
        icon.className = "fa-solid " + entry[0];
        chip.appendChild(icon);
        chip.appendChild(document.createTextNode(displayValue(entry[1])));
        meta.appendChild(chip);
      });
      host.appendChild(meta);
    }

    function itemLabel(item, index) {
      var parts = [item.label, item.quality, item.format, item.type].map(displayValue).filter(Boolean);
      return parts.length ? parts.join(" • ") : "Media " + (index + 1);
    }

    function renderResult(data) {
      result.textContent = "";
      var items = data && Array.isArray(data.items) ? data.items.filter(function (item) {
        return item && typeof item.url === "string" && /^https?:\/\//i.test(item.url);
      }) : [];
      if (!items.length) {
        result.innerHTML = '<div class="naio-empty is-error"><i class="fa-solid fa-triangle-exclamation"></i><strong>Media belum tersedia</strong><span>Server tidak memberikan link media yang dapat dibuka.</span></div>';
        return;
      }

      if (data.thumbnail) {
        var preview = document.createElement("div");
        preview.className = "naio-preview";
        var image = document.createElement("img");
        image.src = data.thumbnail;
        image.alt = data.title ? "Thumbnail " + displayValue(data.title) : "Thumbnail media";
        image.loading = "lazy";
        image.decoding = "async";
        var fallback = document.createElement("span");
        fallback.innerHTML = '<i class="fa-regular fa-image"></i>';
        fallback.hidden = true;
        image.addEventListener("error", function () { image.hidden = true; fallback.hidden = false; }, { once: true });
        preview.appendChild(image); preview.appendChild(fallback); result.appendChild(preview);
      }

      var heading = document.createElement("div");
      heading.className = "naio-result-head";
      var kicker = document.createElement("span");
      kicker.textContent = items.length + (items.length === 1 ? " HASIL TERSEDIA" : " HASIL TERSEDIA");
      var title = document.createElement("h3");
      title.textContent = displayValue(data.title) || "Media ditemukan";
      heading.appendChild(kicker); heading.appendChild(title);
      appendMetadata(heading, data);
      result.appendChild(heading);

      var list = document.createElement("div");
      list.className = "naio-items";
      items.forEach(function (item, index) {
        var card = document.createElement("article");
        card.className = "naio-item";
        var info = document.createElement("div");
        var name = document.createElement("strong");
        name.textContent = itemLabel(item, index);
        info.appendChild(name);
        var details = [item.size, item.filename].map(displayValue).filter(Boolean);
        if (details.length) {
          var small = document.createElement("small");
          small.textContent = details.join(" • ");
          info.appendChild(small);
        }
        var actions = document.createElement("div");
        actions.className = "naio-item-actions";
        var open = document.createElement("a");
        open.href = item.url;
        open.target = "_blank";
        open.rel = "noopener noreferrer nofollow";
        open.className = "naio-open";
        open.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square"></i><span>' + (items.length === 1 ? "Buka Media" : "Download") + '</span>';
        open.addEventListener("click", function () {
          if (typeof window.recordDownload === "function") {
            window.recordDownload("All In One", displayValue(item.format || item.type || "Media"), item.url, displayValue(item.filename || "media"), displayValue(data.title || "Media"));
          }
        });
        var copy = document.createElement("button");
        copy.type = "button";
        copy.className = "naio-copy";
        copy.innerHTML = '<i class="fa-regular fa-copy"></i><span>Copy Link</span>';
        copy.addEventListener("click", function () {
          copyText(item.url).then(function () { if (alive) showToast("Link copied", "ok"); })
            .catch(function () { if (alive) showToast("Link gagal disalin", "error"); });
        });
        actions.appendChild(open); actions.appendChild(copy);
        card.appendChild(info); card.appendChild(actions); list.appendChild(card);
      });
      result.appendChild(list);
    }

    function failMessage(error) {
      var text = displayValue(error && error.message);
      return text || "Server downloader sedang bermasalah. Coba lagi.";
    }

    function submitUrl() {
      if (sessionState.loading) return;
      var value = input.value.trim();
      if (!validInput(value)) {
        setFeedback("Masukkan URL media yang valid dengan awalan http:// atau https://.", "error");
        input.focus();
        return;
      }
      sessionState.inputUrl = value;
      sessionState.error = "";
      setBusy(true);
      setFeedback("Processing media…", "loading");
      result.innerHTML = '<div class="naio-empty is-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><strong>Memproses media</strong><span>Menunggu server menyiapkan pilihan yang tersedia.</span></div>';
      controller = new AbortController();
      var activeController = controller;
      timer = setTimeout(function () { activeController.abort(); }, REQUEST_TIMEOUT_MS);
      var query = new URLSearchParams({ url: value });
      fetch("/api/download/aio?" + query.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: activeController.signal
      }).then(function (response) {
        return response.text().then(function (raw) {
          var payload;
          try { payload = raw ? JSON.parse(raw) : {}; }
          catch (_) { throw new Error("Server downloader mengirim respons yang tidak dapat dibaca. Coba lagi."); }
          if (!response.ok || payload.ok !== true) {
            throw new Error(payload.message || (response.status === 429 ? "Batas request sementara tercapai. Coba lagi nanti." : "Link tidak dapat diproses."));
          }
          return payload;
        });
      }).then(function (payload) {
        if (!alive || controller !== activeController) return;
        sessionState.result = payload.data || null;
        sessionState.error = "";
        renderResult(sessionState.result);
        setFeedback("Media berhasil diproses.", "ok");
      }).catch(function (error) {
        if (!alive || controller !== activeController) return;
        if (error && error.name === "AbortError" && document.visibilityState === "hidden") return;
        var message = error && error.name === "AbortError" ? "Server downloader terlalu lama merespons. Coba lagi." : failMessage(error);
        sessionState.error = message;
        sessionState.result = null;
        setFeedback(message, "error");
        result.innerHTML = '<div class="naio-empty is-error"><i class="fa-solid fa-triangle-exclamation"></i><strong>Media gagal diproses</strong><span></span></div>';
        result.querySelector("span").textContent = message;
      }).finally(function () {
        clearTimeout(timer); timer = 0;
        if (controller === activeController) controller = null;
        if (alive) setBusy(false);
      });
    }

    form.addEventListener("submit", function (event) { event.preventDefault(); submitUrl(); });
    paste.hidden = !(navigator.clipboard && typeof navigator.clipboard.readText === "function");
    paste.addEventListener("click", function () {
      navigator.clipboard.readText().then(function (value) {
        if (!alive) return;
        input.value = String(value || "").trim().slice(0, MAX_URL_LENGTH);
        sessionState.inputUrl = input.value;
        setFeedback(validInput(input.value) ? "Link berhasil ditempel." : "Clipboard tidak berisi URL media yang valid.", validInput(input.value) ? "ok" : "error");
      }).catch(function () { if (alive) setFeedback("Clipboard tidak dapat dibaca. Tempel link secara manual.", "error"); });
    });
    input.addEventListener("input", function () {
      sessionState.inputUrl = input.value;
      if (feedback.classList.contains("is-error")) setFeedback("", "");
    });

    function onVisibilityChange() {
      if (document.visibilityState === "hidden" && controller) controller.abort();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    input.value = sessionState.inputUrl;
    if (sessionState.result) renderResult(sessionState.result);
    else if (sessionState.error) setFeedback(sessionState.error, "error");

    body.__nxCleanup = function () {
      alive = false;
      if (controller) controller.abort();
      clearTimeout(timer);
      clearTimeout(toastTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  };
})();
