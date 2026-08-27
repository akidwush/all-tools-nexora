(function () {
  "use strict";

  var DOMAIN_CACHE_MS = 10 * 60 * 1000;
  var REQUEST_TIMEOUT_MS = 14 * 1000;
  var REFRESH_COOLDOWN_MS = 5 * 1000;
  var domainCache = { values: [], expiresAt: 0 };
  var sessionState = {
    activeEmail: "",
    domains: [],
    messages: [],
    selectedMessage: null,
    loading: Object.create(null),
    error: "",
    lastRefresh: 0
  };

  function safeMessage(error, fallback) {
    if (error && error.name === "AbortError") return "Permintaan dibatalkan.";
    var text = String(error && error.message || "").trim();
    return text && text.length <= 220 ? text : fallback;
  }

  function timeLabel(value) {
    if (!value) return "";
    var parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      try { return parsed.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }); }
      catch (_) { return parsed.toLocaleString("id-ID"); }
    }
    return String(value).slice(0, 120);
  }

  function sanitizeEmailHtml(html) {
    var parser = new DOMParser();
    var documentNode = parser.parseFromString(String(html || ""), "text/html");
    documentNode.querySelectorAll("script,iframe,object,embed,style,svg,math,form,input,button,select,textarea,base,meta,link,img,video,audio,source,canvas").forEach(function (node) { node.remove(); });
    documentNode.querySelectorAll("*").forEach(function (node) {
      Array.prototype.slice.call(node.attributes || []).forEach(function (attribute) {
        var name = attribute.name.toLowerCase();
        var value = String(attribute.value || "").trim();
        var allowed = name === "href" || name === "title" || name === "alt" || name === "colspan" || name === "rowspan";
        if (!allowed || name.indexOf("on") === 0 || name === "srcdoc" || name === "style" || name === "formaction") node.removeAttribute(attribute.name);
        else if (name === "href" && !/^(?:https?:\/\/|mailto:|#)/i.test(value)) node.removeAttribute(attribute.name);
      });
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer nofollow");
      }
    });
    return documentNode.body.innerHTML;
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

  window.renderGenMail = function renderGenMail(body) {
    if (!body) return;
    if (typeof body.__nxCleanup === "function") body.__nxCleanup();
    var alive = true;
    var controllers = Object.create(null);
    var timers = Object.create(null);

    body.innerHTML = "" +
      '<main class="ngm">' +
        '<section class="ngm-hero">' +
          '<span class="ngm-hero-icon"><i class="fa-solid fa-envelope-open-text"></i></span>' +
          '<div><span class="ngm-kicker">ADVANCED TEMP MAIL</span><h2>GenMail</h2><p>Email sementara cepat untuk menerima pesan tanpa membagikan alamat email utama.</p></div>' +
        '</section>' +
        '<section class="ngm-card ngm-current">' +
          '<div class="ngm-card-head"><div><span class="ngm-label">EMAIL AKTIF</span><strong id="ngmCurrentEmail">Belum ada email aktif</strong></div><span class="ngm-status-dot" aria-label="Status GenMail"></span></div>' +
          '<p id="ngmCurrentHint">Buat alamat sementara untuk mulai menerima pesan.</p>' +
          '<div class="ngm-actions">' +
            '<button class="ngm-button ngm-button-soft" id="ngmCopy" type="button" hidden><i class="fa-regular fa-copy"></i><span>Copy Email</span></button>' +
            '<button class="ngm-button ngm-button-primary" id="ngmOpenInbox" type="button" hidden><i class="fa-solid fa-inbox"></i><span>Open Inbox</span></button>' +
          '</div>' +
        '</section>' +
        '<nav class="ngm-tabs" aria-label="Menu GenMail">' +
          '<button class="is-active" id="ngmNewTab" type="button"><i class="fa-solid fa-plus"></i><span>New Email</span></button>' +
          '<button id="ngmInboxTab" type="button"><i class="fa-solid fa-inbox"></i><span>Inbox</span><b id="ngmInboxCount">0</b></button>' +
        '</nav>' +
        '<section class="ngm-card" id="ngmGeneratePanel">' +
          '<div class="ngm-section-title"><span class="ngm-section-icon"><i class="fa-solid fa-at"></i></span><div><strong>Buat email sementara</strong><small>Username boleh dikosongkan untuk nama acak.</small></div></div>' +
          '<label for="ngmUsername">Username <span>opsional</span></label>' +
          '<input id="ngmUsername" type="text" inputmode="text" autocomplete="off" maxlength="64" placeholder="Contoh: nexora123">' +
          '<div class="ngm-domain-row"><label for="ngmDomain">Domain</label><button id="ngmRetryDomains" type="button" hidden><i class="fa-solid fa-rotate-right"></i> Coba lagi</button></div>' +
          '<select id="ngmDomain" disabled><option value="">Mengambil domain…</option></select>' +
          '<p class="ngm-field-state" id="ngmDomainState" role="status" aria-live="polite">Menyiapkan pilihan domain.</p>' +
          '<button class="ngm-button ngm-button-primary ngm-wide" id="ngmGenerate" type="button" disabled><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate Email</span></button>' +
          '<p class="ngm-feedback" id="ngmGenerateState" role="status" aria-live="polite"></p>' +
        '</section>' +
        '<section class="ngm-card" id="ngmInboxPanel" hidden>' +
          '<div class="ngm-inbox-head"><div><span class="ngm-label">INBOX</span><strong id="ngmInboxTitle">Belum ada email aktif</strong></div><button class="ngm-icon-button" id="ngmRefresh" type="button" aria-label="Refresh Inbox" disabled><i class="fa-solid fa-rotate-right"></i></button></div>' +
          '<p class="ngm-last-refresh" id="ngmLastRefresh">Inbox belum diperiksa.</p>' +
          '<div class="ngm-inbox-list" id="ngmInboxList"></div>' +
          '<button class="ngm-button ngm-button-soft ngm-wide" id="ngmRefreshWide" type="button" disabled><i class="fa-solid fa-rotate-right"></i><span>Refresh Inbox</span></button>' +
        '</section>' +
        '<section class="ngm-card ngm-reader" id="ngmReader" hidden>' +
          '<button class="ngm-back" id="ngmBackInbox" type="button"><i class="fa-solid fa-arrow-left"></i><span>Kembali ke inbox</span></button>' +
          '<div id="ngmReaderContent"></div>' +
        '</section>' +
        '<p class="ngm-privacy"><i class="fa-solid fa-shield-halved"></i> API key tersimpan di server Nexora. Email aktif hanya dipertahankan selama tab ini masih terbuka.</p>' +
      '</main>';

    var currentEmail = body.querySelector("#ngmCurrentEmail");
    var currentHint = body.querySelector("#ngmCurrentHint");
    var copyButton = body.querySelector("#ngmCopy");
    var openInbox = body.querySelector("#ngmOpenInbox");
    var newTab = body.querySelector("#ngmNewTab");
    var inboxTab = body.querySelector("#ngmInboxTab");
    var inboxCount = body.querySelector("#ngmInboxCount");
    var generatePanel = body.querySelector("#ngmGeneratePanel");
    var inboxPanel = body.querySelector("#ngmInboxPanel");
    var reader = body.querySelector("#ngmReader");
    var readerContent = body.querySelector("#ngmReaderContent");
    var username = body.querySelector("#ngmUsername");
    var domain = body.querySelector("#ngmDomain");
    var domainState = body.querySelector("#ngmDomainState");
    var retryDomains = body.querySelector("#ngmRetryDomains");
    var generate = body.querySelector("#ngmGenerate");
    var generateState = body.querySelector("#ngmGenerateState");
    var inboxTitle = body.querySelector("#ngmInboxTitle");
    var lastRefresh = body.querySelector("#ngmLastRefresh");
    var inboxList = body.querySelector("#ngmInboxList");
    var refresh = body.querySelector("#ngmRefresh");
    var refreshWide = body.querySelector("#ngmRefreshWide");
    var backInbox = body.querySelector("#ngmBackInbox");

    function setButtonBusy(button, busy, idleText, busyText) {
      if (!button) return;
      button.disabled = busy;
      var icon = button.querySelector("i");
      var label = button.querySelector("span");
      if (icon) icon.className = busy ? "fa-solid fa-circle-notch fa-spin" : (button === generate ? "fa-solid fa-wand-magic-sparkles" : "fa-solid fa-rotate-right");
      if (label) label.textContent = busy ? busyText : idleText;
    }

    function showPanel(name) {
      var isNew = name === "new";
      newTab.classList.toggle("is-active", isNew);
      inboxTab.classList.toggle("is-active", !isNew);
      generatePanel.hidden = !isNew;
      inboxPanel.hidden = isNew;
      reader.hidden = true;
      sessionState.selectedMessage = null;
    }

    function renderCurrent() {
      var hasEmail = Boolean(sessionState.activeEmail);
      currentEmail.textContent = hasEmail ? sessionState.activeEmail : "Belum ada email aktif";
      currentHint.textContent = hasEmail ? "Alamat ini siap dipakai untuk menerima pesan sementara." : "Buat alamat sementara untuk mulai menerima pesan.";
      copyButton.hidden = !hasEmail;
      openInbox.hidden = !hasEmail;
      inboxTitle.textContent = hasEmail ? sessionState.activeEmail : "Belum ada email aktif";
      refresh.disabled = !hasEmail || Boolean(sessionState.loading.inbox);
      refreshWide.disabled = refresh.disabled;
    }

    function renderDomainOptions() {
      domain.textContent = "";
      if (!sessionState.domains.length) {
        var empty = document.createElement("option");
        empty.value = "";
        empty.textContent = "Domain belum tersedia";
        domain.appendChild(empty);
        domain.disabled = true;
        generate.disabled = true;
        return;
      }
      sessionState.domains.forEach(function (value) {
        var option = document.createElement("option");
        option.value = value;
        option.textContent = "@" + value;
        domain.appendChild(option);
      });
      domain.disabled = false;
      generate.disabled = Boolean(sessionState.loading.generate);
    }

    function emptyInbox(icon, title, text, buttonText) {
      inboxList.textContent = "";
      var wrap = document.createElement("div");
      wrap.className = "ngm-empty";
      wrap.innerHTML = '<i class="fa-solid ' + icon + '"></i><strong></strong><span></span>';
      wrap.querySelector("strong").textContent = title;
      wrap.querySelector("span").textContent = text;
      if (buttonText) {
        var button = document.createElement("button");
        button.type = "button";
        button.className = "ngm-button ngm-button-soft";
        button.textContent = buttonText;
        button.addEventListener("click", function () { sessionState.activeEmail ? loadInbox(true) : showPanel("new"); });
        wrap.appendChild(button);
      }
      inboxList.appendChild(wrap);
    }

    function renderInbox() {
      inboxCount.textContent = String(sessionState.messages.length);
      lastRefresh.textContent = sessionState.lastRefresh ? "Terakhir diperiksa " + timeLabel(sessionState.lastRefresh) + "." : "Inbox belum diperiksa.";
      if (!sessionState.activeEmail) {
        emptyInbox("fa-envelope", "Belum ada email aktif", "Buat alamat sementara terlebih dahulu.", "Generate Temp Mail");
        return;
      }
      if (sessionState.loading.inbox) {
        emptyInbox("fa-circle-notch fa-spin", "Memeriksa inbox", "Menunggu pesan terbaru dari layanan email.", "");
        return;
      }
      if (sessionState.error) {
        emptyInbox("fa-triangle-exclamation", "Gagal mengambil inbox", sessionState.error, "Coba lagi");
        return;
      }
      if (!sessionState.messages.length) {
        emptyInbox("fa-inbox", "Belum ada pesan masuk", "Tekan Refresh setelah email ini dipakai untuk mendaftar.", "Refresh");
        return;
      }
      inboxList.textContent = "";
      sessionState.messages.forEach(function (message, index) {
        var card = document.createElement("button");
        card.type = "button";
        card.className = "ngm-message-card";
        card.disabled = !message.ref;
        var top = document.createElement("span");
        top.className = "ngm-message-top";
        var sender = document.createElement("strong");
        sender.textContent = message.sender || "Pengirim tidak dicantumkan";
        var time = document.createElement("time");
        time.textContent = timeLabel(message.time);
        top.appendChild(sender); top.appendChild(time);
        var subject = document.createElement("b");
        subject.textContent = message.subject || "Tanpa subjek";
        card.appendChild(top); card.appendChild(subject);
        if (message.preview) {
          var preview = document.createElement("span");
          preview.className = "ngm-message-preview";
          preview.textContent = message.preview;
          card.appendChild(preview);
        }
        if (!message.ref) {
          var unavailable = document.createElement("small");
          unavailable.textContent = "Layanan tidak memberikan informasi untuk membuka pesan ini.";
          card.appendChild(unavailable);
        } else card.addEventListener("click", function () { loadMessage(message, index); });
        inboxList.appendChild(card);
      });
    }

    function renderReader(message, summary) {
      readerContent.textContent = "";
      var head = document.createElement("header");
      var subject = document.createElement("h3");
      subject.textContent = message.subject || summary.subject || "Tanpa subjek";
      head.appendChild(subject);
      var meta = document.createElement("div");
      if (message.sender || summary.sender) {
        var sender = document.createElement("span");
        sender.textContent = "Dari: " + (message.sender || summary.sender);
        meta.appendChild(sender);
      }
      if (message.time || summary.time) {
        var time = document.createElement("span");
        time.textContent = timeLabel(message.time || summary.time);
        meta.appendChild(time);
      }
      head.appendChild(meta); readerContent.appendChild(head);
      var content = document.createElement("article");
      content.className = "ngm-message-body";
      if (message.html) {
        content.classList.add("ngm-message-html");
        content.innerHTML = sanitizeEmailHtml(message.html);
      } else content.textContent = message.text || "Isi pesan tidak diberikan oleh layanan email.";
      readerContent.appendChild(content);
      if (Array.isArray(message.links) && message.links.length) {
        var links = document.createElement("div");
        links.className = "ngm-links";
        var label = document.createElement("strong"); label.textContent = "Link dalam email"; links.appendChild(label);
        message.links.forEach(function (href) {
          if (!/^(?:https?:\/\/|mailto:)/i.test(href)) return;
          var anchor = document.createElement("a");
          anchor.href = href; anchor.target = "_blank"; anchor.rel = "noopener noreferrer nofollow";
          anchor.textContent = href;
          links.appendChild(anchor);
        });
        readerContent.appendChild(links);
      }
    }

    function request(action, params, slot) {
      if (controllers[slot]) controllers[slot].abort();
      var controller = new AbortController();
      controllers[slot] = controller;
      var query = new URLSearchParams({ action: action });
      Object.keys(params || {}).forEach(function (key) { if (params[key]) query.set(key, params[key]); });
      timers[slot] = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
      return fetch("/api/genmail?" + query.toString(), { method: "GET", headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal })
        .then(function (response) {
          return response.text().then(function (raw) {
            var payload;
            try { payload = raw ? JSON.parse(raw) : {}; }
            catch (_) { throw new Error("Layanan email mengirim respons yang tidak dapat dibaca."); }
            if (!response.ok || payload.ok !== true) {
              var failure = new Error(payload.message || (response.status === 429 ? "Batas request sementara tercapai. Coba lagi nanti." : "Layanan email sedang bermasalah."));
              failure.status = response.status;
              throw failure;
            }
            return payload;
          });
        })
        .catch(function (error) {
          if (error.name === "AbortError" && alive && document.visibilityState !== "hidden") throw new Error("Layanan email terlalu lama merespons. Coba lagi.");
          throw error;
        })
        .finally(function () {
          clearTimeout(timers[slot]); delete timers[slot];
          if (controllers[slot] === controller) delete controllers[slot];
        });
    }

    function loadDomains(force) {
      if (sessionState.loading.domains) return;
      if (!force && domainCache.values.length && domainCache.expiresAt > Date.now()) {
        sessionState.domains = domainCache.values.slice();
        domainState.textContent = sessionState.domains.length + " domain tersedia.";
        retryDomains.hidden = true;
        renderDomainOptions();
        return;
      }
      sessionState.loading.domains = true;
      domain.disabled = true; generate.disabled = true; retryDomains.hidden = true;
      domainState.textContent = "Mengambil domain yang tersedia…";
      request("domains", {}, "domains").then(function (payload) {
        if (!alive) return;
        var values = payload.data && Array.isArray(payload.data.domains) ? payload.data.domains.filter(function (item) { return typeof item === "string" && item; }) : [];
        sessionState.domains = values;
        if (values.length) {
          domainCache = { values: values.slice(), expiresAt: Date.now() + DOMAIN_CACHE_MS };
          domainState.textContent = values.length + " domain tersedia.";
          retryDomains.hidden = true;
        } else {
          domainState.textContent = "Belum ada domain yang tersedia. Coba lagi nanti.";
          retryDomains.hidden = false;
        }
      }).catch(function (error) {
        if (!alive || error.name === "AbortError") return;
        sessionState.domains = [];
        domainState.textContent = safeMessage(error, "Gagal mengambil domain. Coba lagi sebentar.");
        retryDomains.hidden = false;
      }).finally(function () {
        sessionState.loading.domains = false;
        if (alive) renderDomainOptions();
      });
    }

    function generateEmail() {
      if (sessionState.loading.generate || !domain.value) return;
      var name = username.value.trim();
      if (name && !/^[a-z0-9._-]{1,64}$/i.test(name)) {
        generateState.textContent = "Username hanya boleh memakai huruf, angka, titik, garis bawah, atau tanda minus.";
        generateState.className = "ngm-feedback is-error";
        return;
      }
      sessionState.loading.generate = true;
      generateState.textContent = "Membuat alamat email…";
      generateState.className = "ngm-feedback is-loading";
      setButtonBusy(generate, true, "Generate Email", "Sedang membuat…");
      request("generate", { username: name, domain: domain.value }, "generate").then(function (payload) {
        if (!alive) return;
        var email = String(payload.data && payload.data.email || "");
        if (!email) throw new Error("Alamat email tidak ditemukan pada respons layanan.");
        sessionState.activeEmail = email;
        sessionState.messages = [];
        sessionState.selectedMessage = null;
        sessionState.error = "";
        sessionState.lastRefresh = 0;
        generateState.textContent = "Email berhasil dibuat dan sudah menjadi email aktif.";
        generateState.className = "ngm-feedback is-ok";
        renderCurrent(); renderInbox();
      }).catch(function (error) {
        if (!alive || error.name === "AbortError") return;
        generateState.textContent = safeMessage(error, "Gagal membuat email. Coba lagi sebentar.");
        generateState.className = "ngm-feedback is-error";
      }).finally(function () {
        sessionState.loading.generate = false;
        if (alive) { setButtonBusy(generate, false, "Generate Email", "Sedang membuat…"); generate.disabled = !sessionState.domains.length; }
      });
    }

    function loadInbox(force) {
      if (!sessionState.activeEmail || sessionState.loading.inbox) { showPanel(sessionState.activeEmail ? "inbox" : "new"); return; }
      var elapsed = Date.now() - sessionState.lastRefresh;
      if (sessionState.lastRefresh && elapsed < REFRESH_COOLDOWN_MS) { showPanel("inbox"); renderInbox(); return; }
      sessionState.loading.inbox = true;
      sessionState.error = "";
      showPanel("inbox"); renderCurrent(); renderInbox();
      setButtonBusy(refreshWide, true, "Refresh Inbox", "Memeriksa…");
      request("inbox", { email: sessionState.activeEmail }, "inbox").then(function (payload) {
        if (!alive) return;
        sessionState.messages = payload.data && Array.isArray(payload.data.messages) ? payload.data.messages : [];
        sessionState.lastRefresh = Date.now();
      }).catch(function (error) {
        if (!alive || error.name === "AbortError") return;
        sessionState.error = safeMessage(error, "Gagal mengambil inbox. Coba lagi sebentar.");
      }).finally(function () {
        sessionState.loading.inbox = false;
        if (alive) { renderCurrent(); renderInbox(); setButtonBusy(refreshWide, false, "Refresh Inbox", "Memeriksa…"); }
      });
    }

    function loadMessage(summary, index) {
      if (!summary.ref || sessionState.loading.message) return;
      sessionState.loading.message = true;
      sessionState.selectedMessage = index;
      inboxPanel.hidden = true; generatePanel.hidden = true; reader.hidden = false;
      readerContent.innerHTML = '<div class="ngm-empty"><i class="fa-solid fa-circle-notch fa-spin"></i><strong>Membuka pesan</strong><span>Isi email sedang disiapkan.</span></div>';
      request("message", { email: sessionState.activeEmail, link: summary.ref }, "message").then(function (payload) {
        if (!alive) return;
        var message = payload.data && payload.data.message || {};
        renderReader(message, summary);
      }).catch(function (error) {
        if (!alive) return;
        readerContent.textContent = "";
        var failure = document.createElement("div");
        failure.className = "ngm-empty is-error";
        var icon = document.createElement("i"); icon.className = "fa-solid fa-triangle-exclamation";
        var title = document.createElement("strong"); title.textContent = "Pesan gagal dibuka";
        var text = document.createElement("span"); text.textContent = safeMessage(error, "Coba buka kembali beberapa saat lagi.");
        failure.appendChild(icon); failure.appendChild(title); failure.appendChild(text); readerContent.appendChild(failure);
      }).finally(function () { sessionState.loading.message = false; });
    }

    newTab.addEventListener("click", function () { showPanel("new"); });
    inboxTab.addEventListener("click", function () { showPanel("inbox"); renderInbox(); });
    openInbox.addEventListener("click", function () { loadInbox(false); });
    generate.addEventListener("click", generateEmail);
    retryDomains.addEventListener("click", function () { loadDomains(true); });
    refresh.addEventListener("click", function () { loadInbox(true); });
    refreshWide.addEventListener("click", function () { loadInbox(true); });
    backInbox.addEventListener("click", function () { showPanel("inbox"); renderInbox(); });
    copyButton.addEventListener("click", function () {
      copyText(sessionState.activeEmail).then(function () {
        if (!alive) return;
        copyButton.querySelector("span").textContent = "Tersalin";
        setTimeout(function () { if (alive) copyButton.querySelector("span").textContent = "Copy Email"; }, 1400);
      }).catch(function () { if (alive) currentHint.textContent = "Email gagal disalin. Tekan lama alamat email lalu pilih Salin."; });
    });

    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      ["inbox", "message"].forEach(function (slot) { if (controllers[slot]) controllers[slot].abort(); });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    renderCurrent(); renderInbox(); loadDomains(false);
    body.__nxCleanup = function () {
      alive = false;
      Object.keys(controllers).forEach(function (key) { controllers[key].abort(); });
      Object.keys(timers).forEach(function (key) { clearTimeout(timers[key]); });
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  };
})();
