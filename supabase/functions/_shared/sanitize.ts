import { parseHTML } from "npm:linkedom@0.18.12";
import { Fault, normalizeText, type Source, SOURCES } from "./core.ts";
const allowed = new Set(
  "div p br ruby rt rp em strong b i blockquote h1 h2 h3 h4 h5 h6 ul ol li sup sub a hr table tbody tr td th caption"
    .split(" "),
);
export function sanitize(raw: string, source: Source) {
  const { document } = parseHTML("<html><body>" + raw + "</body></html>");
  document.querySelectorAll(
    "script,style,iframe,object,embed,svg,math,form,input,button,nav,.mw-editsection,.navbox,.noprint,.metadata",
  ).forEach((e) => e.remove());
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const tag = el.localName;
    if (!allowed.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const value = attr.value;
      if (attr.name === "id" && /^[\w:.-]{1,150}$/.test(value)) continue;
      if (tag === "a" && attr.name === "href") {
        if (/^#[\w:%.\-]{1,450}$/.test(value)) continue;
        try {
          const url = new URL(value, SOURCES[source].origin);
          if (
            url.origin === SOURCES[source].origin && url.protocol === "https:"
          ) {
            el.setAttribute("href", url.href);
            continue;
          }
        } catch { /* remove */ }
      }
      el.removeAttribute(attr.name);
    }
    if (tag === "a" && !el.getAttribute("href")?.startsWith("#")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }
  const html = document.body.innerHTML;
  // Leaf blocks avoid translating a list/blockquote twice. Ruby stays in HTML,
  // but the reading annotation is excluded from the translation's source text.
  const paragraphs: { index: number; original: string; html: string }[] = [];
  const blockTags = new Set(
    "div p h1 h2 h3 h4 h5 h6 li blockquote td th ul ol table tbody tr".split(
      " ",
    ),
  );
  function add(nodes: any[]) {
    const box = document.createElement("div");
    nodes.forEach((n) => box.append(n.cloneNode(true)));
    const html = box.innerHTML;
    box.querySelectorAll("br").forEach((e) =>
      e.replaceWith(document.createTextNode("\n"))
    );
    box.querySelectorAll("rt,rp").forEach((e) => e.remove());
    const original = normalizeText(box.textContent || "");
    if (original) paragraphs.push({ index: paragraphs.length, original, html });
  }
  function collect(parent: any) {
    let run: any[] = [];
    const flush = () => {
      if (run.length) add(run);
      run = [];
    };
    for (const child of Array.from(parent.childNodes) as any[]) {
      if (child.nodeType === 1 && blockTags.has(child.localName)) {
        flush();
        if (
          child.querySelector(
            "div,p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,ul,ol,table",
          )
        ) collect(child);
        else add([child]);
      } else run.push(child);
    }
    flush();
  }
  collect(document.body);
  if (
    paragraphs.length > 1200 ||
    paragraphs.reduce((n, p) => n + p.original.length, 0) > 200000
  ) {
    throw new Fault(
      413,
      "CHAPTER_TOO_LARGE",
      "Halaman terlalu besar. Pilih subbab yang lebih pendek.",
    );
  }
  return { html, paragraphs };
}
