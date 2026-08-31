/* Nexora Placeholder Studio — 1,000-word prompt guard */
(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NexoraPlaceholderPromptLimit = api;

  if (!root || !root.document) return;
  api.install(root.document);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var WORD_LIMIT = 1000;
  var BOUND_ATTRIBUTE = "data-nx-placeholder-word-limit";
  var counterSequence = 0;

  function words(value) {
    var normalized = String(value == null ? "" : value).trim();
    return normalized ? normalized.split(/\s+/u) : [];
  }

  function countWords(value) {
    return words(value).length;
  }

  function truncateToWordLimit(value, limit) {
    var source = String(value == null ? "" : value);
    var maximum = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : WORD_LIMIT;
    var matcher = /\S+/gu;
    var match;
    var count = 0;
    var end = source.length;

    while ((match = matcher.exec(source))) {
      count += 1;
      if (count === maximum) end = matcher.lastIndex;
      if (count > maximum) return source.slice(0, end).trimEnd();
    }
    return source;
  }

  function hasStudioContext(textarea) {
    var node = textarea.parentElement;
    var depth = 0;
    while (node && node.tagName !== "BODY" && depth < 10) {
      var text = String(node.textContent || "");
      if (/NEXORA\s+PLACEHOLDER\s+STUDIO/i.test(text)) return true;
      if (/Dimension\s+Presets/i.test(text) && /(?:Prompt|Deskripsi)/i.test(text)) return true;
      node = node.parentElement;
      depth += 1;
    }
    return false;
  }

  function isPromptField(textarea) {
    if (!textarea || textarea.tagName !== "TEXTAREA") return false;
    var label = textarea.closest("label");
    var signature = [
      textarea.id,
      textarea.name,
      textarea.getAttribute("placeholder"),
      textarea.getAttribute("aria-label"),
      label && label.textContent
    ].filter(Boolean).join(" ");
    return /(?:^|\W)prompt(?:\W|$)/i.test(signature) && hasStudioContext(textarea);
  }

  function bindPrompt(textarea, documentRef) {
    if (textarea.hasAttribute(BOUND_ATTRIBUTE)) return false;
    textarea.setAttribute(BOUND_ATTRIBUTE, String(WORD_LIMIT));
    textarea.removeAttribute("maxlength");

    var counter = documentRef.createElement("div");
    var counterId = "nxPlaceholderWordCounter" + (++counterSequence);
    counter.id = counterId;
    counter.className = "nx-placeholder-word-counter";
    counter.setAttribute("aria-live", "polite");
    counter.innerHTML = '<span data-nx-placeholder-word-count>0</span><span aria-hidden="true"> / </span><span>1000 kata</span>';
    textarea.insertAdjacentElement("afterend", counter);

    var descriptions = String(textarea.getAttribute("aria-describedby") || "").trim().split(/\s+/).filter(Boolean);
    if (descriptions.indexOf(counterId) === -1) descriptions.push(counterId);
    textarea.setAttribute("aria-describedby", descriptions.join(" "));

    var countNode = counter.querySelector("[data-nx-placeholder-word-count]");
    var warned = false;

    function update() {
      var current = countWords(textarea.value);
      if (current > WORD_LIMIT) {
        textarea.value = truncateToWordLimit(textarea.value, WORD_LIMIT);
        current = WORD_LIMIT;
        warned = true;
        counter.classList.add("is-limit");
        counter.setAttribute("data-limit-message", "Batas 1000 kata tercapai");
      } else {
        counter.classList.toggle("is-limit", current === WORD_LIMIT);
        if (!warned || current < WORD_LIMIT) counter.removeAttribute("data-limit-message");
        if (current < WORD_LIMIT) warned = false;
      }
      countNode.textContent = String(current);
    }

    textarea.addEventListener("input", update, true);
    textarea.addEventListener("change", update, true);
    update();
    return true;
  }

  function scan(documentRef) {
    return Array.from(documentRef.querySelectorAll("textarea"))
      .filter(isPromptField)
      .reduce(function (total, textarea) {
        return total + (bindPrompt(textarea, documentRef) ? 1 : 0);
      }, 0);
  }

  function install(documentRef) {
    if (!documentRef || !documentRef.documentElement) return null;
    var scheduled = false;
    function scheduleScan() {
      if (scheduled) return;
      scheduled = true;
      var schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : function (callback) { return setTimeout(callback, 0); };
      schedule(function () {
        scheduled = false;
        scan(documentRef);
      });
    }

    if (documentRef.readyState === "loading") {
      documentRef.addEventListener("DOMContentLoaded", scheduleScan, { once: true });
    } else {
      scheduleScan();
    }

    var observer = new MutationObserver(scheduleScan);
    observer.observe(documentRef.documentElement, { childList: true, subtree: true });
    return observer;
  }

  return {
    WORD_LIMIT: WORD_LIMIT,
    countWords: countWords,
    truncateToWordLimit: truncateToWordLimit,
    isPromptField: isPromptField,
    bindPrompt: bindPrompt,
    scan: scan,
    install: install
  };
});
