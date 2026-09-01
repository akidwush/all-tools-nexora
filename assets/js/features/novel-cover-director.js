(function () {
  "use strict";

  var CHAT_MODEL = "gpt-5-nano";
  var ZONES = ["top", "center", "bottom"];
  var ALIGNS = ["left", "center", "right"];
  var FONT_MOODS = ["editorial-serif", "modern-serif", "clean-sans", "display-sans"];
  var STYLES = ["Anime Painterly", "Light Novel", "Manhwa", "Semi Realistic", "Realistic", "Dark Fantasy", "Elegant Fantasy", "Cinematic", "Soft Illustration", "Graphic Cover"];
  var MOODS = ["Soft", "Elegant", "Romantic", "Dark", "Mysterious", "Epic", "Melancholic", "Warm", "Cold", "Dreamlike"];
  var COMPOSITIONS = ["Close-up Portrait", "Bust Portrait", "Full Body", "Character + Environment", "Duo Character", "Silhouette", "Minimal Character", "Scenic Cover"];

  var PROFILES = Object.freeze({
    Fantasy: profile("Elegant Fantasy", "Dreamlike", "Character + Environment", "top", "center", "editorial-serif", "lower-center", ["#f6ead3", "#d7b36a", "#34234f"], "luminous magical atmosphere", "one refined magical motif"),
    Romance: profile("Soft Illustration", "Romantic", "Bust Portrait", "top", "center", "modern-serif", "lower-center", ["#fff4ed", "#d98f9f", "#503044"], "soft window light and intimate warmth", "subtle flowers or fabric movement"),
    Villainess: profile("Elegant Fantasy", "Elegant", "Bust Portrait", "top", "center", "modern-serif", "lower-right", ["#f5dfb9", "#a33d59", "#25172d"], "aristocratic editorial lighting", "restrained crest or jewel motif"),
    Yuri: profile("Soft Illustration", "Romantic", "Duo Character", "top", "center", "modern-serif", "lower-center", ["#fff1f6", "#c985b7", "#58416b"], "gentle luminous intimacy", "paired botanical motif"),
    Academy: profile("Light Novel", "Mysterious", "Character + Environment", "top", "center", "modern-serif", "lower-right", ["#f4e7c8", "#7c80b8", "#202b4c"], "clear academic daylight with secretive undertone", "architectural emblem or moon motif"),
    Isekai: profile("Light Novel", "Epic", "Full Body", "top", "center", "editorial-serif", "lower-center", ["#f7efd5", "#66a9b3", "#243a57"], "bright otherworldly portal light", "single portal or relic motif"),
    Action: profile("Cinematic", "Epic", "Full Body", "top", "left", "display-sans", "lower-right", ["#f8e6cf", "#d64c42", "#171a25"], "directional cinematic rim light", "one diagonal energy line"),
    "Dark Fantasy": profile("Dark Fantasy", "Dark", "Character + Environment", "top", "center", "editorial-serif", "lower-center", ["#e7dfd2", "#8f304b", "#17131d"], "restrained low-key chiaroscuro", "one ominous relic or thorn motif"),
    "Sci-Fi": profile("Graphic Cover", "Cold", "Character + Environment", "top", "left", "clean-sans", "lower-right", ["#e8fbff", "#4bd5e7", "#101b32"], "clean futuristic edge light", "one geometric interface-free symbol"),
    Mystery: profile("Cinematic", "Mysterious", "Minimal Character", "top", "left", "modern-serif", "lower-right", ["#f0eadc", "#8c7b68", "#202027"], "controlled pools of light and shadow", "one visual clue"),
    Horror: profile("Dark Fantasy", "Dark", "Silhouette", "top", "left", "display-sans", "lower-right", ["#e8e1d5", "#a33a3a", "#171416"], "subtle dread with deep negative space", "one implied threat, never gore"),
    "Modern Fantasy": profile("Semi Realistic", "Dreamlike", "Character + Environment", "top", "center", "modern-serif", "lower-right", ["#f4eee8", "#806ec7", "#23223c"], "contemporary cinematic light with magical accents", "one discreet supernatural motif")
  });

  function profile(visualStyle, mood, composition, titleZone, alignment, fontMood, subjectPlacement, palette, lighting, motif) {
    return { visualStyle: visualStyle, mood: mood, composition: composition, titleZone: titleZone, alignment: alignment, fontMood: fontMood, subjectPlacement: subjectPlacement, palette: palette, lighting: lighting, motif: motif };
  }

  function clean(value, limit) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit || 1000);
  }

  function pick(value, values, fallback) {
    return values.indexOf(value) === -1 ? fallback : value;
  }

  function hex(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
  }

  function createLocalPlan(input) {
    var base = PROFILES[input.genre] || PROFILES.Fantasy;
    var text = (clean(input.description, 3000) + " " + clean(input.character, 1200)).toLowerCase();
    var plan = Object.assign({}, base, { palette: base.palette.slice(), source: "genre-director", directorModel: "Nexora Cover Director" });
    if (/dua |two |pasangan|couple|bersama|kembar|rival/.test(text) && input.genre !== "Horror") plan.composition = "Duo Character";
    if (/kota|city|kerajaan|kingdom|academy|sekolah|library|perpustakaan|forest|hutan|space|planet/.test(text)) plan.composition = "Character + Environment";
    if (/sedih|kehilangan|grief|lonely|kesepian|tragic/.test(text)) plan.mood = "Melancholic";
    if (/perang|battle|fight|pertarungan|pahlawan|hero/.test(text)) plan.mood = "Epic";
    plan.artDirection = "Create a finished publishing cover with a clear focal subject, restrained detail, strong depth, and a deliberately quiet title area.";
    return plan;
  }

  function directorPrompt(input, fallback) {
    return [
      "You are Nexora Cover Director, a specialist in commercial novel-cover art direction.",
      "Analyze this novel and return one strict JSON object only. Do not use markdown and do not name living artists.",
      "Title: " + clean(input.title, 160),
      "Genre: " + clean(input.genre, 60),
      "Story: " + clean(input.description, 3000),
      input.character ? "Main character: " + clean(input.character, 1200) : "",
      "The final title is overlaid separately, so artwork must contain no words and must reserve a quiet title zone.",
      "Use these exact keys: visualStyle, mood, composition, titleZone, alignment, fontMood, subjectPlacement, palette, lighting, motif, artDirection.",
      "Allowed titleZone: top, center, bottom. Allowed alignment: left, center, right.",
      "Allowed fontMood: editorial-serif, modern-serif, clean-sans, display-sans.",
      "Allowed visualStyle: " + STYLES.join(", ") + ".",
      "Allowed mood: " + MOODS.join(", ") + ".",
      "Allowed composition: " + COMPOSITIONS.join(", ") + ".",
      "palette must contain exactly three #RRGGBB colors. Keep lighting, motif and artDirection under 140 characters each.",
      "Genre-safe fallback direction: " + JSON.stringify(fallback)
    ].filter(Boolean).join("\n");
  }

  function responseText(response) {
    if (typeof response === "string") return response;
    var content = response && response.message && response.message.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map(function (item) { return typeof item === "string" ? item : item && (item.text || item.content) || ""; }).join("");
    if (response && typeof response.text === "string") return response.text;
    if (response && typeof response.content === "string") return response.content;
    return "";
  }

  function parseJson(text) {
    var value = clean(text, 6000).replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    var start = value.indexOf("{");
    var end = value.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("DIRECTOR_INVALID_RESPONSE");
    return JSON.parse(value.slice(start, end + 1));
  }

  function normalize(raw, fallback) {
    raw = raw && typeof raw === "object" ? raw : {};
    var palette = Array.isArray(raw.palette) ? raw.palette.slice(0, 3) : [];
    while (palette.length < 3) palette.push(fallback.palette[palette.length]);
    return {
      visualStyle: pick(raw.visualStyle, STYLES, fallback.visualStyle),
      mood: pick(raw.mood, MOODS, fallback.mood),
      composition: pick(raw.composition, COMPOSITIONS, fallback.composition),
      titleZone: pick(raw.titleZone, ZONES, fallback.titleZone),
      alignment: pick(raw.alignment, ALIGNS, fallback.alignment),
      fontMood: pick(raw.fontMood, FONT_MOODS, fallback.fontMood),
      subjectPlacement: clean(raw.subjectPlacement, 80) || fallback.subjectPlacement,
      palette: [hex(palette[0], fallback.palette[0]), hex(palette[1], fallback.palette[1]), hex(palette[2], fallback.palette[2])],
      lighting: clean(raw.lighting, 140) || fallback.lighting,
      motif: clean(raw.motif, 140) || fallback.motif,
      artDirection: clean(raw.artDirection, 220) || fallback.artDirection,
      source: "ai-director",
      directorModel: CHAT_MODEL
    };
  }

  async function direct(puter, input) {
    var fallback = createLocalPlan(input);
    if (!puter || !puter.ai || typeof puter.ai.chat !== "function") return fallback;
    try {
      var answer = await puter.ai.chat(directorPrompt(input, fallback), { model: CHAT_MODEL, temperature: 0.2, max_tokens: 700 });
      return normalize(parseJson(responseText(answer)), fallback);
    } catch (_) {
      fallback.source = "genre-director-fallback";
      return fallback;
    }
  }

  function buildArtworkPrompt(input, plan) {
    plan = plan || createLocalPlan(input);
    var titleZone = plan.titleZone === "bottom" ? "bottom 25%" : plan.titleZone === "center" ? "middle band" : "top 28%";
    return [
      "FINISHED PROFESSIONAL NOVEL COVER ARTWORK, vertical 2:3 publishing cover, not a poster, not a character sheet, not a standalone portrait.",
      "Genre: " + clean(input.genre, 60) + ". Story concept: " + clean(input.description, 3000) + ".",
      input.character ? "Main character continuity: " + clean(input.character, 1200) + "." : "Derive only the essential character from the story.",
      "Cover direction: " + plan.artDirection,
      "Visual language: " + plan.visualStyle + ". Mood: " + plan.mood + ". Composition: " + plan.composition + ".",
      "Place the main subject " + plan.subjectPlacement + " and preserve the " + titleZone + " as deliberately quiet negative space for later title typography.",
      "Lighting: " + plan.lighting + ". Motif: " + plan.motif + ". Palette anchors: " + plan.palette.join(", ") + ".",
      "Use foreground, middle ground and background depth. Keep the face, hands and story symbol clear. Make the hierarchy readable as a small bookstore thumbnail.",
      "CRITICAL: render artwork only. No title, no author, no words, no letters, no captions, no logo, no watermark, no border, no UI, no mockup.",
      "Avoid generic wallpaper composition, excessive empty margins, centered passport pose, visual clutter, heavy bloom, oversaturation, duplicated characters and cropped anatomy.",
      input.customDirection ? "User direction: " + clean(input.customDirection, 800) + "." : ""
    ].filter(Boolean).join("\n");
  }

  function providerDirection(plan) {
    return clean([
      "Nexora Cover Director:", plan.artDirection + ".", "Subject " + plan.subjectPlacement + ".",
      "Reserve " + plan.titleZone + " title zone.", "Lighting " + plan.lighting + ".",
      "Motif " + plan.motif + ".", "Palette " + plan.palette.join(", ") + ".",
      "Finished publishing cover, not poster; no text or logo."
    ].join(" "), 800);
  }

  function luminance(hexValue) {
    var value = hex(hexValue, "#ffffff").slice(1);
    var rgb = [0, 2, 4].map(function (index) { var c = parseInt(value.slice(index, index + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function zoneMetrics(context, width, height, zone) {
    var ranges = { top: [0.04, 0.32], center: [0.34, 0.62], bottom: [0.66, 0.9] };
    var range = ranges[zone] || ranges.top;
    try {
      var sampleWidth = Math.min(96, width);
      var sampleHeight = Math.min(64, Math.max(16, Math.round(height * (range[1] - range[0]))));
      var data = context.getImageData(0, Math.round(height * range[0]), width, Math.max(1, Math.round(height * (range[1] - range[0]))));
      var stepX = Math.max(1, Math.floor(data.width / sampleWidth));
      var stepY = Math.max(1, Math.floor(data.height / sampleHeight));
      var total = 0, count = 0, detail = 0, previous = null;
      for (var y = 0; y < data.height; y += stepY) {
        previous = null;
        for (var x = 0; x < data.width; x += stepX) {
          var index = (y * data.width + x) * 4;
          var light = (data.data[index] * 0.2126 + data.data[index + 1] * 0.7152 + data.data[index + 2] * 0.0722) / 255;
          total += light;
          if (previous !== null) detail += Math.abs(light - previous);
          previous = light;
          count++;
        }
      }
      return { light: count ? total / count : 0.4, detail: count ? detail / count : 0.2 };
    } catch (_) {
      return { light: luminance("#777777"), detail: 0.18 };
    }
  }

  function typography(context, width, height, plan) {
    plan = plan || createLocalPlan({ genre: "Fantasy" });
    var metrics = zoneMetrics(context, width, height, plan.titleZone);
    var darkText = metrics.light > 0.62;
    var foreground = darkText ? plan.palette[2] : plan.palette[0];
    if (darkText && luminance(foreground) > 0.35) foreground = "#17131f";
    if (!darkText && luminance(foreground) < 0.55) foreground = "#f7f1e7";
    return {
      zone: plan.titleZone,
      align: plan.alignment,
      fontMood: plan.fontMood,
      color: foreground,
      accent: plan.palette[1],
      darkText: darkText,
      backdrop: metrics.detail > 0.105,
      metrics: metrics
    };
  }

  function titleScale(title) {
    var length = clean(title, 160).length;
    if (length <= 10) return 0.112;
    if (length <= 22) return 0.092;
    if (length <= 38) return 0.076;
    return 0.064;
  }

  window.NexoraNovelCoverDirector = Object.freeze({
    chatModel: CHAT_MODEL,
    createLocalPlan: createLocalPlan,
    direct: direct,
    buildArtworkPrompt: buildArtworkPrompt,
    providerDirection: providerDirection,
    typography: typography,
    titleScale: titleScale,
    normalize: normalize,
    responseText: responseText
  });
})();
