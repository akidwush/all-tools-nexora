(function (root) {
  "use strict";
  var prefix = "nexora.classics.v1.";
  var sources = {
    china: { origin: "https://zh.wikisource.org", label: "Chinese Wikisource" },
    japan: {
      origin: "https://ja.wikisource.org",
      label: "Japanese Wikisource",
    },
    korea: { origin: "https://ko.wikisource.org", label: "Korean Wikisource" },
  };
  function read(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(prefix + key)) || fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  function scope(id) {
    return id ? "user." + id : "guest";
  }
  function list(kind, id) {
    var data = read(scope(id) + "." + kind, []);
    return Array.isArray(data)
      ? data.filter((p) =>
        p && Object.hasOwn(sources, p.source) &&
        typeof p.page_title === "string"
      ).slice(0, 100)
      : [];
  }
  function save(kind, id, row) {
    var items = list(kind, id).filter((p) =>
      p.source !== row.source || p.page_title !== row.page_title
    );
    items.unshift(row);
    return write(scope(id) + "." + kind, items.slice(0, 100));
  }
  function remove(kind, id, row) {
    write(
      scope(id) + "." + kind,
      list(kind, id).filter((p) =>
        p.source !== row.source || p.page_title !== row.page_title
      ),
    );
  }
  function safeHTML(raw, source) {
    var template = document.createElement("template");
    template.innerHTML = String(raw || "");
    template.content.querySelectorAll(
      "script,style,iframe,object,embed,svg,math,form,input,button,nav",
    ).forEach(function (el) {
      el.remove();
    });
    var allowed =
      "div p br ruby rt rp em strong b i blockquote h1 h2 h3 h4 h5 h6 ul ol li sup sub a hr table tbody tr td th caption"
        .split(" ");
    template.content.querySelectorAll("*").forEach(function (el) {
      var tag = el.localName;
      if (!allowed.includes(tag)) {
        el.replaceWith(...Array.from(el.childNodes));
        return;
      }
      Array.from(el.attributes).forEach(function (a) {
        if (a.name === "id" && /^[\w:.-]{1,150}$/.test(a.value)) return;
        if (tag === "a" && a.name === "href" && sources[source]) {
          if (/^#[\w:%.\-]{1,450}$/.test(a.value)) return;
          try {
            var url = new URL(a.value, sources[source].origin);
            if (
              url.protocol === "https:" && url.origin === sources[source].origin
            ) {
              el.setAttribute("href", url.href);
              return;
            }
          } catch { /* remove */ }
        }
        el.removeAttribute(a.name);
      });
      if (tag === "a" && !(el.getAttribute("href") || "").startsWith("#")) {
        el.target = "_blank";
        el.rel = "noopener noreferrer";
      }
    });
    return template.content;
  }
  function cachePage(page) {
    var pages = read("pages", []);
    if (!Array.isArray(pages)) pages = [];
    pages = pages.filter((p) =>
      p.source !== page.source || p.pageTitle !== page.pageTitle
    );
    pages.unshift(page);
    pages = pages.slice(0, 5);
    while (JSON.stringify(pages).length > 1500000) pages.pop();
    write("pages", pages);
  }
  function cachedPage(source, title) {
    var pages = read("pages", []);
    return Array.isArray(pages)
      ? pages.find((p) =>
        p.source === source && p.pageTitle === title &&
        typeof p.html === "string" && Array.isArray(p.paragraphs)
      )
      : null;
  }
  root.NexoraClassicsState = Object.freeze({
    sources: sources,
    list: list,
    save: save,
    remove: remove,
    write: write,
    scope: scope,
    safeHTML: safeHTML,
    cachePage: cachePage,
    cachedPage: cachedPage,
  });
})(window);
