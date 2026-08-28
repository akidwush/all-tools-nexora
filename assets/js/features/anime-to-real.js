(function () {
  "use strict";

  var REQUEST_TIMEOUT_MS = 60 * 1000;
  var sessionState = {
    inputUrl: "",
    originalPreview: "",
    result: null,
    loading: false,
    error: ""
  };

  function text(value, maximum) {
    return String(value == null ? "" : value).trim().slice(0, maximum || 500);
  }

  function validUrl(value) {
    try {
      var parsed = new URL(value);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && !parsed.username && !parsed.password;
    } catch (_) {
      return false;
    }
  }

  function element(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }

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

  function actionLink(label, iconName, url, download) {
    var anchor = element("a", "natr-action");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    if (download) anchor.setAttribute("download", "anime-to-real-result");
    anchor.append(element("i", iconName), document.createTextNode(label));
    return anchor;
  }

  window.renderAnimeToReal = function renderAnimeToReal(body) {
    if (!body) return;
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    var alive = true;
    var controller = null;
    var requestTimer = 0;
    var toastTimer = 0;
    var hiddenAbort = false;

    body.innerHTML = "" +
      '<main class="natr">' +
        '<section class="natr-hero">' +
          '<span class="natr-hero-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>' +
          '<div><span class="natr-kicker">AI IMAGE TRANSFORM</span><h2>Anime to Real</h2><p>Ubah ilustrasi anime menjadi gambar bergaya realistis lewat satu URL.</p></div>' +
        '</section>' +
        '<section class="natr-card natr-form-card">' +
          '<form id="natrForm" novalidate>' +
            '<label for="natrUrl">Image URL</label>' +
            '<div class="natr-input-row"><input id="natrUrl" type="url" inputmode="url" maxlength="4096" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://example.com/image.jpg"><button id="natrPaste" class="natr-paste" type="button"><i class="fa-regular fa-clipboard"></i><span>Paste</span></button></div>' +
            '<p class="natr-hint">Gunakan link gambar publik yang dapat dibuka tanpa login.</p>' +
            '<button id="natrConvert" class="natr-primary" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Convert</span></button>' +
          '</form>' +
          '<p id="natrFeedback" class="natr-feedback" role="status" aria-live="polite"></p>' +
        '</section>' +
        '<section class="natr-card natr-workspace" aria-busy="false">' +
          '<div class="natr-stage"><div class="natr-stage-head"><span>ORIGINAL</span><strong>Anime artwork</strong></div><div id="natrOriginal" class="natr-image-frame"></div></div>' +
          '<div class="natr-arrow" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i></div>' +
          '<div class="natr-stage"><div class="natr-stage-head"><span>RESULT</span><strong>Realistic image</strong></div><div id="natrResult" class="natr-image-frame"></div><div id="natrActions" class="natr-actions"></div></div>' +
        '</section>' +
        '<p class="natr-note"><i class="fa-solid fa-shield-halved"></i> URL diproses melalui server Nexora. Gambar tidak disimpan oleh Nexora.</p>' +
        '<div id="natrToast" class="natr-toast" role="status" aria-live="polite" hidden></div>' +
      '</main>';

    var form = body.querySelector("#natrForm");
    var input = body.querySelector("#natrUrl");
    var paste = body.querySelector("#natrPaste");
    var convert = body.querySelector("#natrConvert");
    var feedback = body.querySelector("#natrFeedback");
    var workspace = body.querySelector(".natr-workspace");
    var original = body.querySelector("#natrOriginal");
    var result = body.querySelector("#natrResult");
    var actions = body.querySelector("#natrActions");
    var toast = body.querySelector("#natrToast");

    input.value = sessionState.inputUrl;
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") paste.hidden = true;

    function showToast(message, isError) {
      clearTimeout(toastTimer);
      toast.textContent = message;
      toast.classList.toggle("is-error", Boolean(isError));
      toast.hidden = false;
      toastTimer = setTimeout(function () { if (alive) toast.hidden = true; }, 1800);
    }

    function setLoading(loading) {
      sessionState.loading = loading;
      input.disabled = loading;
      paste.disabled = loading;
      convert.disabled = loading;
      workspace.setAttribute("aria-busy", loading ? "true" : "false");
      convert.querySelector("i").className = loading ? "fa-solid fa-circle-notch fa-spin" : "fa-solid fa-wand-magic-sparkles";
      convert.querySelector("span").textContent = loading ? "Converting…" : "Convert";
    }

    function emptyFrame(frame, iconName, message) {
      frame.replaceChildren();
      frame.classList.remove("has-image", "is-broken");
      var empty = element("div", "natr-empty");
      empty.append(element("i", iconName), element("span", "", message));
      frame.appendChild(empty);
    }

    function renderImage(frame, url, alt) {
      frame.replaceChildren();
      frame.classList.remove("is-broken");
      frame.classList.add("has-image");
      var image = document.createElement("img");
      image.src = url;
      image.alt = alt;
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", function () {
        image.hidden = true;
        frame.classList.remove("has-image");
        frame.classList.add("is-broken");
        emptyFrame(frame, "fa-regular fa-image", "Gambar tidak dapat dimuat.");
        frame.classList.add("is-broken");
      }, { once: true });
      frame.appendChild(image);
    }

    function renderState() {
      feedback.textContent = sessionState.error || (sessionState.loading ? "Gambar sedang diproses. Proses dapat membutuhkan waktu hingga satu menit." : "");
      feedback.classList.toggle("is-error", Boolean(sessionState.error));
      feedback.classList.toggle("is-loading", sessionState.loading);

      if (sessionState.originalPreview) renderImage(original, sessionState.originalPreview, "Gambar anime asli");
      else emptyFrame(original, "fa-regular fa-image", "Preview gambar asli muncul di sini.");

      actions.replaceChildren();
      if (sessionState.result && sessionState.result.imageUrl) {
        var resultUrl = sessionState.result.imageUrl;
        renderImage(result, resultUrl, "Hasil realistis Anime to Real");
        actions.appendChild(actionLink("Open Image", "fa-solid fa-arrow-up-right-from-square", resultUrl, false));
        actions.appendChild(actionLink("Download Result", "fa-solid fa-download", resultUrl, true));
        var copy = element("button", "natr-action", "Copy Link");
        copy.type = "button";
        copy.addEventListener("click", function () {
          copyText(resultUrl).then(function () { showToast("Link copied"); }).catch(function () { showToast("Gagal menyalin link", true); });
        });
        actions.appendChild(copy);
      } else if (sessionState.loading) {
        emptyFrame(result, "fa-solid fa-circle-notch fa-spin", "Converting…");
      } else {
        emptyFrame(result, "fa-solid fa-user-check", "Hasil realistis muncul di sini.");
      }
    }

    paste.addEventListener("click", function () {
      if (sessionState.loading) return;
      navigator.clipboard.readText().then(function (value) {
        if (!alive) return;
        var pasted = text(value, 4097);
        input.value = pasted;
        sessionState.inputUrl = pasted;
        if (validUrl(pasted)) {
          sessionState.originalPreview = pasted;
          sessionState.error = "";
          renderState();
        } else {
          sessionState.error = "Clipboard tidak berisi URL gambar yang valid.";
          renderState();
        }
      }).catch(function () { showToast("Clipboard tidak dapat dibaca", true); });
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (sessionState.loading) return;
      var value = text(input.value, 4097);
      sessionState.inputUrl = value;
      sessionState.error = "";
      if (!value || value.length > 4096 || !validUrl(value)) {
        sessionState.error = value.length > 4096 ? "URL gambar terlalu panjang." : "URL gambar tidak valid.";
        renderState();
        input.focus();
        return;
      }

      sessionState.originalPreview = value;
      setLoading(true);
      renderState();
      controller = new AbortController();
      hiddenAbort = false;
      requestTimer = setTimeout(function () { if (controller) controller.abort(); }, REQUEST_TIMEOUT_MS);
      try {
        var params = new URLSearchParams({ url: value });
        var response = await fetch("/api/ai/anime-to-real?" + params.toString(), {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          headers: { Accept: "application/json" }
        });
        var payload;
        try { payload = await response.json(); }
        catch (_) { throw new Error("Respons Anime to Real tidak dapat dibaca."); }
        if (!response.ok || !payload || payload.ok !== true) {
          throw new Error(text(payload && payload.message, 240) || "Anime to Real sedang tidak tersedia.");
        }
        var imageUrl = text(payload.data && payload.data.imageUrl, 8192);
        if (!validUrl(imageUrl)) throw new Error("Gambar hasil belum tersedia.");
        sessionState.result = { imageUrl: imageUrl };
        sessionState.error = "";
        showToast("Conversion selesai");
      } catch (error) {
        if (!alive || hiddenAbort) return;
        sessionState.error = error && error.name === "AbortError" ? "Proses terlalu lama. Coba lagi." : text(error && error.message, 240) || "Anime to Real sedang tidak tersedia.";
      } finally {
        clearTimeout(requestTimer);
        requestTimer = 0;
        controller = null;
        if (alive) {
          setLoading(false);
          renderState();
        }
      }
    });

    function onVisibilityChange() {
      if (document.hidden && controller) {
        hiddenAbort = true;
        controller.abort();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    body.__nxCleanup = function () {
      alive = false;
      hiddenAbort = true;
      if (controller) controller.abort();
      clearTimeout(requestTimer);
      clearTimeout(toastTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      body.__nxCleanup = null;
    };

    renderState();
  };
})();
