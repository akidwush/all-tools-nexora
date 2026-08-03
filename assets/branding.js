(() => {
  "use strict";
  const replacements = [
    [/All Tools Nexus/g, "All Tools Nexora"],
    [/ALL TOOLS NEXUS/g, "ALL TOOLS NEXORA"],
    [/NEXUS MENU/g, "NEXORA MENU"],
    [/by Vyan/g, "Developer Dika"],
    [/Vyan Senpai/g, "Developer Dika"]
  ];

  function replaceText(value) {
    return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || ""));
  }

  function patch(root) {
    if (!root) return;
    const doc = root.nodeType === 9 ? root : root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const next = replaceText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
    if (root.querySelectorAll) {
      root.querySelectorAll("[aria-label],[title],[data-text]").forEach((element) => {
        for (const attribute of ["aria-label", "title", "data-text"]) {
          if (element.hasAttribute(attribute)) element.setAttribute(attribute, replaceText(element.getAttribute(attribute)));
        }
      });
    }
  }

  document.title = "All Tools Nexora — Developer Dika";
  patch(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const next = replaceText(mutation.target.nodeValue);
        if (next !== mutation.target.nodeValue) mutation.target.nodeValue = next;
      } else {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) node.nodeValue = replaceText(node.nodeValue);
          else if (node.nodeType === Node.ELEMENT_NODE) patch(node);
        });
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  document.addEventListener("load", (event) => {
    if (event.target && event.target.tagName === "IFRAME") {
      try { patch(event.target.contentDocument); } catch {}
    }
  }, true);
})();
