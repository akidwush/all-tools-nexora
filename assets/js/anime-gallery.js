(function () {
  "use strict";

  var WAIFU_API = "https://api.waifu.im";
  var NEKOS_API = "/api/health?mode=anime-gallery&provider=nekosbest";
  var FAVORITES_KEY = "nexora.anime-gallery.saved.v1";
  var PAGE_SIZE = 18;
  var SFW_HIDDEN_TAGS = new Set(["ero", "ecchi", "oppai", "hentai", "milf", "ass", "paizuri", "oral"]);
  var DEFAULT_FILTERS = Object.freeze({
    include: [], exclude: [], artist: null, orientation: "All",
    animated: "False", minWidth: "", minHeight: "", sort: "Random"
  });

  var state = {
    mode: "discover",
    provider: "all",
    query: "",
    selectedTag: null,
    activeReaction: "",
    tags: [],
    categories: [],
    items: [],
    seen: new Set(),
    page: 1,
    hasMore: true,
    loading: false,
    filters: cloneFilters(DEFAULT_FILTERS),
    draftFilters: cloneFilters(DEFAULT_FILTERS),
    favorites: loadFavorites(),
    feedController: null,
    suggestionController: null,
    artistController: null,
    metadataReady: false,
    detailItem: null,
    errors: {},
    pageCache: new Map()
  };

  var ui = {
    searchForm: byId("searchForm"), searchInput: byId("searchInput"), searchClear: byId("searchClear"),
    suggestions: byId("searchSuggestions"), modeTabs: byId("modeTabs"), chips: byId("interestChips"),
    provider: byId("providerFilter"), summary: byId("feedSummary"), surprise: byId("surpriseButton"),
    notices: byId("providerNotices"), gallery: byId("gallery"), empty: byId("emptyState"),
    loadState: byId("loadState"), sentinel: byId("feedSentinel"), savedCount: byId("savedCount"),
    savedShortcut: byId("savedShortcut"), filterTrigger: byId("filterTrigger"), filterCount: byId("filterCount"),
    filterBackdrop: byId("filterBackdrop"), filterSheet: byId("filterSheet"), closeFilters: byId("closeFilters"),
    orientation: byId("orientationChoices"), animated: byId("animatedFilter"), sort: byId("sortFilter"),
    minWidth: byId("minWidthFilter"), minHeight: byId("minHeightFilter"), includeSelect: byId("includeTagSelect"),
    excludeSelect: byId("excludeTagSelect"), includeList: byId("includedTagList"), excludeList: byId("excludedTagList"),
    addInclude: byId("addIncludeTag"), addExclude: byId("addExcludeTag"), artistInput: byId("artistFilterInput"),
    artistResults: byId("artistFilterResults"), clearArtist: byId("clearArtist"), resetFilters: byId("resetFilters"),
    applyFilters: byId("applyFilters"), detailBackdrop: byId("detailBackdrop"), detail: byId("detailView"),
    detailClose: byId("detailClose"), detailMedia: byId("detailMedia"), detailImage: byId("detailImage"),
    detailProvider: byId("detailProvider"), detailTitle: byId("detailTitle"), detailByline: byId("detailByline"),
    detailMetadata: byId("detailMetadata"), detailTags: byId("detailTags"), openSource: byId("openSourceAction"),
    copyUrl: byId("copyUrlAction"), download: byId("downloadAction"), share: byId("shareAction"),
    detailSave: byId("detailSave"), toast: byId("toast"), resetEmpty: byId("resetEmpty")
  };

  var searchTimer = 0;
  var suggestionTimer = 0;
  var artistTimer = 0;
  var toastTimer = 0;
  var detailTouchStart = null;

  function byId(id) { return document.getElementById(id); }
  function cloneFilters(value) {
    return {
      include: Array.isArray(value.include) ? value.include.slice() : [],
      exclude: Array.isArray(value.exclude) ? value.exclude.slice() : [],
      artist: value.artist ? { id: String(value.artist.id), name: String(value.artist.name || "") } : null,
      orientation: value.orientation || "All",
      animated: value.animated || "False",
      minWidth: value.minWidth || "",
      minHeight: value.minHeight || "",
      sort: value.sort || "Random"
    };
  }

  function safeUrl(value) {
    try {
      var parsed = new URL(String(value || ""), location.origin);
      return parsed.protocol === "https:" || (parsed.protocol === "http:" && parsed.hostname === "localhost") ? parsed.href : "";
    } catch (_) { return ""; }
  }

  function cleanColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#e8e4e1"; }
  function numberOrNull(value) { var number = Number(value); return Number.isFinite(number) && number > 0 ? Math.round(number) : null; }
  function labelize(value) { return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }); }

  function readSession(key, maxAge) {
    try {
      var entry = JSON.parse(sessionStorage.getItem(key) || "null");
      return entry && Date.now() - Number(entry.savedAt || 0) < maxAge ? entry.value : null;
    } catch (_) { return null; }
  }

  function writeSession(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value: value })); } catch (_) {}
  }

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function timeoutFetchJson(url, options) {
    options = options || {};
    var controller = new AbortController();
    var parentSignal = options.signal;
    var abort = function () { controller.abort(); };
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener("abort", abort, { once: true });
    }
    var timer = setTimeout(function () { controller.abort(); }, options.timeout || 14000);
    return fetch(url, {
      method: "GET",
      cache: options.cache || "no-store",
      credentials: options.credentials || "omit",
      headers: { Accept: "application/json" },
      signal: controller.signal
    }).then(async function (response) {
      var body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok) {
        var error = new Error(body && body.message ? body.message : "Request gagal (HTTP " + response.status + ").");
        error.status = response.status;
        error.payload = body;
        throw error;
      }
      return body;
    }).finally(function () {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", abort);
    });
  }

  function normalizeWaifu(item) {
    var url = safeUrl(item && item.url);
    if (!url || !url.startsWith("https://cdn.waifu.im/")) return null;
    var artists = Array.isArray(item.artists) ? item.artists : [];
    var artist = artists[0] || null;
    var artistUrl = artist && (safeUrl(artist.pixiv) || safeUrl(artist.twitter) || safeUrl(artist.deviantArt) || safeUrl(artist.patreon));
    var tags = (Array.isArray(item.tags) ? item.tags : []).map(function (tag) {
      return { id: String(tag.id || ""), name: String(tag.name || tag.slug || ""), slug: String(tag.slug || "").toLowerCase() };
    }).filter(function (tag) { return tag.name && !SFW_HIDDEN_TAGS.has(tag.slug); });
    return {
      id: "waifu-im:" + String(item.id), provider: "waifu-im", type: item.isAnimated ? "gif" : "image", mediaType: "image",
      url: url, width: numberOrNull(item.width), height: numberOrNull(item.height),
      extension: String(item.extension || "").replace(/^\./, "").toLowerCase() || null,
      animated: Boolean(item.isAnimated), artistName: artist ? String(artist.name || "") || null : null,
      artistUrl: artistUrl || null, animeName: null, sourceUrl: safeUrl(item.source) || null,
      tags: tags, dominantColor: cleanColor(item.dominantColor), category: null, isNsfw: Boolean(item.isNsfw)
    };
  }

  function normalizeNekos(item) {
    if (!item || item.provider !== "nekosbest") return null;
    var url = safeUrl(item.url);
    if (!url || !url.startsWith("https://nekos.best/api/v2/")) return null;
    return {
      id: String(item.id || "nekosbest:" + url), provider: "nekosbest", type: item.animated ? "gif" : "image",
      mediaType: "image", url: url, width: numberOrNull(item.width), height: numberOrNull(item.height),
      extension: String(item.extension || "").replace(/^\./, "").toLowerCase() || (item.animated ? "gif" : "png"),
      animated: Boolean(item.animated), artistName: item.artistName ? String(item.artistName) : null,
      artistUrl: safeUrl(item.artistUrl) || null, animeName: item.animeName ? String(item.animeName) : null,
      sourceUrl: safeUrl(item.sourceUrl) || null, tags: [], dominantColor: null,
      category: item.category ? String(item.category) : null, isNsfw: false
    };
  }

  function favoriteSnapshot(item) {
    return {
      id: item.id, provider: item.provider, type: item.type, mediaType: "image", url: item.url,
      width: item.width, height: item.height, extension: item.extension, animated: item.animated,
      artistName: item.artistName, artistUrl: item.artistUrl, animeName: item.animeName,
      sourceUrl: item.sourceUrl, tags: (item.tags || []).slice(0, 12), dominantColor: item.dominantColor,
      category: item.category, isNsfw: false
    };
  }

  function loadFavorites() {
    try {
      var rows = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      if (!Array.isArray(rows)) return new Map();
      return new Map(rows.slice(0, 150).map(function (row) {
        if (!row || !["waifu-im", "nekosbest"].includes(row.provider) || row.isNsfw) return null;
        var url = safeUrl(row.url);
        var validHost = row.provider === "waifu-im" ? url.startsWith("https://cdn.waifu.im/") : url.startsWith("https://nekos.best/api/v2/");
        if (!url || !validHost) return null;
        var normalized = {
          id: String(row.id || row.provider + ":" + url), provider: row.provider,
          type: row.animated ? "gif" : "image", mediaType: "image", url: url,
          width: numberOrNull(row.width), height: numberOrNull(row.height),
          extension: String(row.extension || "").replace(/^\./, "").toLowerCase() || (row.animated ? "gif" : "png"),
          animated: Boolean(row.animated), artistName: row.artistName ? String(row.artistName).slice(0, 120) : null,
          artistUrl: safeUrl(row.artistUrl) || null, animeName: row.animeName ? String(row.animeName).slice(0, 160) : null,
          sourceUrl: safeUrl(row.sourceUrl) || null,
          tags: (Array.isArray(row.tags) ? row.tags : []).slice(0, 12).map(function (tag) { return { id: String(tag.id || ""), name: String(tag.name || "").slice(0, 80), slug: String(tag.slug || "").slice(0, 80) }; }),
          dominantColor: cleanColor(row.dominantColor), category: row.category ? String(row.category).slice(0, 40) : null, isNsfw: false
        };
        return normalized && normalized.id ? [normalized.id, normalized] : null;
      }).filter(Boolean));
    } catch (_) { return new Map(); }
  }

  function persistFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(state.favorites.values()).slice(0, 150))); } catch (_) {}
    updateSavedCount();
  }

  function updateSavedCount() {
    var count = state.favorites.size;
    ui.savedCount.textContent = String(count);
    ui.savedCount.setAttribute("aria-label", count + " gambar tersimpan");
  }

  function toggleFavorite(item) {
    if (state.favorites.has(item.id)) {
      state.favorites.delete(item.id);
      showToast("Dihapus dari Saved.");
    } else {
      state.favorites.set(item.id, favoriteSnapshot(item));
      showToast("Artwork disimpan di perangkat ini.");
    }
    persistFavorites();
    syncFavoriteButtons(item.id);
    if (state.mode === "saved") renderSaved();
  }

  function syncFavoriteButtons(id) {
    var saved = state.favorites.has(id);
    document.querySelectorAll("[data-favorite-id]").forEach(function (button) {
      if (button.dataset.favoriteId !== id) return;
      button.classList.toggle("is-saved", saved);
      button.textContent = saved ? "♥" : "♡";
      button.setAttribute("aria-label", saved ? "Hapus dari Saved" : "Simpan artwork");
    });
    if (state.detailItem && state.detailItem.id === id) updateDetailSave();
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.hidden = false;
    toastTimer = setTimeout(function () { ui.toast.hidden = true; }, 2300);
  }

  var mediaObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      var image = entry.target;
      if (entry.isIntersecting) {
        if (!image.getAttribute("src")) image.src = image.dataset.src;
      } else if (image.dataset.animated === "true" && image.getAttribute("src")) {
        image.removeAttribute("src");
        image.classList.remove("is-loaded");
      }
    });
  }, { rootMargin: "650px 0px" });

  function cardRatio(item) {
    if (item.width && item.height) return (item.width / item.height).toFixed(4);
    return item.animated ? "1.15" : ".72";
  }

  function createCard(item) {
    var card = create("article", "ag-card");
    card.dataset.itemId = item.id;
    var open = create("button", "ag-card-open");
    open.type = "button";
    open.setAttribute("aria-label", "Buka detail " + (item.artistName || item.animeName || "artwork anime"));
    open.addEventListener("click", function () { openDetail(item); });
    var media = create("span", "ag-card-media");
    media.style.setProperty("--card-ratio", cardRatio(item));
    media.style.setProperty("--card-color", cleanColor(item.dominantColor));
    var image = create("img");
    image.alt = item.artistName ? "Ilustrasi anime oleh " + item.artistName : item.animeName ? "Reaction dari " + item.animeName : "Ilustrasi anime";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.dataset.src = item.url;
    image.dataset.animated = String(item.animated);
    image.addEventListener("load", function () {
      if ((!item.width || !item.height) && image.naturalWidth && image.naturalHeight) {
        media.style.setProperty("--card-ratio", (image.naturalWidth / image.naturalHeight).toFixed(4));
      }
      image.classList.add("is-loaded");
    });
    image.addEventListener("error", function () {
      if (!image.getAttribute("src")) return;
      card.classList.add("is-broken");
      mediaObserver.unobserve(image);
    });
    media.appendChild(image);
    if (item.animated) media.appendChild(create("span", "ag-card-type", "GIF"));
    var meta = create("span", "ag-card-meta", item.artistName || item.animeName || (item.category ? labelize(item.category) : item.provider));
    media.appendChild(meta);
    open.appendChild(media);
    var broken = create("span", "ag-card-broken", "Gambar tidak lagi tersedia. Metadata masih bisa dibuka.");
    open.appendChild(broken);
    card.appendChild(open);

    var favorite = create("button", "ag-card-favorite" + (state.favorites.has(item.id) ? " is-saved" : ""), state.favorites.has(item.id) ? "♥" : "♡");
    favorite.type = "button";
    favorite.dataset.favoriteId = item.id;
    favorite.setAttribute("aria-label", state.favorites.has(item.id) ? "Hapus dari Saved" : "Simpan artwork");
    favorite.addEventListener("click", function (event) { event.preventDefault(); event.stopPropagation(); toggleFavorite(item); });
    card.appendChild(favorite);
    mediaObserver.observe(image);
    return card;
  }

  function renderSkeletons(count) {
    var ratios = [.68, 1.08, .76, .56, .84, .64, 1.12, .71, .92, .59, .78, 1.03];
    var fragment = document.createDocumentFragment();
    for (var index = 0; index < count; index += 1) {
      var skeleton = create("span", "ag-card is-skeleton");
      skeleton.style.aspectRatio = String(ratios[index % ratios.length]);
      fragment.appendChild(skeleton);
    }
    ui.gallery.replaceChildren(fragment);
  }

  function appendCards(items, reset) {
    if (reset) ui.gallery.replaceChildren();
    var fragment = document.createDocumentFragment();
    items.forEach(function (item) { fragment.appendChild(createCard(item)); });
    ui.gallery.appendChild(fragment);
  }

  function interleave(groups) {
    var rows = groups.filter(function (group) { return group && group.length; });
    var result = [];
    var index = 0;
    while (rows.some(function (group) { return index < group.length; })) {
      rows.forEach(function (group) { if (group[index]) result.push(group[index]); });
      index += 1;
    }
    return result;
  }

  function addItems(items, reset) {
    var fresh = [];
    items.forEach(function (item) {
      if (!item || !item.id || !item.url || item.isNsfw || state.seen.has(item.id)) return;
      state.seen.add(item.id);
      state.items.push(item);
      fresh.push(item);
    });
    appendCards(fresh, reset);
    return fresh.length;
  }

  async function loadTags(signal) {
    var cached = readSession("nexora.anime-gallery.tags.v1", 6 * 60 * 60 * 1000);
    if (Array.isArray(cached) && cached.length) { state.tags = cached; return; }
    var payload = await timeoutFetchJson(WAIFU_API + "/tags?Page=1&PageSize=100", { signal: signal, cache: "default" });
    state.tags = (Array.isArray(payload && payload.items) ? payload.items : []).map(function (tag) {
      return { id: String(tag.id || ""), name: String(tag.name || tag.slug || ""), slug: String(tag.slug || "").toLowerCase(), count: numberOrNull(tag.imageCount) || 0 };
    }).filter(function (tag) { return tag.id && tag.name && tag.slug && !SFW_HIDDEN_TAGS.has(tag.slug); }).sort(function (left, right) { return right.count - left.count; });
    writeSession("nexora.anime-gallery.tags.v1", state.tags);
  }

  async function loadCategories(signal) {
    var cached = readSession("nexora.anime-gallery.categories.v1", 3 * 60 * 60 * 1000);
    if (Array.isArray(cached) && cached.length) {
      state.categories = cached;
      var cachedReactions = reactionCategories();
      state.activeReaction = cachedReactions.some(function (item) { return item.name === "hug"; }) ? "hug" : (cachedReactions[0] && cachedReactions[0].name) || "";
      return;
    }
    var payload = await timeoutFetchJson(NEKOS_API + "&action=endpoints", { signal: signal, credentials: "same-origin", cache: "default" });
    state.categories = Array.isArray(payload && payload.categories) ? payload.categories.filter(function (item) {
      return item && /^[a-z][a-z0-9_-]+$/.test(item.name) && ["png", "gif"].includes(item.format);
    }) : [];
    var reactions = state.categories.filter(function (item) { return item.format === "gif"; });
    if (!state.activeReaction && reactions.length) {
      state.activeReaction = reactions.some(function (item) { return item.name === "hug"; }) ? "hug" : reactions[0].name;
    }
    writeSession("nexora.anime-gallery.categories.v1", state.categories);
  }

  async function ensureMetadata(signal) {
    if (state.metadataReady) return;
    var results = await Promise.allSettled([loadTags(signal), loadCategories(signal)]);
    state.metadataReady = true;
    if (results[0].status === "rejected") state.errors.waifu = "Waifu.im sedang tidak tersedia.";
    if (results[1].status === "rejected") state.errors.nekosbest = "Reaction gallery sedang tidak tersedia.";
    populateTagSelects();
    renderChips();
  }

  function waifuParams(page) {
    var params = new URLSearchParams({ IsNsfw: "False", Page: String(page), PageSize: String(PAGE_SIZE) });
    var filters = state.filters;
    var included = filters.include.slice();
    if (state.selectedTag && !included.includes(state.selectedTag.slug)) included.push(state.selectedTag.slug);
    var exactQueryTag = state.tags.find(function (tag) { return tag.slug === state.query.toLowerCase() || tag.name.toLowerCase() === state.query.toLowerCase(); });
    if (exactQueryTag && !included.includes(exactQueryTag.slug)) included.push(exactQueryTag.slug);
    included.forEach(function (tag) { params.append("IncludedTags", tag); });
    filters.exclude.forEach(function (tag) { params.append("ExcludedTags", tag); });
    if (filters.artist && filters.artist.id) params.append("IncludedArtists", String(filters.artist.id));
    if (["Portrait", "Landscape", "Square"].includes(filters.orientation)) params.set("Orientation", filters.orientation);
    params.set("IsAnimated", filters.animated || "False");
    if (Number(filters.minWidth) > 0) params.set("Width", ">=" + Math.round(Number(filters.minWidth)));
    if (Number(filters.minHeight) > 0) params.set("Height", ">=" + Math.round(Number(filters.minHeight)));
    params.set("OrderBy", filters.sort || "Random");
    return params;
  }

  function canSearchWaifu() {
    if (!state.query) return true;
    if (state.selectedTag || state.filters.artist || state.filters.include.length) return true;
    var query = state.query.toLowerCase();
    return state.tags.some(function (tag) { return tag.slug === query || tag.name.toLowerCase() === query; });
  }

  async function fetchWaifuPage(page, signal, fresh) {
    if (!canSearchWaifu()) return { items: [], hasNextPage: false, skipped: true };
    var query = waifuParams(page).toString();
    var cacheKey = query;
    var cached = state.pageCache.get(cacheKey);
    if (!fresh && cached && Date.now() - cached.savedAt < 2 * 60 * 1000) return cached.value;
    var payload = await timeoutFetchJson(WAIFU_API + "/images?" + query, { signal: signal });
    var items = (Array.isArray(payload && payload.items) ? payload.items : []).map(normalizeWaifu).filter(Boolean);
    var value = { items: items, hasNextPage: Boolean(payload && payload.hasNextPage), skipped: false };
    state.pageCache.set(cacheKey, { savedAt: Date.now(), value: value });
    while (state.pageCache.size > 12) state.pageCache.delete(state.pageCache.keys().next().value);
    return value;
  }

  function imageCategories() { return state.categories.filter(function (item) { return item.format === "png"; }); }
  function reactionCategories() { return state.categories.filter(function (item) { return item.format === "gif"; }); }

  function chooseCategory(rows) {
    if (!rows.length) return "";
    return rows[Math.floor(Math.random() * rows.length)].name;
  }

  async function fetchNekosBatch(signal) {
    var reactions = state.mode === "reactions";
    if (state.query.length >= 2) {
      var search = new URLSearchParams({ action: "search", query: state.query, type: reactions ? "2" : "1", amount: reactions ? "12" : "20" });
      if (reactions && state.activeReaction) search.set("category", state.activeReaction);
      var searched = await timeoutFetchJson(NEKOS_API + "&" + search.toString(), { signal: signal, credentials: "same-origin" });
      return (Array.isArray(searched && searched.items) ? searched.items : []).map(normalizeNekos).filter(Boolean);
    }
    var category = reactions ? state.activeReaction : chooseCategory(imageCategories());
    if (!category) return [];
    var amount = reactions ? 12 : 10;
    var params = new URLSearchParams({ action: "category", category: category, amount: String(amount) });
    var payload = await timeoutFetchJson(NEKOS_API + "&" + params.toString(), { signal: signal, credentials: "same-origin" });
    return (Array.isArray(payload && payload.items) ? payload.items : []).map(normalizeNekos).filter(Boolean);
  }

  function shouldUseWaifu() { return state.mode !== "reactions" && ["all", "waifu-im"].includes(state.provider); }
  function shouldUseNekos() { return state.mode === "reactions" || ["all", "nekosbest"].includes(state.provider); }

  async function loadFeed(options) {
    options = options || {};
    var reset = Boolean(options.reset);
    if (state.mode === "saved") { renderSaved(); return; }
    if (state.loading && !reset) return;
    if (state.loading && reset && state.feedController) state.feedController.abort();
    if (!reset && !state.hasMore) return;

    var controller = new AbortController();
    state.feedController = controller;
    state.loading = true;
    ui.empty.hidden = true;
    ui.loadState.hidden = reset;
    if (reset) {
      state.items = [];
      state.seen = new Set();
      state.page = 1;
      state.hasMore = true;
      state.errors = {};
      renderSkeletons(12);
    } else {
      ui.loadState.hidden = false;
    }

    try {
      await ensureMetadata(controller.signal);
      if (controller.signal.aborted) return;
      renderChips();

      var requests = [];
      var requestNames = [];
      if (shouldUseWaifu()) { requests.push(fetchWaifuPage(state.page, controller.signal, Boolean(options.fresh))); requestNames.push("waifu"); }
      if (shouldUseNekos()) { requests.push(fetchNekosBatch(controller.signal)); requestNames.push("nekosbest"); }
      var results = await Promise.allSettled(requests);
      if (controller.signal.aborted) return;
      var waifuItems = [];
      var nekosItems = [];
      var waifuHasNext = false;
      results.forEach(function (result, index) {
        var name = requestNames[index];
        if (result.status === "rejected") {
          if (result.reason && result.reason.name === "AbortError") return;
          state.errors[name] = name === "waifu" ? "Waifu.im sedang tidak tersedia." : (state.mode === "reactions" ? "Reaction gallery sedang tidak tersedia." : "NEKOSBEST sedang tidak tersedia.");
          return;
        }
        delete state.errors[name];
        if (name === "waifu") {
          waifuItems = result.value.items;
          waifuHasNext = result.value.hasNextPage;
          if (!result.value.skipped) state.page += 1;
        } else nekosItems = result.value;
      });

      var combined = state.mode === "reactions" ? nekosItems : interleave([waifuItems, nekosItems]);
      addItems(combined, reset);
      var nekosCanContinue = shouldUseNekos() && !state.query && state.mode !== "random";
      state.hasMore = state.mode !== "random" && (waifuHasNext || nekosCanContinue);
      if (!state.items.length) ui.empty.hidden = false;
    } catch (error) {
      if (error && error.name !== "AbortError") {
        state.errors.gallery = "Galeri belum dapat dimuat. Coba lagi.";
        if (!state.items.length) ui.empty.hidden = false;
      }
    } finally {
      if (state.feedController === controller) {
        state.loading = false;
        ui.loadState.hidden = true;
        updateSummary();
        renderNotices();
      }
    }
  }

  function updateSummary() {
    if (state.mode === "saved") {
      ui.summary.textContent = state.favorites.size + " saved artwork";
      return;
    }
    var label = state.mode === "reactions" ? labelize(state.activeReaction || "reactions") : state.query ? "Results for “" + state.query + "”" : "Fresh visual discoveries";
    ui.summary.textContent = state.items.length + " items · " + label;
  }

  function renderNotices() {
    ui.notices.replaceChildren();
    Object.keys(state.errors).forEach(function (key) {
      var notice = create("div", "ag-notice");
      notice.appendChild(create("span", "", state.errors[key]));
      var retry = create("button", "", "Retry");
      retry.type = "button";
      retry.addEventListener("click", function () { state.metadataReady = false; loadFeed({ reset: true }); });
      notice.appendChild(retry);
      ui.notices.appendChild(notice);
    });
  }

  function renderSaved() {
    state.loading = false;
    state.hasMore = false;
    ui.loadState.hidden = true;
    state.items = Array.from(state.favorites.values());
    var query = state.query.toLowerCase();
    var items = !query ? state.items : state.items.filter(function (item) {
      var haystack = [item.artistName, item.animeName, item.category].concat((item.tags || []).map(function (tag) { return tag.name || tag.slug; })).join(" ").toLowerCase();
      return haystack.includes(query);
    });
    ui.gallery.replaceChildren();
    appendCards(items, true);
    ui.empty.hidden = items.length > 0;
    if (!items.length) {
      ui.empty.querySelector("h2").textContent = state.favorites.size ? "Tidak ada Saved yang cocok" : "Belum ada artwork tersimpan";
      ui.empty.querySelector("p").textContent = state.favorites.size ? "Coba kata pencarian lain." : "Tap ikon hati pada artwork yang ingin kamu simpan.";
    }
    updateSummary();
    renderNotices();
  }

  function renderChips() {
    ui.chips.replaceChildren();
    var rows = state.mode === "reactions" ? reactionCategories() : state.tags.slice(0, 14);
    if (!rows.length) {
      var loading = create("button", "", state.mode === "reactions" ? "Reaction categories unavailable" : "Topics are loading…");
      loading.disabled = true;
      ui.chips.appendChild(loading);
      return;
    }
    rows.forEach(function (row) {
      var value = state.mode === "reactions" ? row.name : row.slug;
      var active = state.mode === "reactions" ? state.activeReaction === value : state.selectedTag && state.selectedTag.slug === value;
      var button = create("button", active ? "is-active" : "", state.mode === "reactions" ? labelize(row.name) : row.name);
      button.type = "button";
      button.dataset.chip = value;
      button.setAttribute("aria-pressed", String(Boolean(active)));
      button.addEventListener("click", function () {
        if (state.mode === "reactions") {
          state.activeReaction = value;
          state.query = "";
          ui.searchInput.value = "";
        } else {
          state.selectedTag = active ? null : row;
          state.query = active ? "" : row.slug;
          ui.searchInput.value = state.query;
        }
        ui.searchClear.hidden = !state.query;
        renderChips();
        closeSuggestions();
        loadFeed({ reset: true });
      });
      ui.chips.appendChild(button);
    });
  }

  function setMode(mode) {
    if (!["discover", "illustrations", "reactions", "random", "saved"].includes(mode)) return;
    state.mode = mode;
    ui.modeTabs.querySelectorAll("button").forEach(function (button) {
      var active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    var reactions = mode === "reactions";
    var saved = mode === "saved";
    ui.provider.hidden = reactions || saved;
    ui.surprise.hidden = saved;
    ui.filterTrigger.hidden = reactions || saved;
    ui.searchInput.placeholder = reactions ? "Search anime reaction metadata..." : saved ? "Search saved artwork..." : "Search anime, tag, artist...";
    if (reactions) state.provider = "nekosbest";
    renderProvider();
    renderChips();
    closeSuggestions();
    loadFeed({ reset: true });
  }

  function renderProvider() {
    ui.provider.querySelectorAll("button").forEach(function (button) {
      var active = button.dataset.provider === state.provider;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function searchArtists(query, signal) {
    var params = new URLSearchParams({ Name: query, Page: "1", PageSize: "6" });
    return timeoutFetchJson(WAIFU_API + "/artists?" + params.toString(), { signal: signal }).then(function (payload) {
      return (Array.isArray(payload && payload.items) ? payload.items : []).map(function (artist) {
        return { id: String(artist.id || ""), name: String(artist.name || ""), count: numberOrNull(artist.imageCount) || 0 };
      }).filter(function (artist) { return artist.id && artist.name; });
    });
  }

  function closeSuggestions() { ui.suggestions.hidden = true; ui.suggestions.replaceChildren(); }

  async function renderSuggestions(query) {
    if (state.suggestionController) state.suggestionController.abort();
    if (query.length < 2) { closeSuggestions(); return; }
    var controller = new AbortController();
    state.suggestionController = controller;
    var tags = state.tags.filter(function (tag) { return tag.name.toLowerCase().includes(query.toLowerCase()) || tag.slug.includes(query.toLowerCase()); }).slice(0, 5);
    var reactions = reactionCategories().filter(function (item) { return item.name.includes(query.toLowerCase()); }).slice(0, 4);
    var artists = [];
    try { artists = await searchArtists(query, controller.signal); } catch (_) {}
    if (controller.signal.aborted || ui.searchInput.value.trim() !== query) return;
    ui.suggestions.replaceChildren();

    function section(label, rows, type) {
      if (!rows.length) return;
      ui.suggestions.appendChild(create("div", "ag-suggestion-label", label));
      rows.forEach(function (row) {
        var button = create("button", "ag-suggestion");
        button.type = "button";
        button.setAttribute("role", "option");
        button.appendChild(create("span", "", type === "tag" ? "#" : type === "artist" ? "A" : "✦"));
        var copy = create("span");
        copy.appendChild(create("strong", "", type === "reaction" ? labelize(row.name) : row.name));
        copy.appendChild(create("small", "", type === "tag" ? row.count + " artworks" : type === "artist" ? row.count + " works" : "Reaction GIF category"));
        button.appendChild(copy);
        button.appendChild(create("em", "", type === "tag" ? "Tag" : type === "artist" ? "Artist" : "GIF"));
        button.addEventListener("click", function () {
          if (type === "tag") {
            state.selectedTag = row;
            state.filters.artist = null;
            state.query = row.slug;
          } else if (type === "artist") {
            state.selectedTag = null;
            state.filters.artist = { id: row.id, name: row.name };
            state.query = row.name;
          } else {
            state.activeReaction = row.name;
            state.query = "";
            setMode("reactions");
          }
          ui.searchInput.value = state.query;
          ui.searchClear.hidden = !state.query;
          closeSuggestions();
          updateFilterBadge();
          if (type !== "reaction") { renderChips(); loadFeed({ reset: true }); }
        });
        ui.suggestions.appendChild(button);
      });
    }

    section("TAGS", tags, "tag");
    section("ARTISTS", artists, "artist");
    section("REACTIONS", reactions, "reaction");
    var direct = create("button", "ag-suggestion");
    direct.type = "button";
    direct.setAttribute("role", "option");
    direct.appendChild(create("span", "", "⌕"));
    var directCopy = create("span");
    directCopy.appendChild(create("strong", "", "Search “" + query + "”"));
    directCopy.appendChild(create("small", "", "Search NEKOSBEST metadata"));
    direct.appendChild(directCopy);
    direct.appendChild(create("em", "", "Search"));
    direct.addEventListener("click", function () { closeSuggestions(); loadFeed({ reset: true }); });
    ui.suggestions.appendChild(direct);
    ui.suggestions.hidden = false;
  }

  function populateTagSelects() {
    [ui.includeSelect, ui.excludeSelect].forEach(function (select) {
      var first = select.options[0];
      select.replaceChildren(first);
      state.tags.forEach(function (tag) {
        var option = create("option", "", tag.name);
        option.value = tag.slug;
        select.appendChild(option);
      });
    });
  }

  function renderDraftFilters() {
    ui.orientation.querySelectorAll("button").forEach(function (button) { button.classList.toggle("is-active", button.dataset.orientation === state.draftFilters.orientation); });
    ui.animated.value = state.draftFilters.animated;
    ui.sort.value = state.draftFilters.sort;
    ui.minWidth.value = state.draftFilters.minWidth;
    ui.minHeight.value = state.draftFilters.minHeight;
    ui.artistInput.value = state.draftFilters.artist ? state.draftFilters.artist.name : "";
    renderTagList(ui.includeList, state.draftFilters.include, "include");
    renderTagList(ui.excludeList, state.draftFilters.exclude, "exclude");
    renderArtistFilterResults(state.draftFilters.artist ? [state.draftFilters.artist] : []);
  }

  function renderTagList(container, rows, key) {
    container.replaceChildren();
    rows.forEach(function (slug) {
      var tag = state.tags.find(function (item) { return item.slug === slug; });
      var button = create("button", "", (tag ? tag.name : slug) + " ×");
      button.type = "button";
      button.addEventListener("click", function () {
        state.draftFilters[key] = state.draftFilters[key].filter(function (item) { return item !== slug; });
        renderDraftFilters();
      });
      container.appendChild(button);
    });
  }

  function addDraftTag(kind) {
    var select = kind === "include" ? ui.includeSelect : ui.excludeSelect;
    var opposite = kind === "include" ? "exclude" : "include";
    var value = select.value;
    if (!value || state.draftFilters[kind].includes(value)) return;
    state.draftFilters[opposite] = state.draftFilters[opposite].filter(function (tag) { return tag !== value; });
    state.draftFilters[kind].push(value);
    select.value = "";
    renderDraftFilters();
  }

  function renderArtistFilterResults(rows) {
    ui.artistResults.replaceChildren();
    rows.forEach(function (artist) {
      var button = create("button", state.draftFilters.artist && state.draftFilters.artist.id === artist.id ? "is-active" : "");
      button.type = "button";
      button.appendChild(create("strong", "", artist.name));
      button.appendChild(create("small", "", artist.count ? artist.count + " works" : "Selected artist"));
      button.addEventListener("click", function () {
        state.draftFilters.artist = { id: artist.id, name: artist.name };
        ui.artistInput.value = artist.name;
        renderArtistFilterResults([artist]);
      });
      ui.artistResults.appendChild(button);
    });
  }

  function openFilters() {
    state.draftFilters = cloneFilters(state.filters);
    renderDraftFilters();
    ui.filterBackdrop.hidden = false;
    ui.filterSheet.hidden = false;
    document.body.style.overflow = "hidden";
    ui.closeFilters.focus();
  }

  function closeFilters() {
    ui.filterBackdrop.hidden = true;
    ui.filterSheet.hidden = true;
    document.body.style.overflow = "";
    ui.filterTrigger.focus();
  }

  function activeFilterCount() {
    var filters = state.filters;
    var count = filters.include.length + filters.exclude.length;
    if (filters.artist) count += 1;
    if (filters.orientation !== DEFAULT_FILTERS.orientation) count += 1;
    if (filters.animated !== DEFAULT_FILTERS.animated) count += 1;
    if (filters.minWidth) count += 1;
    if (filters.minHeight) count += 1;
    if (filters.sort !== DEFAULT_FILTERS.sort) count += 1;
    return count;
  }

  function updateFilterBadge() {
    var count = activeFilterCount();
    ui.filterCount.hidden = count === 0;
    ui.filterCount.textContent = String(count);
  }

  function resetAllFilters() {
    state.filters = cloneFilters(DEFAULT_FILTERS);
    state.draftFilters = cloneFilters(DEFAULT_FILTERS);
    state.selectedTag = null;
    state.query = "";
    ui.searchInput.value = "";
    ui.searchClear.hidden = true;
    updateFilterBadge();
    renderDraftFilters();
    renderChips();
  }

  function detailRow(label, value) {
    var wrapper = create("div");
    wrapper.appendChild(create("dt", "", label));
    wrapper.appendChild(create("dd", "", value || "Not provided"));
    return wrapper;
  }

  function openDetail(item) {
    state.detailItem = item;
    ui.detailMedia.style.background = cleanColor(item.dominantColor);
    ui.detailImage.src = item.url;
    ui.detailImage.alt = item.artistName ? "Artwork anime oleh " + item.artistName : item.animeName ? "Reaction GIF dari " + item.animeName : "Anime artwork";
    ui.detailProvider.textContent = item.provider === "waifu-im" ? "Waifu.im" : "NEKOSBEST";
    ui.detailTitle.textContent = item.artistName ? "Artwork by " + item.artistName : item.animeName || labelize(item.category || "Artwork details");
    ui.detailByline.textContent = item.artistName ? "Artist attribution supplied by " + (item.provider === "waifu-im" ? "Waifu.im" : "NEKOSBEST") : item.animeName ? "Anime metadata supplied by NEKOSBEST" : "Creator metadata was not provided by the source API.";
    ui.detailMetadata.replaceChildren(
      detailRow("Dimensions", item.width && item.height ? item.width + " × " + item.height + " px" : "Not provided"),
      detailRow("File", (item.extension || "unknown").toUpperCase()),
      detailRow("Media", item.animated ? "Animated GIF" : "Still image"),
      detailRow("Provider", item.provider === "waifu-im" ? "Waifu.im" : "NEKOSBEST")
    );
    ui.detailTags.replaceChildren();
    (item.tags || []).forEach(function (tag) { ui.detailTags.appendChild(create("span", "", tag.name || labelize(tag.slug))); });
    var source = item.sourceUrl || item.artistUrl;
    ui.openSource.hidden = !source;
    ui.openSource.href = source || "#";
    ui.download.href = item.url;
    ui.download.download = "nexora-anime-" + item.id.replace(/[^a-z0-9]+/gi, "-") + "." + (item.extension || (item.animated ? "gif" : "png"));
    updateDetailSave();
    ui.detailBackdrop.hidden = false;
    ui.detail.hidden = false;
    document.body.style.overflow = "hidden";
    ui.detailClose.focus();
  }

  function updateDetailSave() {
    if (!state.detailItem) return;
    var saved = state.favorites.has(state.detailItem.id);
    ui.detailSave.classList.toggle("is-saved", saved);
    ui.detailSave.innerHTML = "<span>" + (saved ? "♥" : "♡") + "</span> " + (saved ? "Saved to this device" : "Save artwork");
  }

  function closeDetail() {
    ui.detailBackdrop.hidden = true;
    ui.detail.hidden = true;
    ui.detailImage.removeAttribute("src");
    state.detailItem = null;
    document.body.style.overflow = "";
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    var input = create("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
    return Promise.resolve();
  }

  function bindEvents() {
    ui.modeTabs.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-mode]");
      if (button) setMode(button.dataset.mode);
    });
    ui.provider.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-provider]");
      if (!button) return;
      state.provider = button.dataset.provider;
      renderProvider();
      loadFeed({ reset: true });
    });
    ui.savedShortcut.addEventListener("click", function () { setMode("saved"); });
    ui.surprise.addEventListener("click", function () {
      state.query = "";
      state.selectedTag = null;
      ui.searchInput.value = "";
      ui.searchClear.hidden = true;
      if (state.mode === "saved") setMode("random");
      else loadFeed({ reset: true, fresh: true });
    });
    ui.searchForm.addEventListener("submit", function (event) { event.preventDefault(); closeSuggestions(); loadFeed({ reset: true }); });
    ui.searchInput.addEventListener("input", function () {
      var next = ui.searchInput.value.trim();
      state.query = next;
      state.selectedTag = null;
      if (state.filters.artist && state.filters.artist.name.toLowerCase() !== next.toLowerCase()) state.filters.artist = null;
      ui.searchClear.hidden = !next;
      updateFilterBadge();
      clearTimeout(searchTimer);
      clearTimeout(suggestionTimer);
      if (state.mode === "saved") {
        searchTimer = setTimeout(renderSaved, 180);
      } else {
        searchTimer = setTimeout(function () { loadFeed({ reset: true }); }, 480);
        suggestionTimer = setTimeout(function () { renderSuggestions(next); }, 360);
      }
      if (!next) closeSuggestions();
    });
    ui.searchInput.addEventListener("focus", function () { if (state.query.length >= 2) renderSuggestions(state.query); });
    ui.searchClear.addEventListener("click", function () {
      ui.searchInput.value = "";
      state.query = "";
      state.selectedTag = null;
      state.filters.artist = null;
      ui.searchClear.hidden = true;
      closeSuggestions();
      updateFilterBadge();
      renderChips();
      loadFeed({ reset: true });
      ui.searchInput.focus();
    });
    document.addEventListener("click", function (event) { if (!ui.searchForm.contains(event.target)) closeSuggestions(); });
    ui.filterTrigger.addEventListener("click", openFilters);
    ui.closeFilters.addEventListener("click", closeFilters);
    ui.filterBackdrop.addEventListener("click", closeFilters);
    ui.orientation.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-orientation]");
      if (!button) return;
      state.draftFilters.orientation = button.dataset.orientation;
      renderDraftFilters();
    });
    ui.animated.addEventListener("change", function () { state.draftFilters.animated = ui.animated.value; });
    ui.sort.addEventListener("change", function () { state.draftFilters.sort = ui.sort.value; });
    ui.minWidth.addEventListener("input", function () { state.draftFilters.minWidth = ui.minWidth.value; });
    ui.minHeight.addEventListener("input", function () { state.draftFilters.minHeight = ui.minHeight.value; });
    ui.addInclude.addEventListener("click", function () { addDraftTag("include"); });
    ui.addExclude.addEventListener("click", function () { addDraftTag("exclude"); });
    ui.artistInput.addEventListener("input", function () {
      clearTimeout(artistTimer);
      var query = ui.artistInput.value.trim();
      if (state.artistController) state.artistController.abort();
      if (query.length < 2) { if (!query) { state.draftFilters.artist = null; renderArtistFilterResults([]); } return; }
      artistTimer = setTimeout(async function () {
        var controller = new AbortController();
        state.artistController = controller;
        try { renderArtistFilterResults(await searchArtists(query, controller.signal)); } catch (_) {}
      }, 420);
    });
    ui.clearArtist.addEventListener("click", function () { state.draftFilters.artist = null; ui.artistInput.value = ""; renderArtistFilterResults([]); });
    ui.resetFilters.addEventListener("click", function () { state.draftFilters = cloneFilters(DEFAULT_FILTERS); renderDraftFilters(); });
    ui.applyFilters.addEventListener("click", function () {
      state.filters = cloneFilters(state.draftFilters);
      state.selectedTag = null;
      if (state.filters.artist) { state.query = state.filters.artist.name; ui.searchInput.value = state.query; }
      updateFilterBadge();
      renderChips();
      closeFilters();
      loadFeed({ reset: true });
    });
    ui.resetEmpty.addEventListener("click", function () { resetAllFilters(); loadFeed({ reset: true }); });
    ui.detailClose.addEventListener("click", closeDetail);
    ui.detailBackdrop.addEventListener("click", closeDetail);
    ui.detailSave.addEventListener("click", function () { if (state.detailItem) toggleFavorite(state.detailItem); });
    ui.copyUrl.addEventListener("click", function () { if (state.detailItem) copyText(state.detailItem.url).then(function () { showToast("Image URL copied."); }); });
    ui.share.addEventListener("click", async function () {
      if (!state.detailItem) return;
      var data = { title: state.detailItem.artistName ? "Artwork by " + state.detailItem.artistName : "Nexora Anime Discover", url: state.detailItem.sourceUrl || state.detailItem.url };
      if (navigator.share) { try { await navigator.share(data); } catch (_) {} }
      else copyText(data.url).then(function () { showToast("Source link copied."); });
    });
    ui.detail.addEventListener("touchstart", function (event) {
      if (event.touches.length === 1) detailTouchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, scroll: ui.detail.scrollTop };
    }, { passive: true });
    ui.detail.addEventListener("touchend", function (event) {
      if (!detailTouchStart || !event.changedTouches.length || detailTouchStart.scroll > 0 || innerWidth >= 900) { detailTouchStart = null; return; }
      var touch = event.changedTouches[0];
      if (touch.clientY - detailTouchStart.y > 110 && Math.abs(touch.clientX - detailTouchStart.x) < 80) closeDetail();
      detailTouchStart = null;
    }, { passive: true });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (!ui.detail.hidden) closeDetail();
      else if (!ui.filterSheet.hidden) closeFilters();
      else closeSuggestions();
    });
  }

  var feedObserver = new IntersectionObserver(function (entries) {
    if (entries[0] && entries[0].isIntersecting && !state.loading && state.hasMore && state.mode !== "saved" && state.mode !== "random") loadFeed({ reset: false });
  }, { rootMargin: "900px 0px" });

  async function init() {
    updateSavedCount();
    updateFilterBadge();
    bindEvents();
    renderSkeletons(12);
    ui.chips.appendChild(create("button", "", "Topics are loading…"));
    feedObserver.observe(ui.sentinel);
    await loadFeed({ reset: true });
  }

  init();
})();
