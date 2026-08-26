/* Nexora v6.2 — public tool health status panel. */
(function () {
  "use strict";

  const labels = {
    operational: { short: "Operational", title: "Semua sistem normal", icon: "fa-circle-check" },
    degraded: { short: "Degraded", title: "Beberapa tools terganggu", icon: "fa-triangle-exclamation" },
    offline: { short: "Offline", title: "Layanan utama tidak tersedia", icon: "fa-circle-xmark" },
    unknown: { short: "Unknown", title: "Status belum tersedia", icon: "fa-circle-question" }
  };

  function statusName(value) {
    return Object.hasOwn(labels, value) ? value : "unknown";
  }

  function formatTime(value) {
    if (!value) return "Belum diperiksa";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Belum diperiksa";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    } catch {
      return date.toLocaleString();
    }
  }

  function text(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value == null ? "" : String(value);
    return element;
  }

  function setState(root, payload) {
    const summary = payload && payload.summary ? payload.summary : { status: "unknown", counts: {}, total: 0 };
    const status = statusName(summary.status);
    const meta = labels[status];
    const badge = root.querySelector("[data-health-badge]");
    const title = root.querySelector("[data-health-title]");
    const description = root.querySelector("[data-health-description]");
    const time = root.querySelector("[data-health-time]");
    const icon = root.querySelector("[data-health-icon]");

    root.dataset.healthStatus = status;
    window.__NEXORA_TOOL_HEALTH_PAYLOAD__ = payload;
    if (badge) badge.textContent = meta.short;
    if (title) title.textContent = meta.title;
    if (description) {
      const counts = summary.counts || {};
      description.textContent = `${Number(counts.operational || 0)} normal · ${Number(counts.degraded || 0)} terganggu · ${Number(counts.offline || 0)} offline`;
    }
    if (time) time.textContent = `Terakhir dicek: ${formatTime(summary.lastCheckedAt)}`;
    if (icon) icon.className = `fa-solid ${meta.icon}`;
    renderList(root, payload && Array.isArray(payload.data) ? payload.data : []);
  }

  function renderList(root, rows) {
    const list = root.querySelector("[data-health-list]");
    if (!list) return;
    list.replaceChildren();

    const sorted = [...rows].sort((a, b) => {
      const priority = { offline: 0, degraded: 1, unknown: 2, operational: 3 };
      const statusDiff = priority[statusName(a.status)] - priority[statusName(b.status)];
      return statusDiff || String(a.name || "").localeCompare(String(b.name || ""), "id");
    });

    if (!sorted.length) {
      list.append(text("p", "nx-health-empty", "Data pemeriksaan belum tersedia."));
      return;
    }

    for (const row of sorted) {
      const status = statusName(row.status);
      const item = document.createElement("article");
      item.className = "nx-health-item";
      item.dataset.status = status;

      const top = document.createElement("div");
      top.className = "nx-health-item-top";
      const identity = document.createElement("div");
      identity.className = "nx-health-item-identity";
      const dot = document.createElement("span");
      dot.className = "nx-health-dot";
      dot.setAttribute("aria-hidden", "true");
      identity.append(dot, text("b", "", row.name || row.toolId || "Tool"));
      top.append(identity, text("span", "nx-health-item-status", labels[status].short));

      const metrics = document.createElement("div");
      metrics.className = "nx-health-item-metrics";
      metrics.append(
        text("span", "", row.latencyMs == null ? "Latency —" : `${row.latencyMs} ms`),
        text("span", "", `Success ${Number(row.successRate || 0).toFixed(0)}%`),
        text("span", "", row.httpStatus == null ? "HTTP —" : `HTTP ${row.httpStatus}`)
      );

      item.append(top, metrics);
      if (row.lastError) item.append(text("p", "nx-health-item-error", row.lastError));
      list.append(item);
    }
  }

  async function load(root, forceVisual) {
    const refresh = root.querySelector("[data-health-refresh]");
    if (refresh) {
      refresh.disabled = true;
      refresh.classList.add("is-loading");
    }
    if (forceVisual) root.classList.add("is-loading");

    try {
      const response = await fetch("/api/tool-health?refresh=0", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : "INVALID_RESPONSE");
      setState(root, payload);
      document.dispatchEvent(new CustomEvent("nexora:tool-health-loaded",{detail:payload}));
    } catch (error) {
      const description = root.querySelector("[data-health-description]");
      if (description) description.textContent = "Status belum dapat dimuat. Coba lagi nanti.";
      console.warn("[Nexora Health]", error && error.message ? error.message : error);
    } finally {
      root.classList.remove("is-loading");
      if (refresh) {
        refresh.disabled = false;
        refresh.classList.remove("is-loading");
      }
    }
  }

  function openPanel(root) {
    const dialog = root.querySelector("[data-health-dialog]");
    if (!dialog) return;
    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden", "false");
    document.body.classList.add("nx-health-lock");
    root.querySelector("[data-health-close]")?.focus();
  }

  function closePanel(root) {
    const dialog = root.querySelector("[data-health-dialog]");
    if (!dialog) return;
    dialog.classList.remove("is-open");
    dialog.setAttribute("aria-hidden", "true");
    document.body.classList.remove("nx-health-lock");
    root.querySelector("[data-health-open]")?.focus();
  }

  function init() {
    const root = document.getElementById("nxToolHealth");
    if (!root) return;

    root.querySelector("[data-health-open]")?.addEventListener("click", () => { openPanel(root); load(root, false); });
    root.querySelector("[data-health-close]")?.addEventListener("click", () => closePanel(root));
    root.querySelector("[data-health-refresh]")?.addEventListener("click", () => load(root, true));
    root.querySelector("[data-health-dialog]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closePanel(root);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && root.querySelector("[data-health-dialog]")?.classList.contains("is-open")) closePanel(root);
    });

    const schedule=window.NexoraScheduleIdle||function(task){setTimeout(task,2200);};
    schedule(() => load(root, true), { timeout: 4200 });
    window.addEventListener("online", () => {
      const schedule=window.NexoraScheduleIdle||function(task){setTimeout(task,800);};
      schedule(() => load(root, false), { timeout: 2200 });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
