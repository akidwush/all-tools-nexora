// Trimpath Gen engine — assembles per-letter AM XML templates into one word/line animation.
// Rule: never rewrite what's INSIDE a letter's template (its own stroke/mask/path data stays untouched).
// We only touch the letter's outer <embedScene> wrapper: id, startTime/endTime/outTime, transform/location, fillColor.

(function (global) {
  var LETTER_DURATION = 1999; // every source letter clip is authored at this local length (ms) — never changed
  var CANVAS_W = 1920, CANVAS_H = 1080;
  var REF_SCALE = 0.359259; // scale applied to a 420-unit glyph in the reference example
  var REF_PX = 40; // the "px" value the UI shows for that reference scale

  function pxToSceneScale(px) {
    return (px / REF_PX) * REF_SCALE;
  }

  function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    if (hex.length === 8) hex = hex.slice(2); // strip leading AA from AARRGGBB
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToAmHex(r, g, b, a) {
    a = a === undefined ? 255 : a;
    function h(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase(); }
    return '#' + h(a) + h(r) + h(g) + h(b);
  }
  // Any color entering the pipeline (user picker, palette) gets normalized to AM's #AARRGGBB.
  function normalizeColor(hex) {
    var rgb = hexToRgb(hex);
    return rgbToAmHex(rgb.r, rgb.g, rgb.b, 255);
  }
  function lerpColor(c1, c2, t) {
    var a = hexToRgb(c1), b = hexToRgb(c2);
    return rgbToAmHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
  }

  // t in [0,1] describes a letter's normalized horizontal position across the whole text.
  function mapColorForT(t, mode, colors, repeatEvery, totalLetters, index) {
    colors = (colors && colors.length ? colors : ['#FFFFFF']).map(normalizeColor);
    if (mode === 'single' || colors.length === 1) return colors[0];
    if (mode === 'repeat') {
      var span = Math.max(1, repeatEvery || 2);
      var posInCycle = index % span;
      var cycleT = span > 1 ? posInCycle / (span - 1) : 0;
      return sampleStops(colors, cycleT);
    }
    if (mode === 'mirror') {
      var mt = t <= 0.5 ? t * 2 : (1 - t) * 2;
      return sampleStops(colors, mt);
    }
    // linear (default)
    return sampleStops(colors, t);
  }
  function sampleStops(colors, t) {
    if (colors.length === 1) return colors[0];
    var seg = 1 / (colors.length - 1);
    var idx = Math.min(colors.length - 2, Math.floor(t / seg));
    var localT = (t - idx * seg) / seg;
    return lerpColor(colors[idx], colors[idx + 1], localT);
  }

  // Replace every occurrence of the letter's ORIGINAL fill color inside its own raw blob
  // (outer wrapper + any nested "Group and Mask N" levels) with the target color.
  // Stroke/mask shapes use a different color entirely so a global replace of the exact
  // original hex never touches them.
  function recolorLetterBlob(raw, originalColor, targetColor) {
    if (!originalColor || originalColor.toUpperCase() === targetColor.toUpperCase()) {
      return raw.split(originalColor).join(targetColor);
    }
    return raw.split(originalColor).join(targetColor);
  }

  // Pull out everything between a letter's own outer <scene ...> and its matching
  // </scene> (the "Group and Mask 1" + "Rectangle 1" pair) — the part that "Style"
  // wraps three times over. The outer <scene> is always the ONLY one at that depth in a
  // raw letter blob (every other <scene> is nested deeper inside it), so first-open /
  // last-close is safe.
  function extractInnerContent(raw) {
    var openMatch = raw.match(/<scene\b[^>]*>/);
    if (!openMatch) return null;
    var start = openMatch.index + openMatch[0].length;
    var end = raw.lastIndexOf('</scene>');
    if (end < start) return null;
    return raw.slice(start, end);
  }

  // "Style" = a colored flash (solid) + glow (blurred, additive) that fade out fast,
  // revealing the real letter underneath — verified against a real "Style Orange" export:
  // every letter there was the SAME base template wrapped three independent times, only
  // the outer tint/blend/blur/opacity/timing differed. Reproduced generically here so any
  // style color works on any letter, instead of needing every letter hand-built per style.
  var STYLE_SCENE_ATTRS = 'title="" width="424" height="424" exportWidth="1920" exportHeight="1080" bgcolor="#00000000" totalTime="2266" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off"';
  // innerContent gets copied into all 3 layers verbatim, which means the handful of small
  // ids it carries (the "Group and Mask 1"/mask/shape ids baked into every raw letter
  // template) would otherwise collide 3-for-1 within the same parent scene — almost
  // certainly why Alight Motion refused to import the first version of this. Re-number
  // each copy into its own private id band before reusing it.
  function offsetIds(content, offset) {
    return content.replace(/id="(\d+)"/g, function (m, n) {
      return 'id="' + (parseInt(n, 10) + offset) + '"';
    });
  }
  function buildStyleLayers(innerContent, idBase, styleColor, realColor) {
    var flash = normalizeColor(styleColor);
    var real = normalizeColor(realColor);
    var inner1 = offsetIds(innerContent, idBase);
    var innerGlowA = offsetIds(innerContent, idBase + 100);
    var innerGlowB = offsetIds(innerContent, idBase + 100); // reused verbatim inside the same glow layer — confirmed against a real export that this local duplication is fine
    var inner3 = offsetIds(innerContent, idBase + 200);
    var layer1 = // solid color flash, fades out fast
      '<embedScene id="' + (idBase + 301) + '" label="Group 1" startTime="0" endTime="2266" fillType="color">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/>' +
      '<opacity><kf t="0.247059" v="1.000000"/><kf t="0.423529" v="0.000000"/></opacity></transform>' +
      '<fillColor value="' + flash + '"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + inner1 + '</scene>' +
      '</embedScene>';
    // Glow isn't a single blurred copy — it's TWO overlaid copies (a plain one + a second
    // "Copy" blended with "exclude") composited together first, and only THAT composite
    // gets blurred + additively blended. Skipping the exclude-blended second copy was the
    // structural piece missing before — verified against real per-letter style exports.
    var glowInner =
      '<embedScene id="' + (idBase + 310) + '" label="Group 1" startTime="0" endTime="2265" fillType="intrinsic">' +
      '<transform><location value="212.000000,212.000000,0.000000"/><pivot value="-2.000000,-2.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerGlowA + '</scene>' +
      '</embedScene>' +
      '<embedScene id="' + (idBase + 311) + '" label="Group 1 Copy" startTime="84" endTime="2349" fillType="intrinsic" blending="exclude">' +
      '<transform><location value="212.000000,212.000000,0.000000"/><pivot value="-2.000000,-2.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerGlowB + '</scene>' +
      '</embedScene>';
    var layer2 = // blurred additive glow behind the flash, fades out slightly after it
      '<embedScene id="' + (idBase + 302) + '" label="Group and Mask 1" startTime="34" endTime="2383" fillType="color" blending="linear-dodge" outTime="2349">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-2.000000,-2.000000"/>' +
      '<opacity><kf t="0.261429" v="1.000000"/><kf t="0.447000" v="0.000000"/></opacity></transform>' +
      '<fillColor value="' + flash + '"/>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.620000"/></effect>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + glowInner + '</scene>' +
      '</embedScene>';
    // Confirmed against a user-corrected reference export: this layer stays intrinsic —
    // it shows the letter's own native artwork color, never tinted by the style color.
    // Only the flash (layer1) and glow (layer2) get the mapped style color.
    var layer3 = // the real, permanent letter underneath — starts a beat later, never fades
      '<embedScene id="' + (idBase + 303) + '" label="Group 1 Copy 3" startTime="84" endTime="2383" fillType="intrinsic" outTime="2299">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
      '<fillColor value="' + real + '"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + inner3 + '</scene>' +
      '</embedScene>';
    return layer1 + layer2 + layer3;
  }

  // Every animated preset composes the SAME two-layer mechanism, just with a different
  // axis/direction/speed per layer — verified against the real Move In and Move In Up
  // preset files (letters always move by one uniform delta regardless of which letter it
  // is; the null's own animation is independent per preset, sometimes off entirely).
  //   letterAxis/letterSign: which axis + direction the per-letter local slide uses.
  //   nullAnimated: false → null is a static (0,0) handle, all motion lives on letters
  //     (this is Move In Up's real structure — its null never moves at all).
  //   nullAxis/nullSign: which axis + direction the null's own slide uses, when animated.
  //   nullDense: shorter/snappier arrival window ("keyframe lebih padat") instead of the
  //     normal ~0.5s settle.
  var ANIM_CONFIGS = {
    movein: { letterAxis: 'x', letterSign: 1, nullAnimated: true, nullAxis: 'x', nullSign: 1, nullDense: false },
    moveinup: { letterAxis: 'y', letterSign: 1, nullAnimated: false },
    inupmove: { letterAxis: 'y', letterSign: 1, nullAnimated: true, nullAxis: 'x', nullSign: 1, nullDense: true },
    movefromleft: { letterAxis: 'x', letterSign: -1, nullAnimated: true, nullAxis: 'x', nullSign: -1, nullDense: false },
  };

  function buildLocationBlock(x, y, animPreset, letterShiftX, letterShiftY) {
    var cfg = ANIM_CONFIGS[animPreset];
    if (!cfg) {
      return '<location value="' + x.toFixed(6) + ',' + y.toFixed(6) + ',0.000000"/>';
    }
    var offX = x, offY = y;
    if (cfg.letterAxis === 'x') offX = x + cfg.letterSign * letterShiftX;
    else if (cfg.letterAxis === 'y') offY = y + cfg.letterSign * letterShiftY;
    var arriveT = 0.242718;
    return (
      '<location>' +
      '<kf t="' + arriveT.toFixed(6) + '" v="' + x.toFixed(6) + ',' + y.toFixed(6) + ',0.000000" e="cubicBezier 0.42 0.0 0.07999998 1.0"/>' +
      '<kf t="0.000000" v="' + offX.toFixed(6) + ',' + offY.toFixed(6) + ',0.000000"/>' +
      '</location>'
    );
  }

  function buildNullObj(nullId, animPreset, sceneScale, sceneEndMs, maxStartMs) {
    var cfg = ANIM_CONFIGS[animPreset];
    if (!cfg) return '';
    if (!cfg.nullAnimated) {
      return (
        '<nullobj id="' + nullId + '" label="Null 1" startTime="0" endTime="' + Math.round(sceneEndMs) + '" fillType="none">' +
        '<transform><location value="0.000000,0.000000,0.000000"/></transform>' +
        '</nullobj>'
      );
    }
    var slide = 340 * sceneScale * cfg.nullSign;
    var slideX = cfg.nullAxis === 'x' ? slide : 0;
    var slideY = cfg.nullAxis === 'y' ? slide : 0;
    // Long stagger/last-start spreads would otherwise let late letters appear already
    // fully settled (the null having finished its slide before they even start) — stretch
    // the arrival point so every letter still catches part of the motion. "Dense" presets
    // get a shorter base window for a snappier, more compact settle.
    var arriveSec = cfg.nullDense
      ? Math.max(0.25, (maxStartMs || 0) / 1000 + 0.15)
      : Math.max(0.505, (maxStartMs || 0) / 1000 + 0.35);
    return (
      '<nullobj id="' + nullId + '" label="Null 1" startTime="0" endTime="' + Math.round(sceneEndMs) + '" fillType="none">' +
      '<transform><location>' +
      '<kf t="0.000000" v="' + slideX.toFixed(6) + ',' + slideY.toFixed(6) + ',0.000000"/>' +
      '<kf t="' + arriveSec.toFixed(6) + '" v="0.000000,0.000000,0.000000" e="cubicBezier 0.42 0.0 0.046076678 1.0"/>' +
      '</location></transform>' +
      '</nullobj>'
    );
  }

  // Filter: one full-canvas rectangle, sitting as a root-level sibling of the letters and
  // null (never nested inside a letter) — verified against a real "filter hue glow" export.
  // Four chained AM effects: Copy Background (aka "lift" internally), Soft Glow, Hue Shift,
  // Edge Glow. Fully independent of per-letter color — hue=0 leaves the base tint alone;
  // sliding it rotates the whole overlay's color, unrelated to Warna/Mapping.
  function buildFilterShape(shapeId, hue, glow, edgeGlow) {
    return (
      '<shape id="' + shapeId + '" label="Rectangle 1" startTime="0" endTime="1999" fillType="color" s=".rect">' +
      '<transform><location value="960.000000,540.000000,0.000000"/><scale value="9.600000,5.400000"/>' +
      '<opacity><kf t="0.292146" v="1.000000"/><kf t="0.842421" v="0.000000"/></opacity></transform>' +
      '<fillColor value="#FFF4CAF1"/>' +
      '<effect id="com.alightcreative.effects.lift" locallyApplied="true"/>' +
      '<effect id="com.alightcreative.effects.softglow" locallyApplied="true">' +
      '<property name="blend" type="float" value="0.170000"/>' +
      '<property name="brightness" type="float"><kf t="0.292146" v="1.410000"/><kf t="0.558779" v="0.000000"/></property>' +
      '<property name="color" type="color" value="#FFFF3B30"/>' +
      '<property name="strength" type="float" value="' + glow.toFixed(6) + '"/>' +
      '</effect>' +
      '<effect id="com.alightcreative.effects.hueshift" locallyApplied="true">' +
      '<property name="hue" type="float" value="' + hue.toFixed(6) + '"/>' +
      '</effect>' +
      '<effect id="com.alightcreative.effects.edgeglow" locallyApplied="true">' +
      '<property name="smoothing" type="float" value="' + edgeGlow.toFixed(6) + '"/>' +
      '</effect>' +
      '</shape>'
    );
  }

  // Dark's outer per-letter wrapper carries this AM built-in effect (identical keyframes
  // on every letter, verified against the reference) — on top of the 4-layer composite,
  // never present on Orange.
  var DARK_GLOWSCAN_EFFECT = '<effect id="com.alightcreative.effects.glowscan" locallyApplied="true"><property name="threshold" type="float"><kf t="0.406096" v="0.610000"/><kf t="0.137926" v="0.270000"/></property></effect>';

  // Dark is 4 layers, not 3 — flash (Color A) + glow (Color B) + real letter (Color 1,
  // optionally animated dark-to-white) + a circle-sweep highlight masked to the letter
  // shape. Verified against real exports ("black glow", "black to light glow", a
  // root-level filter file that confirmed the circle-sweep is part of the base composite,
  // and a "light to dark" pair that confirmed the #15161F dark end). Whichever end of the
  // real-letter's fade is fixed (never follows the mapping) is always the same constant:
  // white for Dark to Light/Light to Colorize, #15161F (Dark's own default) for Light to Dark.
  // fadeDirection: 'light' (Dark to Light: mapped color -> white), 'colorize' (Light to
  // Colorize: white -> mapped color), 'todark' (Light to Dark: mapped color -> #15161F),
  // or null/false (Dark: flat, no fade).
  function buildDarkStyleLayers(innerContent, idBase, colorA, colorB, color1, fadeDirection) {
    var a = normalizeColor(colorA);
    var b = normalizeColor(colorB);
    var c1 = normalizeColor(color1);
    var inner1 = offsetIds(innerContent, idBase);
    var innerGlowA = offsetIds(innerContent, idBase + 100);
    var innerGlowB = offsetIds(innerContent, idBase + 100);
    var inner3 = offsetIds(innerContent, idBase + 200);
    var inner4 = offsetIds(innerContent, idBase + 300);

    var layer1 = // flash, flat color A
      '<embedScene id="' + (idBase + 301) + '" label="Group 1 Copy" startTime="0" endTime="2266" fillType="color">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/>' +
      '<opacity><kf t="0.261429" v="1.000000"/><kf t="0.447000" v="0.000000"/></opacity></transform>' +
      '<fillColor value="' + a + '"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + inner1 + '</scene>' +
      '</embedScene>';
    var glowInner =
      '<embedScene id="' + (idBase + 320) + '" label="Group 1 Copy 2" startTime="0" endTime="2266" fillType="intrinsic">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerGlowA + '</scene>' +
      '</embedScene>' +
      '<embedScene id="' + (idBase + 321) + '" label="Group 1 Copy" startTime="67" endTime="2333" fillType="intrinsic" blending="exclude">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerGlowB + '</scene>' +
      '</embedScene>';
    var layer2 = // glow, flat color B, blurred (no additive blend here — unlike Orange)
      '<embedScene id="' + (idBase + 302) + '" label="Group and Mask 1" startTime="34" endTime="2367" fillType="color">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-2.000000,-2.000000"/></transform>' +
      '<fillColor value="' + b + '"/>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.430000"/></effect>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + glowInner + '</scene>' +
      '</embedScene>';
    var fillColorTag = fadeDirection === 'light'
      ? '<fillColor><kf t="0.140056" v="' + c1 + '"/><kf t="0.226491" v="#FFFFFFFF"/></fillColor>'
      : fadeDirection === 'colorize'
        ? '<fillColor><kf t="0.140056" v="#FFFFFFFF"/><kf t="0.226491" v="' + c1 + '"/></fillColor>'
        : fadeDirection === 'todark'
          ? '<fillColor><kf t="0.140056" v="' + c1 + '"/><kf t="0.226491" v="#FF15161F"/></fillColor>'
          : '<fillColor value="' + c1 + '"/>';
    var layer3 = // real letter — colored (never intrinsic for Dark, unlike Orange)
      '<embedScene id="' + (idBase + 303) + '" label="Group 1 Copy 3" startTime="84" endTime="2583" fillType="color" outTime="2499">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
      fillColorTag +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + inner3 + '</scene>' +
      '</embedScene>';
    // The masked copy inside this circle-sweep stays the fixed default flash grey
    // regardless of the user's Color A pick — confirmed against the reference, it's a
    // structural mask, not a visible "Color A" instance, so it must never follow mapping.
    var layer4 =
      '<embedScene id="' + (idBase + 304) + '" label="Group and Mask 2" startTime="0" endTime="2266" fillType="intrinsic" blending="linear-dodge" outTime="2266">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-2.000000,-2.000000"/><opacity value="0.600000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' +
      '<shape id="' + (idBase + 305) + '" label="Circle 1" startTime="0" endTime="1999" fillType="color" blending="linear-dodge" s=".circle">' +
      '<transform><location><kf t="0.000000" v="60.500000,517.500000,0.000000"/><kf t="0.624671" v="456.513702,-19.546600,0.000000" e="cubicBezier 0.42 0.0 0.08737461 1.0"/></location>' +
      '<scale value="1.600000,1.600000"/></transform>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.650000"/></effect>' +
      '</shape>' +
      '<embedScene id="' + (idBase + 306) + '" label="Group 1" startTime="0" endTime="2266" fillType="color" blending="mask">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
      '<fillColor value="#FF707A79"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + inner4 + '</scene>' +
      '</embedScene>' +
      '</scene>' +
      '</embedScene>';
    return layer1 + layer2 + layer3 + layer4;
  }

  // Star Blue — verified against a real "F Star Blue" export, then revised against a
  // real hand-edited "A Star Blue Revisi" export that simplified the layer set: no blurred
  // star duplicate, the star burst fades out instead of staying, and there are TWO gradient
  // "real letter" passes — an early one that fades (a slow color settle, not a quick flash)
  // and a later permanent one that stays. Plus a persistent (never-fades) glow layer on top
  // of the one that fades (Orange only ever has the fading one). Colors are a 2-stop linear
  // gradient, not a flat hex — every tinted layer, INCLUDING the permanent real letter,
  // follows the gradient (confirmed intentional; unlike Orange the real letter is never left
  // at its native artwork color for this style).
  // The reference files build their star-mask and gradient copies by editing the SAME
  // "Group and Mask 1" embedScene in place (same id, same transform) rather than nesting a
  // second wrapper around it — but that only stays correct per-letter because its transform
  // already carries that letter's own pivot. Reusing full innerContent copies (the same
  // trick buildStyleLayers/buildDarkStyleLayers already rely on) gets the identical visual
  // result without needing every irregular letter's internal pivot data by hand.
  var STAR_GLOWSCAN_EFFECT = '<effect id="com.alightcreative.effects.glowscan" locallyApplied="true"><property name="alpha" type="float"><kf t="0.262812" v="1.000000"/><kf t="0.386230" v="0.000000"/></property><property name="strength" type="float" value="0.230000"/><property name="threshold" type="float" value="0.770000"/></effect>';

  // Star's own fillColor is the only tinted part of the burst (the repeat.grid effect's
  // optional "Fill Color" blend override is unused in the reference — confirmed against the
  // real export, that property doesn't even appear in it — so it's not exposed here).
  function starBurstTemplate(starColor) {
    return (
      '<embedScene id="8" label="Group 1" startTime="0" endTime="1933" fillType="intrinsic" outTime="1933">' +
      '<transform><location value="275.422028,702.280762,0.000000"/><pivot value="-65.020599,-65.412415"/><scale value="0.758278,0.758278"/><rotation value="-135.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<effect id="com.alightcreative.effects.edgeglow" locallyApplied="true"><property name="smoothing" type="float" value="4.570000"/></effect>' +
      '<scene title="" width="1082" height="1082" exportWidth="1920" exportHeight="1080" bgcolor="#00000000" totalTime="1999" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off">' +
      '<embedScene id="11" label="Group 2" startTime="0" endTime="1999" fillType="intrinsic" outTime="1999">' +
      '<transform><location value="540.000000,540.000000,0.000000"/><pivot value="-65.020599,-65.412415"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene title="" width="1082" height="1082" exportWidth="1920" exportHeight="1080" bgcolor="#00000000" totalTime="1999" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off">' +
      '<embedScene id="9" label="Group 1" startTime="0" endTime="1999" fillType="intrinsic">' +
      '<transform><location value="540.000000,540.000000,0.000000"/><pivot value="-64.020599,-65.412415"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene title="" width="1082" height="1082" exportWidth="1920" exportHeight="1080" bgcolor="#00000000" totalTime="1999" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off">' +
      '<shape id="7" label="Star 1" startTime="0" endTime="1999" fillType="color" s=".star">' +
      '<transform><location value="475.979401,474.587585,0.000000"/><scale value="0.318319,0.318319"/></transform>' +
      '<fillColor value="' + normalizeColor(starColor) + '"/>' +
      '<effect id="com.alightcreative.effects.repeat.grid" locallyApplied="true">' +
      '<property name="blend" type="float" value="1.000000"/>' +
      '<property name="count" type="float" value="11.000000"/>' +
      '<property name="easeIn" type="float" value="1.000000"/>' +
      '<property name="easeOut" type="float" value="-0.560000"/>' +
      '<property name="invert" type="bool" value="true"/>' +
      '<property name="phase" type="float"><kf t="0.000000" v="0.905000"/><kf t="0.997000" v="-0.938000" e="cubicBezier 0.0 0.0 0.08147491 1.0"/></property>' +
      '<property name="position" type="vec2" value="520.000000,520.000000"/>' +
      '<property name="scale" type="float" value="0.000000"/>' +
      '<property name="shape" type="int" value="3"/>' +
      '<property name="stagger" type="float" value="23.000000"/>' +
      '</effect>' +
      '<property name="pointCount" type="float" value="4.000000"/>' +
      '</shape>' +
      '</scene></embedScene></scene></embedScene></scene></embedScene>'
    );
  }

  function buildStarStyleLayers(innerContent, idBase, gradStartColor, gradEndColor, starColor) {
    var gradTag = '<gradient type="linear" startColor="' + normalizeColor(gradStartColor) + '" endColor="' + normalizeColor(gradEndColor) + '" start="0.000000,0.000000" end="1.000000,1.000000"/>';

    var innerStar = offsetIds(innerContent, idBase);
    var innerGradientFade = offsetIds(innerContent, idBase + 200);
    var innerGlowFadeA = offsetIds(innerContent, idBase + 300);
    var innerGlowFadeB = offsetIds(innerContent, idBase + 300); // reused verbatim within the same glow composite — same trick buildStyleLayers' glowInner uses
    var innerGlowStayA = offsetIds(innerContent, idBase + 400);
    var innerGlowStayB = offsetIds(innerContent, idBase + 400);
    var innerFinal = offsetIds(innerContent, idBase + 700);
    var starBurst = offsetIds(starBurstTemplate(starColor), idBase + 600);

    // 1. star burst, masked to the letter's own (progressive) reveal, fading out partway
    // through — no blurred duplicate (dropped in the revised reference: a single sharp copy
    // reads cleaner once it fades instead of lingering).
    var layerStar =
      '<embedScene id="' + (idBase + 900) + '" label="Group and Mask 2" startTime="0" endTime="1999" fillType="intrinsic" outTime="1999">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-1.000000,-1.000000"/>' +
      '<opacity><kf t="0.392196" v="1.000000"/><kf t="0.517259" v="0.000000"/></opacity></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + starBurst +
      '<embedScene id="' + (idBase + 901) + '" label="Group and Mask 1" startTime="0" endTime="1999" fillType="intrinsic" blending="mask" outTime="1999">' +
      '<transform><location value="212.000000,212.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerStar + '</scene>' +
      '</embedScene>' +
      '</scene></embedScene>';

    // 2. gradient color pass — a slower fade-in-then-out settle (not a quick flash), gone by
    // the time the permanent letter (layer 5) takes over.
    var layerGradientFade =
      '<embedScene id="' + (idBase + 904) + '" label="Group and Mask 1" startTime="217" endTime="1999" fillType="gradient" outTime="1782">' +
      '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="-1.000000,-1.000000"/>' +
      '<opacity><kf t="0.383277" v="1.000000"/><kf t="0.520137" v="0.000000"/></opacity></transform>' +
      gradTag +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerGradientFade + '</scene>' +
      '</embedScene>';

    // Same two-copy (plain + exclude-blended, slightly offset) composite trick as Orange's
    // glow — built twice here, once per glow layer, since Star Blue's glow is TWO
    // independent layers (fading + persistent) instead of Orange's one.
    function glowComposite(a, b, idOff) {
      return (
        '<embedScene id="' + (idBase + idOff) + '" label="Group and Mask 1 Copy 2" startTime="0" endTime="1999" fillType="gradient" outTime="1999">' +
        '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
        gradTag +
        '<scene ' + STYLE_SCENE_ATTRS + '>' + a + '</scene>' +
        '</embedScene>' +
        '<embedScene id="' + (idBase + idOff + 1) + '" label="Group and Mask 1 Copy" startTime="33" endTime="2032" fillType="gradient" blending="exclude" outTime="1999">' +
        '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
        gradTag +
        '<scene ' + STYLE_SCENE_ATTRS + '>' + b + '</scene>' +
        '</embedScene>'
      );
    }

    // 3. glow, stays lit — no opacity fade at all
    var layerGlowStay =
      '<embedScene id="' + (idBase + 908) + '" label="Group and Mask 3 Copy" startTime="200" endTime="2015" fillType="intrinsic" blending="linear-dodge" outTime="1815">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-2.000000,-2.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.630000"/></effect>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + glowComposite(innerGlowStayA, innerGlowStayB, 870) + '</scene>' +
      '</embedScene>';
    // 4. glow, fades out
    var layerGlowFade =
      '<embedScene id="' + (idBase + 906) + '" label="Group and Mask 3" startTime="167" endTime="2066" fillType="intrinsic" blending="linear-dodge" outTime="1899">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="-2.000000,-2.000000"/>' +
      '<opacity><kf t="0.307531" v="1.000000"/><kf t="0.439178" v="0.000000"/></opacity></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.630000"/></effect>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + glowComposite(innerGlowFadeA, innerGlowFadeB, 850) + '</scene>' +
      '</embedScene>';

    // 5. the real letter — solid white, permanent. Confirmed intentional against the
    // hand-edited reference (labeled "putih"): the gradient/glow/star all sit underneath,
    // and this white pass on top is what gives the letter its bright, lit-up finish.
    var layerFinal =
      '<embedScene id="' + (idBase + 911) + '" label="putih" startTime="267" endTime="2066" fillType="color" outTime="1799">' +
      '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="-1.000000,-1.000000"/></transform>' +
      '<fillColor value="#FFFFFFFF"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerFinal + '</scene>' +
      '</embedScene>';

    return layerStar + layerGradientFade + layerGlowStay + layerGlowFade + layerFinal;
  }

  // Love / Love Cupid — verified against real "F Love Pink" and "F Love Cupid" exports.
  // Structurally its own thing, not a shape-swap of Star Blue: two heart-burst copies
  // (sharp + blurred, both masked to the letter and never fading — unlike Star Blue's
  // single fading burst), a pink gradient-fade settle pass, a glow that nests a FIXED
  // purple-cyan double-composite (Copy 2 / Copy exclude-blend, same trick Star Blue's
  // glowComposite uses) inside an OUTER pink-gradient wrapper, and a permanent final
  // letter that's a fixed purple-cyan gradient — never white, never following colorA/
  // colorB. Cupid is identical except the sharp burst's heart repeat gets an extra
  // <rotation> and a slightly later repeat.grid phase end (both confirmed against the
  // two reference files — the blurred burst copy never rotates in either export).
  function loveBurstTemplate(shapeColor, gridFillColor, rotate, phaseEnd) {
    var rotTag = rotate ? '<rotation value="121.829269"/>' : '';
    return (
      '<embedScene id="8" label="Group 1" startTime="0" endTime="1933" fillType="intrinsic" outTime="1933">' +
      '<transform><location value="275.422028,702.280762,0.000000"/><pivot value="-65.020599,-65.412415"/><scale value="0.758278,0.758278"/><rotation value="-135.000000"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<effect id="com.alightcreative.effects.edgeglow" locallyApplied="true"><property name="smoothing" type="float" value="4.570000"/></effect>' +
      '<scene title="" width="1082" height="1082" exportWidth="1920" exportHeight="1080" bgcolor="#00000000" totalTime="1933" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off">' +
      '<embedScene id="11" label="Group 2" startTime="0" endTime="1933" fillType="intrinsic" outTime="1933">' +
      '<transform><location value="540.000000,540.000000,0.000000"/><pivot value="-65.020599,-65.412415"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene title="" width="1082" height="1082" exportWidth="1920" exportHeight="1080" bgcolor="#00000000" totalTime="1999" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off">' +
      '<embedScene id="9" label="Group 1" startTime="0" endTime="1999" fillType="intrinsic" outTime="1999">' +
      '<transform><location value="540.000000,540.000000,0.000000"/><pivot value="-64.020599,-65.412415"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene title="" width="1082" height="1082" exportWidth="1920" exportHeight="1080" bgcolor="#00000000" totalTime="1999" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off">' +
      '<shape id="22" label="Shape 1" startTime="0" endTime="1999" fillType="color">' +
      '<transform><location value="475.979401,474.587585,0.000000"/><scale value="0.110906,0.110906"/>' + rotTag + '</transform>' +
      '<fillColor value="' + normalizeColor(shapeColor) + '"/>' +
      '<effect id="com.alightcreative.effects.repeat.grid" locallyApplied="true">' +
      '<property name="blend" type="float" value="1.000000"/>' +
      '<property name="count" type="float" value="11.000000"/>' +
      '<property name="easeIn" type="float" value="1.000000"/>' +
      '<property name="easeOut" type="float" value="-0.560000"/>' +
      '<property name="fillColor" type="color" value="' + normalizeColor(gridFillColor) + '"/>' +
      '<property name="invert" type="bool" value="true"/>' +
      '<property name="phase" type="float"><kf t="0.000000" v="0.905000"/><kf t="' + phaseEnd.toFixed(6) + '" v="-0.938000" e="cubicBezier 0.0 0.0 0.08147491 1.0"/></property>' +
      '<property name="position" type="vec2" value="520.000000,520.000000"/>' +
      '<property name="scale" type="float" value="0.000000"/>' +
      '<property name="shape" type="int" value="3"/>' +
      '<property name="stagger" type="float" value="23.000000"/>' +
      '</effect>' +
      '<path d="M -270.5 -94.169815C -270.5 -168.86632, -209.9465 -229.41982, -135.25 -229.41982C -78.8524 -229.41982, -17.167023 -188.17357, 1.6256803 -134.69472C 20.847221 -185.97986, 77.25356 -229.41982, 135.25 -229.41982C 209.94652 -229.41982, 270.5 -168.86632, 270.5 -94.169815C 270.5 -31.38993, 179.35574 76.47328, -2.9327493 229.41982C -181.31091 76.47328, -270.5 -31.38993, -270.5 -94.169815Z"/>' +
      '</shape>' +
      '</scene></embedScene></scene></embedScene></scene></embedScene>'
    );
  }

  var LOVE_FINAL_GRADIENT = '<gradient type="linear" startColor="#FE207FFC" endColor="#FF00FFFF" start="0.000000,0.000000" end="1.000000,1.000000"/>';
  var LOVE_WIPE2 = '<effect id="com.alightcreative.effects.wipe2" locallyApplied="true"><property name="angle" type="float" value="303.500000"/><property name="end" type="float"><kf t="0.000000" v="-0.326000"/><kf t="0.663500" v="1.278000" e="cubicBezier 0.42 0.0 0.084424764 1.0"/></property><property name="feather" type="float" value="13.400001"/><property name="start" type="float" value="-0.325000"/></effect>';
  var LOVE_WIPE2_FINAL = '<effect id="com.alightcreative.effects.wipe2" locallyApplied="true"><property name="angle" type="float" value="303.500000"/><property name="end" type="float"><kf t="0.000000" v="-0.326000"/><kf t="0.641983" v="1.278000" e="cubicBezier 0.42 0.0 0.084424764 1.0"/></property><property name="feather" type="float" value="13.400001"/><property name="start" type="float" value="-0.325000"/></effect>';

  function buildLoveStyleLayers(innerContent, idBase, colorA, colorB, heartColor, rotateHeart) {
    var pinkGradTag = '<gradient type="linear" startColor="' + normalizeColor(colorA) + '" endColor="' + normalizeColor(colorB) + '" start="0.000000,0.000000" end="1.000000,1.000000"/>';

    var innerBurstSharp = offsetIds(innerContent, idBase);
    var innerBurstBlur = offsetIds(innerContent, idBase + 100);
    var innerGradFade = offsetIds(innerContent, idBase + 200);
    var innerGlowFadeA = offsetIds(innerContent, idBase + 300);
    var innerGlowFadeB = offsetIds(innerContent, idBase + 300); // reused verbatim, same trick Star Blue's glowComposite relies on
    var innerGlowStayA = offsetIds(innerContent, idBase + 400);
    var innerGlowStayB = offsetIds(innerContent, idBase + 400);
    var innerFinal = offsetIds(innerContent, idBase + 700);

    var burstSharp = offsetIds(loveBurstTemplate(heartColor, colorB, rotateHeart, rotateHeart ? 1.066245 : 1.031041), idBase + 600);
    var burstBlur = offsetIds(loveBurstTemplate(heartColor, colorB, false, 1.031041), idBase + 650);

    function letterMask(embedId, innerXml) {
      return (
        '<embedScene id="' + embedId + '" label="Group and Mask 1" startTime="0" endTime="1999" fillType="color" blending="mask" outTime="1999">' +
        '<transform><location value="210.000000,210.000000,0.000000"/><pivot value="38.167953,33.333511"/></transform>' +
        '<effect id="com.alightcreative.effects.wipe2" locallyApplied="true"><property name="end" type="float"><kf t="0.000000" v="0.000000"/><kf t="0.438500" v="1.000000" e="cubicBezier 0.42 0.0 0.084424764 1.0"/></property></effect>' +
        '<scene ' + STYLE_SCENE_ATTRS + '>' + innerXml + '</scene>' +
        '</embedScene>'
      );
    }

    // 1. sharp heart burst, masked to the letter — never fades (unlike Star Blue's burst)
    var layerBurstSharp =
      '<embedScene id="' + (idBase + 900) + '" label="Group and Mask 2" startTime="0" endTime="1999" fillType="intrinsic" outTime="1999">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="7.239960,10.160004"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + burstSharp + letterMask(idBase + 901, innerBurstSharp) + '</scene>' +
      '</embedScene>';

    // 2. blurred duplicate of the same burst, also masked, also permanent
    var layerBurstBlur =
      '<embedScene id="' + (idBase + 902) + '" label="Group and Mask 2 Copy" startTime="0" endTime="1999" fillType="intrinsic" outTime="1999">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="7.239960,10.160004"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.490000"/></effect>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + burstBlur + letterMask(idBase + 903, innerBurstBlur) + '</scene>' +
      '</embedScene>';

    // 3. pink gradient settle pass over the real letter, fades in then out
    var layerGradientFade =
      '<embedScene id="' + (idBase + 904) + '" label="Group and Mask 1" startTime="166" endTime="2165" fillType="gradient" outTime="1999">' +
      '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="38.167953,33.333511"/>' +
      '<opacity><kf t="0.208604" v="1.000000"/><kf t="0.398909" v="0.000000"/></opacity></transform>' +
      pinkGradTag + LOVE_WIPE2 +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerGradFade + '</scene>' +
      '</embedScene>';

    // Fixed purple-cyan double-composite (Copy 2 plain + Copy exclude-blended, offset
    // timing) — shared shape for both the fading and the persistent glow below, exactly
    // like Star Blue's own glowComposite trick, but always the fixed final gradient here.
    function purpleCyanComposite(a, b, idOff) {
      return (
        '<embedScene id="' + (idBase + idOff) + '" label="Group and Mask 1 Copy 2" startTime="0" endTime="1999" fillType="gradient" outTime="1999">' +
        '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="38.167953,33.333511"/></transform>' +
        LOVE_FINAL_GRADIENT + LOVE_WIPE2 +
        '<scene ' + STYLE_SCENE_ATTRS + '>' + a + '</scene>' +
        '</embedScene>' +
        '<embedScene id="' + (idBase + idOff + 1) + '" label="Group and Mask 1 Copy" startTime="33" endTime="2032" fillType="gradient" blending="exclude" outTime="1999">' +
        '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="38.167953,33.333511"/></transform>' +
        LOVE_FINAL_GRADIENT + LOVE_WIPE2 +
        '<scene ' + STYLE_SCENE_ATTRS + '>' + b + '</scene>' +
        '</embedScene>'
      );
    }

    // 4. glow, wrapped in an outer pink-gradient linear-dodge pass, fades out
    var layerGlowFade =
      '<embedScene id="' + (idBase + 905) + '" label="Group and Mask 3" startTime="100" endTime="2132" fillType="gradient" blending="linear-dodge">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="6.239960,9.160004"/>' +
      '<opacity><kf t="0.287402" v="1.000000"/><kf t="0.410433" v="0.000000"/></opacity></transform>' +
      pinkGradTag +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.630000"/></effect>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + purpleCyanComposite(innerGlowFadeA, innerGlowFadeB, 906) + '</scene>' +
      '</embedScene>';

    // 5. same glow composite, wrapped in a plain intrinsic/black linear-dodge pass this
    // time (no gradient at the outer level) — stays lit, no opacity fade at all
    var layerGlowStay =
      '<embedScene id="' + (idBase + 908) + '" label="Group and Mask 3 Copy" startTime="184" endTime="2216" fillType="intrinsic" blending="linear-dodge" outTime="2032">' +
      '<transform><location value="211.000000,211.000000,0.000000"/><pivot value="6.239960,9.160004"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="0.630000"/></effect>' +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + purpleCyanComposite(innerGlowStayA, innerGlowStayB, 909) + '</scene>' +
      '</embedScene>';

    // 6. permanent final letter — fixed purple-cyan gradient, never white, never colorA/B
    var layerFinal =
      '<embedScene id="' + (idBase + 911) + '" label="Group and Mask 1 Copy 3" startTime="217" endTime="2283" fillType="color" outTime="2066">' +
      '<transform><location value="209.000000,209.000000,0.000000"/><pivot value="38.167953,33.333511"/></transform>' +
      LOVE_FINAL_GRADIENT + LOVE_WIPE2_FINAL +
      '<scene ' + STYLE_SCENE_ATTRS + '>' + innerFinal + '</scene>' +
      '</embedScene>';

    return layerBurstSharp + layerBurstBlur + layerGradientFade + layerGlowFade + layerGlowStay + layerFinal;
  }

  // "Filter Highlight" (Dark only) is nothing like Orange's Filter Glow shape — it
  // duplicates the ENTIRE already-built letter+null tree, additively blends the copy on
  // top, and runs it through lumakey (isolate bright pixels) → blur → replacecolor
  // (white becomes the highlight color). Verified against a real root-level export.
  // Duplicating ids/parent-refs verbatim would collide with the original copy, so the
  // whole duplicate gets re-numbered by a large fixed offset — parent="" refs get shifted
  // by the same amount so animated presets' null-parenting still resolves inside the copy.
  function offsetIdsAndParents(content, offset) {
    return content
      .replace(/id="(\d+)"/g, function (m, n) { return 'id="' + (parseInt(n, 10) + offset) + '"'; })
      .replace(/parent="(\d+)"/g, function (m, n) { return 'parent="' + (parseInt(n, 10) + offset) + '"'; });
  }
  function buildDuplicateFilterOverlay(bodyXml, sceneEndMs, highlightColor, threshold, blurStrength, groupId1, groupId2) {
    var end = Math.round(sceneEndMs);
    var wrapAttrs = 'title="" width="1922" height="1082" exportWidth="1922" exportHeight="1082" bgcolor="#00000000" totalTime="' + end + '" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off"';
    return (
      '<embedScene id="' + groupId1 + '" label="Group 2" startTime="0" endTime="' + end + '" fillType="intrinsic">' +
      '<transform><location value="960.000000,540.000000,0.000000"/><pivot value="-25.270264,-30.581848"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<scene ' + wrapAttrs + '>' + bodyXml + '</scene>' +
      '</embedScene>' +
      '<embedScene id="' + groupId2 + '" label="Group 2 Copy" startTime="0" endTime="' + end + '" fillType="intrinsic" blending="linear-dodge">' +
      '<transform><location value="960.000000,540.000000,0.000000"/><pivot value="-25.270264,-30.581848"/></transform>' +
      '<fillColor value="#FF000000"/>' +
      '<effect id="com.alightcreative.effects.lumakey3" locallyApplied="true"><property name="lowThreshold" type="float" value="' + threshold.toFixed(6) + '"/></effect>' +
      '<effect id="com.alightcreative.effects.gaussianblur" locallyApplied="true"><property name="strength" type="float" value="' + blurStrength.toFixed(6) + '"/></effect>' +
      '<effect id="com.alightcreative.replacecolor" locallyApplied="true"><property name="newcolor" type="color" value="' + normalizeColor(highlightColor) + '"/><property name="oldcolor" type="color" value="#FFFFFFFF"/></effect>' +
      '<scene ' + wrapAttrs + '>' + offsetIdsAndParents(bodyXml, 1000000) + '</scene>' +
      '</embedScene>'
    );
  }

  // Same shape as the reference 2D Text Animation tool: a bezier curve (p1,p2) reshapes
  // how stagger delay is distributed across letters — it's not just decorative easing,
  // it directly drives calcStarts. Default curve = a straight line = plain linear stagger.
  function cubicY(t, p1, p2) {
    var u = 1 - t;
    return 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t;
  }

  // Deterministic pseudo-random jitter, same formula the reference tool uses for its
  // "Random Layer" preset — a real per-letter shuffle, not just the smooth curve renamed.
  function seeded(i, seed) {
    var x = Math.sin((i + 1) * 999 + (seed || 1) * 77) * 10000;
    return x - Math.floor(x);
  }

  function computeTiming(letterCount, opts) {
    var stagger = opts.stagger || 0;
    var maxBase = stagger * Math.max(0, letterCount - 1);
    var curve = opts.curve || { p1: { x: .25, y: .25 }, p2: { x: .75, y: .75 } }; // straight line by default
    var isRandom = opts.graphMode === 'random';

    var starts = [], outs = [];
    for (var i = 0; i < letterCount; i++) {
      var t = letterCount === 1 ? 0 : i / (letterCount - 1);
      var base = isRandom ? seeded(i, opts.seed) : cubicY(t, curve.p1, curve.p2);
      var st = Math.round(base * maxBase);
      starts.push(st);
      outs.push(st + LETTER_DURATION + (opts.endHold || 0));
    }
    var sceneEnd = Math.max.apply(null, outs.concat([0]));
    if (opts.extendLayer) {
      for (var j = 0; j < outs.length; j++) outs[j] = sceneEnd;
    }
    return { starts: starts, outs: outs, sceneEnd: sceneEnd };
  }

  // Lay out one line of characters, returns [{char,x,y}]. Spacing comes from Plus Jakarta
  // Sans SemiBold's own real metrics (side-bearings + kern pairs, extracted straight from the
  // font file — see font-metrics.js), not from measuring the traced vector's ink bbox. A
  // letter's own vector shape only tells you what it looks like, not how far real type sets
  // it from its neighbors — that lives in the font's hidden advance-width/kerning data.
  function metricFor(ch, letterData) {
    var fm = global.TRIMPATH_FONT_METRICS;
    if (fm && fm.metrics[ch]) return fm.metrics[ch];
    var d = letterData[ch]; // fallback for any glyph the real-metrics table doesn't cover
    var w = d ? d.width : 0;
    return { adv: w, lsb: 0, ink: w, rsb: 0 };
  }
  function layoutLine(chars, letterData, sceneScale, letterSpacingPx, centerX, centerY, sizePx) {
    var fm = global.TRIMPATH_FONT_METRICS;
    var kern = fm ? fm.kern : {};
    var K = fm ? fm.K : 120.469;
    var unitToCanvas = (K / 1000) * ((sizePx || REF_PX) / REF_PX);

    var items = [];
    var centers = [];
    var center = 0, leftEdge = 0, rightEdge = 0;
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      var m = metricFor(ch, letterData);
      var halfInk = (m.ink / 2) * unitToCanvas;
      if (i === 0) {
        center = halfInk;
        leftEdge = 0;
      } else {
        var prevCh = chars[i - 1];
        var prevM = metricFor(prevCh, letterData);
        var kernUnits = kern[prevCh + ch] || 0;
        var gapUnits = (prevM.ink / 2) + prevM.rsb + kernUnits + m.lsb + (m.ink / 2);
        center += gapUnits * unitToCanvas + letterSpacingPx;
      }
      centers.push(center);
      rightEdge = center + halfInk;
    }
    var totalWidth = rightEdge - leftEdge;
    var shift = centerX - totalWidth / 2 - leftEdge;
    for (var j = 0; j < chars.length; j++) {
      items.push({ char: chars[j], x: centers[j] + shift, y: centerY });
    }
    return items;
  }

  function generate(opts) {
    var letterData = global.TRIMPATH_LETTERS || {};
    var text = opts.text || '';
    var lines = text.split('\n');
    var sceneScale = pxToSceneScale(opts.sizePx || REF_PX);
    var lineGap = opts.lineGap || 0;

    var allChars = [];
    lines.forEach(function (line) {
      Array.prototype.push.apply(allChars, line.split(''));
    });
    var typedLetters = allChars.filter(function (c) { return c !== ' '; });

    var missing = [];
    typedLetters.forEach(function (c) {
      if (!letterData[c] && missing.indexOf(c) === -1) missing.push(c);
    });

    var placed = [];
    var totalLines = lines.length;
    lines.forEach(function (line, li) {
      // drop unavailable glyphs before layout so spacing/centering never reserves room for them
      var chars = line.split('').filter(function (c) { return c === ' ' || !!letterData[c]; });
      var cy = CANVAS_H / 2 + (li - (totalLines - 1) / 2) * (lineGap || 140);
      var rowItems = layoutLine(chars, letterData, sceneScale, opts.letterSpacingPx || 0, CANVAS_W / 2, cy, opts.sizePx || REF_PX);
      rowItems.forEach(function (it) {
        if (it.char === ' ') return;
        placed.push(it);
      });
    });

    var timing = computeTiming(placed.length, opts);
    var colors = opts.colors && opts.colors.length ? opts.colors : ['#FFFFFF'];
    var needsNull = !!ANIM_CONFIGS[opts.animPreset];
    var nullId = 100 + placed.length; // one past the last letter id, always free
    // Same fixed shift for every letter (verified against the real preset files — every
    // glyph moves by the identical delta, proportional to letter size). Move In splits the
    // travel between the null (340×scale) and this per-letter layer; Move In Up's null is
    // static (see buildNullObj) so this Y shift alone carries the whole entrance distance.
    var letterShiftX = 270 * sceneScale;
    var letterShiftY = 350 * sceneScale;

    var body = [];
    placed.forEach(function (item, idx) {
      var letter = letterData[item.char];
      if (!letter) return; // missing glyph, skip silently (reported via `missing` list)
      var t = placed.length > 1 ? idx / (placed.length - 1) : 0;
      var isStyled = !!opts.style;
      var isDark = opts.style === 'dark' || opts.style === 'darktolight' || opts.style === 'lighttocolorize' || opts.style === 'lighttodark';
      var isStarBlue = opts.style === 'starblue';
      var isLove = opts.style === 'love' || opts.style === 'lovecupid';
      var loveRotateHeart = opts.style === 'lovecupid';
      var darkFade = opts.style === 'darktolight';
      var colorizeFade = opts.style === 'lighttocolorize';
      var trueLtd = opts.style === 'lighttodark';
      // Style has its own independent Warna/Mapping (set in the Style panel's own Color
      // Mapping fields) — it never reads the base Color Mapping panel below, and vice versa.
      var color, colorA, colorB, color1, starColorVal, heartColorVal;
      if (isDark) {
        if (darkFade) {
          // Dark to Light is a genuinely different color engine from Dark — one Warna/
          // Mapping/Color Roles value (its own dedicated panel, same mechanism Orange
          // uses) drives all 3 slots at once: Color A, Color B, and Color 1's dark start.
          // The white end of Color 1's fade is never part of this mapping — always fixed.
          var v = mapColorForT(t, opts.dtlMapping || 'single', (opts.dtlColors && opts.dtlColors.length ? opts.dtlColors : ['#707A79']), opts.dtlRepeatEvery, placed.length, idx);
          colorA = v; colorB = v; color1 = v;
        } else if (colorizeFade) {
          // Light to Colorize (member-only): same one-value-drives-all-3-slots engine, its
          // own dedicated Warna/Mapping/Color Roles panel — the real letter fades FROM
          // fixed white TO this mapped value (see buildDarkStyleLayers' fadeDirection).
          var vLtc = mapColorForT(t, opts.ltcMapping || 'single', (opts.ltcColors && opts.ltcColors.length ? opts.ltcColors : ['#707A79']), opts.ltcRepeatEvery, placed.length, idx);
          colorA = vLtc; colorB = vLtc; color1 = vLtc;
        } else if (trueLtd) {
          // Light to Dark: Dark to Light mirrored — same one-value-drives-all-3-slots
          // engine (mapped value drives Color A, Color B, and the real letter's light
          // start), but the real letter always ends at the fixed dark default (#15161F,
          // same as Dark's Color 1) instead of fixed white. Verified against a real export.
          var vLtd = mapColorForT(t, opts.ltdMapping || 'single', (opts.ltdColors && opts.ltdColors.length ? opts.ltdColors : ['#707A79']), opts.ltdRepeatEvery, placed.length, idx);
          colorA = vLtd; colorB = vLtd; color1 = vLtd;
        } else if (opts.darkGradOn) {
          // Optional "Mapping Gradien" mode: A and B both follow one per-letter gradient
          // value (its own dedicated Warna/Mapping/Color Roles panel) instead of a single
          // flat "dari → ke" pick. Color 1 still never joins this — always fixed.
          var vDark = mapColorForT(t, opts.darkGradMapping || 'single', (opts.darkGradColors && opts.darkGradColors.length ? opts.darkGradColors : ['#707A79']), opts.darkGradRepeatEvery, placed.length, idx);
          colorA = vDark; colorB = vDark;
          color1 = '#15161F';
        } else {
          // Dark static default: a direct, simple "dari → ke" remap for A and B only — no
          // gradient. Same source fields whether the user typed the colors by hand or a
          // "Mapping 2 Warna" palette pick wrote them in — the engine can't tell the
          // difference and doesn't need to. Color 1 (the real letter) always stays the
          // fixed default; that's what makes it read as "Dark".
          colorA = opts.darkColorA || '#707A79';
          colorB = opts.darkColorB || '#3A3F42';
          color1 = '#15161F';
        }
      } else if (isStarBlue) {
        if (opts.starGradOn) {
          // Optional "Mapping Gradien" mode: one per-letter value drives Color A, Color B,
          // AND Star Color all at once — same "one value, three slots" rule Dark's own
          // gradient mode uses. Color 1 (white) never joins this — always fixed.
          var vStar = mapColorForT(t, opts.starGradMapping || 'single', (opts.starGradColors && opts.starGradColors.length ? opts.starGradColors : ['#207FFC']), opts.starGradRepeatEvery, placed.length, idx);
          colorA = vStar; colorB = vStar; starColorVal = vStar;
        } else {
          // Static default: independent "dari → ke" picks for A, B, and Star Color.
          colorA = opts.starColorA || '#207FFC';
          colorB = opts.starColorB || '#00FFFF';
          starColorVal = opts.starStarColor || '#02AFD9';
        }
      } else if (isLove) {
        if (opts.loveGradOn) {
          // Same "one value, three slots" gradient-mapping mode Star Blue/Dark offer —
          // drives Color A, Color B, AND Heart Color together. The final letter's fixed
          // purple-cyan gradient never joins this, same as Star Blue's white never does.
          var vLove = mapColorForT(t, opts.loveGradMapping || 'single', (opts.loveGradColors && opts.loveGradColors.length ? opts.loveGradColors : ['#F238A9']), opts.loveGradRepeatEvery, placed.length, idx);
          colorA = vLove; colorB = vLove; heartColorVal = vLove;
        } else {
          // Static default: independent "dari → ke" picks for A, B, and Heart Color —
          // all default pink, matching the real "F Love Pink"/"F Love Cupid" exports.
          colorA = opts.loveColorA || '#F238A9';
          colorB = opts.loveColorB || '#FF9CF2';
          heartColorVal = opts.loveHeartColor || '#F238A9';
        }
      } else if (isStyled) {
        color = mapColorForT(t, opts.styleMapping || 'single', (opts.styleColors && opts.styleColors.length ? opts.styleColors : ['#FFA500']), opts.styleRepeatEvery, placed.length, idx);
      } else {
        color = mapColorForT(t, opts.mapping || 'single', colors, opts.repeatEvery, placed.length, idx);
      }
      // Every raw letter template was authored as its own separate single-letter AM
      // project, so they all restart their internal ids from ~1-8. Fine in isolation, but
      // placing many letters into ONE scene makes those internal ids collide across
      // letters (id="1" shows up once per letter!) — confirmed the hard way on a 52-letter
      // file. Give each letter's own internal ids a private 1000-wide band so nothing
      // outside this letter can ever reuse them.
      var idBase = 1000 + idx * 1000;
      var recolored;
      if (isDark) {
        var innerContentDark = extractInnerContent(letter.raw);
        var outerPrefixDark = letter.raw.match(/^[\s\S]*?<scene\b[^>]*>/)[0].replace(/(<scene\b)/, DARK_GLOWSCAN_EFFECT + '$1');
        recolored = outerPrefixDark +
          buildDarkStyleLayers(innerContentDark, idBase, colorA, colorB, color1, darkFade ? 'light' : (colorizeFade ? 'colorize' : (trueLtd ? 'todark' : null))) +
          '</scene></embedScene>';
      } else if (isStarBlue) {
        // Star Blue has its own independent gradient (its own dedicated Warna panel, same
        // "never reads the base Color Mapping panel" rule every other style follows).
        var innerContentStar = extractInnerContent(letter.raw);
        var outerPrefixStar = letter.raw.match(/^[\s\S]*?<scene\b[^>]*>/)[0].replace(/(<scene\b)/, STAR_GLOWSCAN_EFFECT + '$1');
        recolored = outerPrefixStar +
          buildStarStyleLayers(innerContentStar, idBase, colorA, colorB, starColorVal) +
          '</scene></embedScene>';
      } else if (isLove) {
        // Love has its own independent gradient too (its own dedicated Warna panel),
        // same glowscan alpha/strength/threshold values as Star Blue's — confirmed
        // identical against the reference exports, so it's safe to reuse the constant.
        var innerContentLove = extractInnerContent(letter.raw);
        var outerPrefixLove = letter.raw.match(/^[\s\S]*?<scene\b[^>]*>/)[0].replace(/(<scene\b)/, STAR_GLOWSCAN_EFFECT + '$1');
        recolored = outerPrefixLove +
          buildLoveStyleLayers(innerContentLove, idBase, colorA, colorB, heartColorVal, loveRotateHeart) +
          '</scene></embedScene>';
      } else if (isStyled) {
        // Style swaps the letter's single "Group and Mask 1 + Rectangle 1" body for THREE
        // copies of it (flash / glow / real letter) — see buildStyleLayers. Each copy
        // carries its own fillType="color", so the outer wrapper below MUST stay
        // "intrinsic" (never forced to "color") or it would flatten all three into one flat
        // tint and hide the whole effect.
        // Flash and glow share the SAME per-letter mapped color (from Style's own Warna/
        // Mapping panel, computed above); the real letter (layer 3) stays fillType=
        // "intrinsic" so it always shows its native artwork color, untinted. (The Filter's
        // Hue Shift, if enabled, is a fully separate full-canvas overlay — it never touches
        // this per-letter color at all.)
        var innerContent = extractInnerContent(letter.raw);
        recolored = letter.raw.match(/^[\s\S]*?<scene\b[^>]*>/)[0] +
          buildStyleLayers(innerContent, idBase, color, color) +
          '</scene></embedScene>';
      } else {
        // colorMappingOn is the real switch — every raw template ships with the outer
        // embedScene's fillType="intrinsic", which makes Alight Motion IGNORE that outer
        // fillColor entirely and render whatever colors are already baked into each
        // letter's own internal stroke shapes instead (verified against a real "mapping off"
        // vs "mapping on" export pair — same fillColor value, only fillType differed). So
        // recoloring only ever mattered once fillType flips to "color" too; off means leave
        // the raw blob completely untouched, letting each letter's original colors show.
        var body0 = opts.colorMappingOn ? recolorLetterBlob(letter.raw, letter.fillColor, color) : letter.raw;
        var innerPlain = extractInnerContent(body0);
        recolored = body0.match(/^[\s\S]*?<scene\b[^>]*>/)[0] + offsetIds(innerPlain, idBase) + '</scene></embedScene>';
      }

      var id = 100 + idx;
      var startTime = Math.round(timing.starts[idx]);
      var outTime = Math.round(timing.outs[idx]);
      var endTime = Math.round(timing.sceneEnd);
      var parentAttr = needsNull ? ' parent="' + nullId + '"' : '';

      // A few source letters (E, H, V) have the wrong label baked into their own raw
      // template (leftover from an earlier file mixup) — force the real character here
      // instead of trusting whatever the blob's own outer label says.
      recolored = recolored.replace(/id="\d+"\s+label="[^"]*"(\s+startTime=)/, 'id="' + id + '" label="' + escAttr(item.char) + '"' + parentAttr + '$1');
      if (opts.colorMappingOn && !isStyled) {
        // Only the OUTER embedScene's fillType — it's always the first occurrence in the
        // blob, well before any nested "Group and Mask"/mask-shape fillType that must stay
        // "intrinsic" for their own compositing to keep working.
        recolored = recolored.replace(/fillType="intrinsic"/, 'fillType="color"');
      }
      recolored = recolored.replace(/startTime="0"(\s+endTime=")\d+(")/, 'startTime="' + startTime + '"$1' + endTime + '$2');
      if (/outTime="/.test(recolored)) {
        recolored = recolored.replace(/outTime="\d+"/, 'outTime="' + outTime + '"');
      } else {
        recolored = recolored.replace(/(endTime="\d+")(>)/, '$1 outTime="' + outTime + '"$2');
      }
      // The outer <embedScene>'s own <transform> is always the FIRST <location> in the
      // raw template and never carries its own <scale> (only nested mask/rectangle
      // shapes do, deeper in the blob) — replacing just this first match and appending
      // the scale right there avoids ever touching that unrelated nested <scale>.
      // A handful of letters (S,T,U,V,W,X,Y and lowercase s,t,u,v,w,x) were originally
      // traced ~2.9% larger than the rest — scaleRatio corrects that per letter so every
      // glyph reads at a consistent size, matching how the source "semua alfabet" file authored them.
      var scaleRatio = (global.TRIMPATH_FONT_METRICS && global.TRIMPATH_FONT_METRICS.scaleRatio[item.char]) || 1;
      var letterScale = sceneScale * scaleRatio;
      var locBlock = buildLocationBlock(item.x, item.y, opts.animPreset, letterShiftX, letterShiftY);
      var scaleBlock = '<scale value="' + letterScale.toFixed(6) + ',' + letterScale.toFixed(6) + '"/>';
      recolored = recolored.replace(/<location[^/]*\/>|<location>[\s\S]*?<\/location>/, locBlock + scaleBlock);
      body.push(recolored);
    });

    if (needsNull) {
      var maxStart = Math.max.apply(null, timing.starts.concat([0]));
      body.push(buildNullObj(nullId, opts.animPreset, sceneScale, timing.sceneEnd, maxStart));
    }
    if (opts.filter) {
      var filterShapeId = 100 + placed.length + (needsNull ? 1 : 0) + 1;
      body.push(buildFilterShape(filterShapeId, opts.filter.hue || 0, opts.filter.glow != null ? opts.filter.glow : 0.32, opts.filter.edgeGlow != null ? opts.filter.edgeGlow : 5.33));
    }

    var innerXml = body.join('\n    ');
    if ((opts.style === 'dark' || opts.style === 'darktolight' || opts.style === 'lighttocolorize' || opts.style === 'lighttodark') && opts.filterHighlight) {
      var fh = opts.filterHighlight;
      innerXml = buildDuplicateFilterOverlay(
        innerXml, timing.sceneEnd,
        fh.color || '#FFFF9500',
        fh.threshold != null ? fh.threshold : 0.231,
        fh.blur != null ? fh.blur : 0.125,
        2000000, 2000001
      );
    }
    if (opts.italic) {
      innerXml =
        '<embedScene id="1" label="Group 1" startTime="0" endTime="' + Math.round(timing.sceneEnd) + '" fillType="intrinsic">' +
        '<transform><location value="' + (CANVAS_W / 2) + ',' + (CANVAS_H / 2) + ',0.000000"/>' +
        '<pivot value="' + (CANVAS_W / 2) + ',' + (CANVAS_H / 2) + '"/>' +
        '<skew value="-0.188496,0.000000"/></transform>' +
        '<fillColor value="#FF000000"/>' +
        '<scene title="" width="' + CANVAS_W + '" height="' + CANVAS_H + '" exportWidth="' + CANVAS_W + '" exportHeight="' + CANVAS_H + '" bgcolor="#00000000" totalTime="' + Math.round(timing.sceneEnd) + '" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="off">' +
        innerXml +
        '</scene></embedScene>';
    }

    var xml =
      '<?xml version=\'1.0\' encoding=\'UTF-8\' ?>\n' +
      '<!-- Generated by Flamo Trimpath Gen -->\n' +
      '<scene title="' + escAttr(opts.filename || 'trimpath') + '" width="' + CANVAS_W + '" height="' + CANVAS_H + '" exportWidth="' + CANVAS_W + '" exportHeight="' + CANVAS_H + '" bgcolor="#00000000" totalTime="' + Math.round(timing.sceneEnd) + '" fps="60" modifiedTime="0" amver="859" ffver="107" am="com.alightcreative.motion/6.2.53" amplatform="ios" precompose="dynamicResolution" retime="freeze">\n' +
      '  <bookmark t="0"/>\n' +
      '  ' + innerXml + '\n' +
      '</scene>\n';

    return {
      xml: xml,
      missing: missing,
      layers: placed.map(function (item, idx) {
        return {
          char: item.char,
          startTime: Math.round(timing.starts[idx]),
          outTime: Math.round(timing.outs[idx]),
        };
      }),
      sceneEnd: Math.round(timing.sceneEnd),
    };
  }

  global.TrimpathEngine = { generate: generate, pxToSceneScale: pxToSceneScale, mapColorForT: mapColorForT, cubicY: cubicY };
})(window);
