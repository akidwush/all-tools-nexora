(function () {
  "use strict";

  var SDK_URL = "https://js.puter.com/v2/";
  var sdkPromise = null;

  function hasSdk() {
    return Boolean(window.puter && window.puter.auth && window.puter.ai);
  }

  function loadSdk() {
    if (hasSdk()) return Promise.resolve(window.puter);
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-nexora-puter-sdk="1"]');
      var script = existing || document.createElement("script");
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        sdkPromise = null;
        reject(new Error("PUTER_SDK_TIMEOUT"));
      }, 15000);

      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!error && hasSdk()) {
          script.dataset.nexoraPuterReady = "1";
          resolve(window.puter);
          return;
        }
        sdkPromise = null;
        reject(error || new Error("PUTER_SDK_UNAVAILABLE"));
      }

      script.addEventListener("load", function () { finish(null); }, { once: true });
      script.addEventListener("error", function () { finish(new Error("PUTER_SDK_LOAD_FAILED")); }, { once: true });

      if (!existing) {
        script.src = SDK_URL;
        script.async = true;
        script.dataset.nexoraPuterSdk = "1";
        document.head.appendChild(script);
      } else if (hasSdk() || script.dataset.nexoraPuterReady === "1") {
        finish(null);
      }
    });

    return sdkPromise;
  }

  function errorDetails(error) {
    var root = error && typeof error === "object" ? error : {};
    var nested = root.error && typeof root.error === "object" ? root.error : root;
    var code = String(nested.code || root.code || "").trim().toLowerCase().slice(0, 100);
    var status = Number(nested.status || root.status || 0) || 0;
    var message = String(nested.message || root.message || (typeof root.error === "string" ? root.error : "") || error || "").trim().slice(0, 240);
    return { code: code, status: status, message: message };
  }

  function safeName(user) {
    var value = user && (user.username || user.email || user.name);
    return String(value || "Pengguna Puter").replace(/[<>]/g, "").slice(0, 80);
  }

  function percentRemaining(usage) {
    var info = usage && usage.allowanceInfo;
    var total = Number(info && info.monthUsageAllowance);
    var remaining = Number(info && info.remaining);
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(remaining)) return "";
    return Math.max(0, Math.min(100, Math.round((remaining / total) * 100))) + "% allowance tersisa";
  }

  window.NexoraPuterRuntime = Object.freeze({
    sdkUrl: SDK_URL,
    loadSdk: loadSdk,
    errorDetails: errorDetails,
    safeName: safeName,
    percentRemaining: percentRemaining
  });
})();
