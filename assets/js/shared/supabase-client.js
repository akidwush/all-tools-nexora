/* One direct Supabase transport, reusing NexoraAccount's existing cookie session. */
(function (root) {
  "use strict";
  if (root.NexoraSupabase) return;
  var config = null,
    configFlight = null,
    token = null,
    tokenFlight = null,
    generation = 0;
  async function timedFetch(url, options, milliseconds) {
    options = options || {};
    var controller = new AbortController(), parent = options.signal;
    var expired = false;
    function cancel() {
      controller.abort();
    }
    if (parent) {
      if (parent.aborted) cancel();
      else parent.addEventListener("abort", cancel, { once: true });
    }
    var timer = setTimeout(function () {
      expired = true;
      cancel();
    }, milliseconds || 25000);
    try {
      var response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      var data = await response.json().catch(function (error) {
        if (response.ok) throw error;
        return {};
      });
      return {
        ok: response.ok,
        status: response.status,
        json: async function () {
          return data;
        },
      };
    } catch (error) {
      if (expired) {
        throw Error("Koneksi reader melewati batas waktu. Coba lagi sesaat.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (parent) parent.removeEventListener("abort", cancel);
    }
  }
  function account() {
    return root.NexoraAccount && root.NexoraAccount.state || {};
  }
  function userId() {
    var a = account();
    return a.authenticated && a.user && a.user.id || "";
  }
  function clear() {
    generation++;
    token = null;
    tokenFlight = null;
  }
  root.addEventListener("nexora:account-ready", clear);
  async function configuration() {
    if (config) return config;
    if (!configFlight) {
      configFlight = timedFetch("/api/account?resource=reader-config", {
        credentials: "same-origin",
        cache: "no-store",
      }).then(function (r) {
        if (!r.ok) throw Error("Konfigurasi reader belum tersedia.");
        return r.json();
      }).then(function (c) {
        if (
          !c.configured || !c.publicKey ||
          !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(c.url)
        ) throw Error("Reader belum diaktifkan oleh admin.");
        config = { url: c.url.replace(/\/$/, ""), publicKey: c.publicKey };
        return config;
      }).finally(function () {
        configFlight = null;
      });
    }
    return configFlight;
  }
  async function session() {
    var id = userId();
    if (!id) return null;
    if (token && token.userId === id && token.until > Date.now()) return token;
    if (!tokenFlight) {
      var epoch = generation;
      tokenFlight = (async function () {
        var csrf =
          (document.cookie.match(/(?:^|;\s*)nx_account_csrf=([^;]*)/) || [])[
            1
          ] || "";
        var r = await timedFetch("/api/account", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": decodeURIComponent(csrf),
          },
          body: JSON.stringify({ action: "reader-session" }),
        });
        var d = await r.json();
        if (!r.ok || !d.accessToken) {
          throw Error(d.message || "Sesi reader berakhir. Masuk kembali.");
        }
        if (epoch !== generation || d.userId !== userId()) {
          throw Error("Akun berubah. Buka ulang reader.");
        }
        token = {
          accessToken: d.accessToken,
          userId: d.userId,
          until: Date.now() + 240000,
        };
        return token;
      })().finally(function () {
        tokenFlight = null;
      });
    }
    return tokenFlight;
  }
  async function request(path, options, retry) {
    var c = await configuration(), s = await session();
    var r = await timedFetch(c.url + path, {
      ...options,
      credentials: "omit",
      cache: "no-store",
      headers: {
        apikey: c.publicKey,
        ...(s ? { Authorization: "Bearer " + s.accessToken } : {}),
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    }, path.includes("/translate-classic") ? 180000 : 25000);
    if (r.status === 401 && s && !retry) {
      clear();
      return request(path, options, true);
    }
    var data = await r.json().catch(function () {
      return {};
    });
    if (!r.ok || data.ok === false) {
      var error = new Error(
        data.message || "Layanan reader sementara tidak tersedia.",
      );
      error.status = r.status;
      error.code = data.error;
      throw error;
    }
    return data;
  }
  root.NexoraSupabase = Object.freeze({
    userId: userId,
    configuration: configuration,
    invoke: function (name, body, signal) {
      if (
        ![
          "wikisource-search",
          "wikisource-page",
          "wikisource-chapters",
          "translate-classic",
        ].includes(name)
      ) return Promise.reject(Error("Function tidak dikenal."));
      return request("/functions/v1/" + name, {
        method: "POST",
        body: JSON.stringify(body),
        signal: signal,
      });
    },
    rows: function (table, query, method, body) {
      if (
        !["world_classics_bookmarks", "world_classics_history"].includes(table)
      ) return Promise.reject(Error("Tabel tidak didukung."));
      if (!userId()) return Promise.reject(Error("Masuk untuk sinkronisasi."));
      return request("/rest/v1/" + table + "?" + new URLSearchParams(query), {
        method: method || "GET",
        headers: {
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    },
  });
})(window);
