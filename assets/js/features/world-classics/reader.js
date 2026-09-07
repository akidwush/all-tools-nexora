(function (root) {
  "use strict";
  root.renderWorldClassics = function (body) {
    if (body.__nxCleanup) body.__nxCleanup();
    var api = root.NexoraSupabase, store = root.NexoraClassicsState;
    var page = null,
      workTitle = "",
      chapters = [],
      translations = {},
      source = "japan",
      closed = false,
      readingTimer = null,
      dirty = false,
      loading = false,
      version = 0,
      searchVersion = 0,
      nextCursor = null,
      controller = null,
      searchController = null,
      owner = api.userId(),
      historyQueue = Promise.resolve();
    body.innerHTML =
      '<section class="wc-reader"><header class="wc-intro"><span class="wc-eyebrow">NEXORA LIBRARY</span><h2>World Classics Reader</h2><p>Sastra klasik China, Jepang, dan Korea. Baca teks asli atau terjemahan Indonesia.</p></header><form class="wc-search"><label>Sumber<select name="source"><option value="china">China</option><option value="japan" selected>Jepang</option><option value="korea">Korea</option></select></label><label class="wc-query">Judul karya<input name="query" maxlength="120" placeholder="源氏物語" required autocomplete="off"></label><button type="submit">Cari karya</button></form><p class="wc-status" role="status" aria-live="polite"></p><details class="wc-shelf" open><summary>Continue Reading &amp; Bookmark</summary><div class="wc-shelf-items"></div><p class="wc-sync"></p></details><div class="wc-results"></div><div class="wc-work" hidden><div class="wc-work-head"><h3 class="wc-title"></h3><p class="wc-attribution"></p><label>Bab<select class="wc-chapters"></select></label><button class="wc-more-chapters" hidden>Muat bab lainnya</button></div><div class="wc-toolbar"><label>Tampilan<select class="wc-view"><option value="original">Original</option><option value="indonesia">Indonesia</option><option value="bilingual">Bilingual</option></select></label><label>Mode terjemahan<select class="wc-mode"><option>Literal</option><option selected>Natural</option><option>Novel</option></select></label><button class="wc-translate">Terjemahkan bab</button><button class="wc-bookmark" aria-pressed="false">Simpan bookmark</button><label>Ukuran teks<input class="wc-font" type="range" min="16" max="28" value="20"></label></div><p class="wc-translation-status" role="status" aria-live="polite"></p><div class="wc-progress"><progress max="100" value="0" aria-label="Progres membaca"></progress><span>0%</span></div><article class="wc-content" tabindex="0" aria-label="Isi bacaan"></article><nav class="wc-navigation" aria-label="Navigasi bab"><button class="wc-prev">Bab sebelumnya</button><button class="wc-next">Bab berikutnya</button></nav></div></section>';
    var el = function (selector) {
        return body.querySelector(selector);
      },
      content = el(".wc-content"),
      form = el(".wc-search");
    function message(text) {
      if (!closed) el(".wc-status").textContent = text || "";
    }
    function status(text) {
      if (!closed) el(".wc-translation-status").textContent = text || "";
    }
    function syncText(text) {
      if (!closed) {
        el(".wc-sync").textContent = text ||
          (owner
            ? "Bookmark dan riwayat disinkronkan ke akun."
            : "Mode tamu: bookmark dan riwayat tersimpan di perangkat ini.");
      }
    }
    function button(text, fn) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.onclick = fn;
      return b;
    }
    function progress() {
      var max = content.scrollHeight - content.clientHeight;
      return max > 0
        ? Math.round(Math.min(100, Math.max(0, content.scrollTop / max * 100)))
        : 100;
    }
    function row() {
      return page
        ? {
          source: page.source,
          work_title: workTitle,
          page_title: page.pageTitle,
          chapter_title: page.title || page.pageTitle,
          reading_progress: progress(),
          scroll_position: Math.max(
            0,
            Math.min(10000000, Math.round(content.scrollTop)),
          ),
          last_read_at: new Date().toISOString(),
        }
        : null;
    }
    async function cloudSave(kind, item, id) {
      if (!id || api.userId() !== id) return;
      var payload = { ...item, user_id: id };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;
      if (kind === "history") delete payload.scroll_position;
      else delete payload.last_read_at;
      await api.rows(
        "world_classics_" + kind,
        { on_conflict: "user_id,source,page_title" },
        "POST",
        payload,
      );
    }
    function flush() {
      clearTimeout(readingTimer);
      readingTimer = null;
      if (!dirty || !page) return;
      dirty = false;
      var item = row(), id = owner;
      store.save("history", id, item);
      drawShelf();
      historyQueue = historyQueue.catch(function () {}).then(function () {
        return cloudSave("history", item, id);
      }).catch(function () {
        if (owner === id) {
          syncText(
            "Sinkronisasi tertunda. Riwayat tetap tersimpan di perangkat.",
          );
        }
      });
    }
    function markProgress() {
      if (!page || loading || closed) return;
      dirty = true;
      var p = progress();
      el("progress").value = p;
      el(".wc-progress span").textContent = p + "%";
      if (!readingTimer) readingTimer = setTimeout(flush, 5000);
    }
    function drawShelf() {
      if (closed) return;
      var target = el(".wc-shelf-items");
      target.replaceChildren();
      ["history", "bookmarks"].forEach(function (kind) {
        var rows = store.list(kind, owner);
        if (!rows.length) return;
        var h = document.createElement("h4");
        h.textContent = kind === "history" ? "Continue Reading" : "Bookmark";
        target.append(h);
        rows.slice(0, 12).forEach(function (item) {
          target.append(
            button(
              item.work_title + " · " + item.chapter_title + " · " +
                Math.round(Number(item.reading_progress) || 0) + "%",
              function () {
                openPage(item.source, item.page_title, item.work_title, item);
              },
            ),
          );
        });
      });
      if (!target.children.length) {
        target.textContent = "Belum ada bacaan tersimpan.";
      }
      bookmarkState();
    }
    function bookmarkState() {
      if (!page) return;
      var saved = store.list("bookmarks", owner).some((p) =>
        p.source === page.source && p.page_title === page.pageTitle
      );
      el(".wc-bookmark").textContent = saved
        ? "Hapus bookmark"
        : "Simpan bookmark";
      el(".wc-bookmark").setAttribute("aria-pressed", String(saved));
    }
    async function sync() {
      var id = owner;
      syncText();
      drawShelf();
      if (!id) return;
      try {
        for (const kind of ["history", "bookmarks"]) {
          var remote = await api.rows("world_classics_" + kind, {
            user_id: "eq." + id,
            select: "*",
            order: kind === "history" ? "last_read_at.desc" : "updated_at.desc",
            limit: "100",
          });
          if (closed || owner !== id || api.userId() !== id) return;
          var local = store.list(kind, id);
          // Reconcile only the same account. Guest data is never silently uploaded.
          for (
            const item of (kind === "history" ? local.slice().reverse() : [])
          ) {
            var existing = remote.find((p) =>
              p.source === item.source && p.page_title === item.page_title
            );
            if (
              !existing ||
              Date.parse(item.last_read_at || item.updated_at || 0) >
                Date.parse(existing.last_read_at || existing.updated_at || 0)
            ) {
              await cloudSave(kind, item, id);
              remote = remote.filter((p) =>
                p.source !== item.source || p.page_title !== item.page_title
              );
              remote.unshift(item);
            }
          }
          if (closed || owner !== id) return;
          remote.sort(function (a, b) {
            return Date.parse(b.last_read_at || b.updated_at || 0) -
              Date.parse(a.last_read_at || a.updated_at || 0);
          });
          store.write(store.scope(id) + "." + kind, remote.slice(0, 100));
        }
        drawShelf();
        syncText();
      } catch {
        syncText(
          "Sinkronisasi belum tersedia. Data perangkat tetap dapat digunakan.",
        );
      }
    }
    function render() {
      if (!page || closed) return;
      content.replaceChildren();
      var mode = el(".wc-mode").value,
        view = el(".wc-view").value,
        t = translations[mode];
      if (view === "original" || !t) {
        content.append(store.safeHTML(page.html, page.source));
        if (view !== "original") {
          status(
            "Terjemahan mode " + mode +
              " belum tersedia. Teks asli ditampilkan.",
          );
        }
      } else {t.paragraphs.forEach(function (p, i) {
          var block = document.createElement("section");
          block.className = "wc-paragraph";
          if (view === "bilingual") {
            var original = document.createElement("div");
            original.className = "wc-original";
            original.lang =
              { china: "zh", japan: "ja", korea: "ko" }[page.source];
            original.append(
              store.safeHTML(page.paragraphs[i].html || "", page.source),
            );
            if (!original.textContent) original.textContent = p.original;
            block.append(original);
          }
          var translated = document.createElement("p");
          translated.lang = "id";
          translated.textContent = p.translated;
          block.append(translated);
          content.append(block);
        });}
      content.lang = view === "indonesia"
        ? "id"
        : { china: "zh", japan: "ja", korea: "ko" }[page.source];
      bookmarkState();
    }
    function redisplay() {
      var before = progress();
      render();
      content.scrollTop =
        Math.max(0, content.scrollHeight - content.clientHeight) * before / 100;
      markProgress();
    }
    function chapterSelect() {
      var select = el(".wc-chapters");
      select.replaceChildren();
      if (!chapters.some((c) => c.pageTitle === page.pageTitle)) {
        chapters.unshift({
          title: page.title || page.pageTitle,
          pageTitle: page.pageTitle,
        });
      }
      chapters.forEach(function (c) {
        var option = document.createElement("option");
        option.value = c.pageTitle;
        option.textContent = c.title;
        select.append(option);
      });
      select.value = page.pageTitle;
      var index = chapters.findIndex((c) => c.pageTitle === page.pageTitle);
      el(".wc-prev").disabled = index <= 0;
      el(".wc-next").disabled = index < 0 || index === chapters.length - 1;
    }
    async function openPage(selected, title, work, resume) {
      flush();
      if (controller) controller.abort();
      controller = new AbortController();
      var current = ++version, signal = controller.signal;
      source = selected;
      form.elements.source.value = source;
      workTitle = work || title;
      loading = true;
      translations = {};
      nextCursor = null;
      el(".wc-more-chapters").hidden = true;
      status("");
      el(".wc-translate").disabled = false;
      message("Bab sedang dimuat…");
      var cached = store.cachedPage(source, title);
      if (cached) {
        page = cached;
        el(".wc-work").hidden = false;
        render();
      } else {
        page = null;
        el(".wc-work").hidden = true;
      }
      try {
        var fresh;
        try {
          fresh = await api.invoke("wikisource-page", {
            source: source,
            pageTitle: title,
          }, signal);
        } catch (error) {
          if (!cached) throw error;
          fresh = { ...cached, stale: true };
        }
        if (closed || current !== version) return;
        page = fresh;
        store.cachePage(page);
        el(".wc-work").hidden = false;
        el(".wc-title").textContent = page.title || title;
        var a = el(".wc-attribution");
        a.replaceChildren();
        a.append("Source: " + store.sources[page.source].label + " · ");
        var link = document.createElement("a");
        link.href = store.sources[page.source].origin + "/wiki/" +
          encodeURIComponent(page.pageTitle.replace(/ /g, "_"));
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "View Original";
        a.append(link);
        render();
        content.scrollTop =
          resume && Number.isFinite(Number(resume.scroll_position))
            ? Number(resume.scroll_position)
            : resume
            ? Math.max(
              0,
              (content.scrollHeight - content.clientHeight) *
                (Number(resume.reading_progress) || 0) / 100,
            )
            : 0;
        loading = false;
        markProgress();
        message(
          page.stale
            ? "Menampilkan salinan tersimpan. Sumber belum dapat diperbarui."
            : "",
        );
        chapters = [{ title: page.title || title, pageTitle: title }];
        chapterSelect();
        try {
          var list = await api.invoke("wikisource-chapters", {
            source: source,
            pageTitle: workTitle,
          }, signal);
          if (closed || current !== version) return;
          chapters = list.chapters || [];
          chapterSelect();
          nextCursor = list.nextCursor || null;
          el(".wc-more-chapters").hidden = !nextCursor;
        } catch {
          if (current === version) {
            message("Bab tetap dapat dibaca. Daftar bab belum tersedia.");
          }
        }
      } catch (error) {
        if (current === version && !closed) {
          message(error.message);
          loading = false;
        }
      } finally {
        if (current === version) loading = false;
      }
    }
    form.onsubmit = async function (event) {
      event.preventDefault();
      var q = form.elements.query.value.trim();
      if (!q) return;
      var selected = form.elements.source.value, current = ++searchVersion;
      if (searchController) searchController.abort();
      searchController = new AbortController();
      message("Mencari karya…");
      var target = el(".wc-results");
      target.replaceChildren();
      try {
        var data = await api.invoke("wikisource-search", {
          source: selected,
          query: q,
        }, searchController.signal);
        if (closed || current !== searchVersion) return;
        (data.results || []).forEach(function (item) {
          target.append(button(item.title, function () {
            openPage(selected, item.pageTitle, item.pageTitle);
          }));
        });
        message(
          data.results && data.results.length
            ? "Pilih karya untuk mulai membaca."
            : "Tidak ada hasil. Coba judul dalam bahasa sumber.",
        );
      } catch (error) {
        if (current === searchVersion) message(error.message);
      }
    };
    el(".wc-more-chapters").onclick = async function () {
      if (!page || !nextCursor) return;
      var current = version;
      this.disabled = true;
      try {
        var list = await api.invoke("wikisource-chapters", {
          source: page.source,
          pageTitle: workTitle,
          cursor: nextCursor,
        }, controller.signal);
        if (closed || current !== version) return;
        for (const chapter of list.chapters || []) {
          if (!chapters.some((c) => c.pageTitle === chapter.pageTitle)) {
            chapters.push(chapter);
          }
        }
        nextCursor = list.nextCursor || null;
        this.hidden = !nextCursor;
        chapterSelect();
      } catch (error) {
        message(error.message);
      } finally {
        this.disabled = false;
      }
    };
    el(".wc-chapters").onchange = function () {
      openPage(page.source, this.value, workTitle);
    };
    el(".wc-prev").onclick = function () {
      var i = chapters.findIndex((c) => c.pageTitle === page.pageTitle);
      if (i > 0) openPage(page.source, chapters[i - 1].pageTitle, workTitle);
    };
    el(".wc-next").onclick = function () {
      var i = chapters.findIndex((c) => c.pageTitle === page.pageTitle);
      if (i >= 0 && i < chapters.length - 1) {
        openPage(page.source, chapters[i + 1].pageTitle, workTitle);
      }
    };
    el(".wc-view").onchange = function () {
      status("");
      redisplay();
    };
    el(".wc-mode").onchange = function () {
      status("");
      redisplay();
    };
    el(".wc-font").oninput = function () {
      var before = progress();
      content.style.fontSize = this.value + "px";
      content.scrollTop =
        Math.max(0, content.scrollHeight - content.clientHeight) * before / 100;
    };
    el(".wc-translate").onclick = async function () {
      if (!page) return;
      var current = version, mode = el(".wc-mode").value, btn = this;
      btn.disabled = true;
      status("Menerjemahkan bab. Anda tetap dapat membaca teks asli…");
      try {
        var data = await api.invoke("translate-classic", {
          source: page.source,
          pageTitle: page.pageTitle,
          mode: mode,
          paragraphs: page.paragraphs.map((p) => p.original),
        }, controller.signal);
        if (closed || current !== version) return;
        if (
          !Array.isArray(data.paragraphs) ||
          data.paragraphs.length !== page.paragraphs.length ||
          data.paragraphs.some((p, i) =>
            p.index !== i || p.original !== page.paragraphs[i].original ||
            typeof p.translated !== "string"
          )
        ) throw Error("Hasil terjemahan belum lengkap.");
        translations[mode] = data;
        status("Terjemahan " + mode + " tersedia.");
        if (el(".wc-mode").value === mode) {
          if (el(".wc-view").value === "original") {
            el(".wc-view").value = "bilingual";
          }
          redisplay();
        }
      } catch (error) {
        if (current === version) {
          var detail = error.message || "Terjemahan gagal. Coba lagi nanti.";
          status(
            detail +
              (/teks asli/i.test(detail)
                ? ""
                : " Teks asli tetap dapat dibaca."),
          );
        }
      } finally {
        if (current === version) btn.disabled = false;
      }
    };
    el(".wc-bookmark").onclick = async function () {
      if (!page) return;
      var item = row(),
        id = owner,
        saved = store.list("bookmarks", id).some((p) =>
          p.source === item.source && p.page_title === item.page_title
        );
      this.disabled = true;
      try {
        if (id) {
          if (saved) {
            await api.rows("world_classics_bookmarks", {
              user_id: "eq." + id,
              source: "eq." + item.source,
              page_title: "eq." + item.page_title,
            }, "DELETE");
          } else await cloudSave("bookmarks", item, id);
        }
        if (owner !== id) return;
        if (saved) store.remove("bookmarks", id, item);
        else store.save("bookmarks", id, item);
        drawShelf();
        syncText();
      } catch {
        syncText(
          "Bookmark cloud belum berubah. Coba lagi ketika koneksi tersedia.",
        );
      } finally {
        if (!closed) this.disabled = false;
      }
    };
    content.addEventListener("click", function (event) {
      var anchor = event.target.closest && event.target.closest("a[href]");
      if (!anchor || !content.contains(anchor) || !page || closed) return;
      var href = anchor.getAttribute("href");
      if (href.startsWith("#")) {
        event.preventDefault();
        var id;
        try {
          id = decodeURIComponent(href.slice(1));
        } catch {
          return;
        }
        var target = Array.from(content.querySelectorAll("[id]")).find(
          function (node) {
            return node.id === id;
          },
        );
        if (target && target.scrollIntoView) {
          target.scrollIntoView({ block: "nearest" });
        }
        return;
      }
      // Work/edition links stay in the same reader. Attribution still opens the source.
      try {
        var url = new URL(href);
        if (
          url.origin !== store.sources[page.source].origin ||
          !url.pathname.startsWith("/wiki/")
        ) return;
        var title = decodeURIComponent(url.pathname.slice(6)).replace(
          /_/g,
          " ",
        );
        if (!title || title.length > 240 || /[:#<>\[\]{}|\r\n]/.test(title)) {
          return;
        }
        event.preventDefault();
        openPage(
          page.source,
          title,
          title.startsWith(workTitle + "/") ? workTitle : title.split("/")[0],
        );
      } catch {
        /* Leave unsupported source links to normal browser navigation. */
      }
    });
    content.addEventListener("scroll", markProgress, { passive: true });
    function visibility() {
      if (document.visibilityState === "hidden") flush();
    }
    function accountChanged() {
      flush();
      owner = api.userId();
      sync();
    }
    document.addEventListener("visibilitychange", visibility);
    root.addEventListener("pagehide", flush);
    root.addEventListener("nexora:account-ready", accountChanged);
    body.__nxCleanup = function () {
      flush();
      closed = true;
      ++version;
      ++searchVersion;
      if (controller) controller.abort();
      if (searchController) searchController.abort();
      clearTimeout(readingTimer);
      document.removeEventListener("visibilitychange", visibility);
      root.removeEventListener("pagehide", flush);
      root.removeEventListener("nexora:account-ready", accountChanged);
      body.__nxCleanup = null;
    };
    sync();
  };
})(window);
