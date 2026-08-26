(function(){
  "use strict";

  const state = { rows: [], byKey: new Map(), loaded: false };
  const footerExcludedKeys = new Set(["whatsapp_access"]);
  const FALLBACK_ROWS = [
    {key:"whatsapp_channel",platform:"whatsapp",label:"Gabung Saluran WhatsApp",description:"Ikuti update fitur, project baru, dan informasi All Tools Nexora.",url:"https://whatsapp.com/channel/0029VatAJdFHltYFp77RUU3a",icon:"fa-brands fa-whatsapp",accent_color:"#25d366",sort_order:10,is_active:true},
    {key:"whatsapp_access",platform:"whatsapp",label:"Minta Akses",description:"Hubungi developer untuk meminta akses tools.",url:"https://wa.me/6282125204840",icon:"fa-brands fa-whatsapp",accent_color:"#25d366",sort_order:20,is_active:true}
  ];

  function safeUrl(value){
    try{
      const parsed = new URL(String(value || "").trim(), location.origin);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
    }catch{return "";}
  }

  function safeIcon(value){
    const icon = String(value || "fa-solid fa-link").trim();
    return /^[a-z0-9 _-]+$/i.test(icon) ? icon : "fa-solid fa-link";
  }

  function safeColor(value){
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "#a855f7";
  }

  function normalize(row){
    const url = safeUrl(row && row.url);
    if (!row || row.is_active === false || !url) return null;
    return {
      key: String(row.key || ""),
      platform: String(row.platform || "link"),
      label: String(row.label || "Link Nexora"),
      description: String(row.description || ""),
      url,
      icon: safeIcon(row.icon),
      accentColor: safeColor(row.accent_color),
      sortOrder: Number(row.sort_order) || 0
    };
  }

  function open(url){
    const target = safeUrl(url);
    if (target) window.open(target, "_blank", "noopener,noreferrer");
  }

  function applyWhatsappChannel(item){
    const channelLinks = Array.from(document.querySelectorAll("[data-social-key='whatsapp_channel']"));

    channelLinks.forEach(link => {
      link.hidden = !item;
      link.href = item ? item.url : "#";
      link.dataset.socialUrl = item ? item.url : "";
      if (!item) return;
      const label = link.querySelector("[data-social-label]") || link.querySelector(".nx-access-channel-copy b");
      const description = link.querySelector("[data-social-description]") || link.querySelector(".nx-access-channel-copy span");
      const icon = link.querySelector(".nx-access-channel-icon i") || link.querySelector(".nx-public-wa-icon i");
      if (label) label.textContent = item.label;
      if (description) description.textContent = item.description;
      if (icon) icon.className = item.icon;
    });
  }

  function applyWhatsappAccess(item){
    const links = Array.from(document.querySelectorAll("[data-social-key='whatsapp_access']"));
    links.forEach(link => {
      link.hidden = !item;
      link.href = item ? item.url : "#";
      link.dataset.socialUrl = item ? item.url : "";
      if (!item) return;
      const icon = link.querySelector("i");
      const label = link.querySelector("[data-social-label]");
      const description = link.querySelector("[data-social-description]");
      if (icon) icon.className = item.icon;
      if (label) label.textContent = item.label;
      if (description) description.textContent = item.description;
    });
  }

  function renderFooterLinks(rows){
    const host = document.getElementById("nxFooterSocialLinks");
    if (!host) return;
    host.replaceChildren();
    rows.filter(item => !footerExcludedKeys.has(item.key)).forEach(item => {
      const link = document.createElement("a");
      link.className = "nx-footer-social-link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = item.label;
      link.setAttribute("aria-label", item.label);
      link.style.setProperty("--nx-social-accent", item.accentColor);
      const icon = document.createElement("i");
      icon.className = item.icon;
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = item.label;
      link.append(icon, label);
      host.appendChild(link);
    });
    host.hidden = host.childElementCount === 0;
  }

  function apply(rows){
    state.rows = rows.map(normalize).filter(Boolean).sort((a,b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    state.byKey = new Map(state.rows.map(item => [item.key, item]));
    state.loaded = true;
    applyWhatsappChannel(state.byKey.get("whatsapp_channel") || null);
    applyWhatsappAccess(state.byKey.get("whatsapp_access") || null);
    renderFooterLinks(state.rows);
    document.dispatchEvent(new CustomEvent("nexora:social-links-ready", { detail: { rows: state.rows.slice() } }));
  }

  async function load(){
    try{
      const response = await fetch("/api/health?mode=database&resource=socials", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      const rows=response.ok && Array.isArray(payload.data) ? payload.data : [];
      if(rows.length)apply(rows);else if(!state.loaded)apply(FALLBACK_ROWS);
    }catch{
      if(!state.loaded) apply(FALLBACK_ROWS);
    }
    return state.rows.slice();
  }

  apply(FALLBACK_ROWS);
  const ready=new Promise(resolve=>{
    const schedule=window.NexoraScheduleIdle||function(task){setTimeout(task,450);};
    schedule(()=>load().then(resolve),{timeout:1600});
  });

  window.NexoraSocialLinks = {
    get: key => state.byKey.get(String(key || "")) || null,
    all: () => state.rows.slice(),
    open: key => {
      const item = state.byKey.get(String(key || ""));
      if (item) open(item.url);
    },
    ready
  };
})();
