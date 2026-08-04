(function(){
  "use strict";

  const state = { rows: [], byKey: new Map(), loaded: false };
  const specialKeys = new Set(["whatsapp_channel", "whatsapp_access"]);
  const CACHE_KEY = "nexora_social_links_v63";
  const CACHE_TTL = 15 * 60 * 1000;
  const FALLBACK_ROWS = [
    {key:"whatsapp_channel",platform:"whatsapp",label:"Gabung Saluran WhatsApp",description:"Ikuti update fitur, project baru, dan informasi All Tools Nexora.",url:"https://whatsapp.com/channel/0029VatAJdFHltYFp77RUU3a",icon:"fa-brands fa-whatsapp",accent_color:"#25d366",sort_order:10,is_active:true},
    {key:"whatsapp_access",platform:"whatsapp",label:"Minta Akses",description:"Hubungi developer untuk meminta akses tools.",url:"https://wa.me/6282125204840",icon:"fa-brands fa-whatsapp",accent_color:"#25d366",sort_order:20,is_active:true}
  ];

  function readCache(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||"null");
      if(cached&&Array.isArray(cached.rows)&&Date.now()-Number(cached.savedAt||0)<CACHE_TTL) return cached.rows;
    }catch(_){ }
    return null;
  }
  function writeCache(rows){try{localStorage.setItem(CACHE_KEY,JSON.stringify({rows,savedAt:Date.now()}));}catch(_){ }}

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
    const menuButton = document.getElementById("nxTopMenuWhatsApp");
    const channelLinks = Array.from(document.querySelectorAll("[data-social-key='whatsapp_channel']"));
    const notification = document.getElementById("nx-wa-notif");

    if (menuButton){
      menuButton.hidden = !item;
      menuButton.dataset.socialUrl = item ? item.url : "";
      if (item){
        menuButton.style.setProperty("--nx-menu-color", item.accentColor);
        const label = menuButton.querySelector(".nx-top-menu-item-copy b");
        const description = menuButton.querySelector(".nx-top-menu-item-copy span");
        const icon = menuButton.querySelector(".nx-top-menu-item-icon i");
        if (label) label.textContent = item.label;
        if (description) description.textContent = item.description;
        if (icon) icon.className = item.icon;
      }
    }

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

    if (notification){
      notification.hidden = !item;
      notification.href = item ? item.url : "#";
      notification.dataset.socialUrl = item ? item.url : "";
      if (item){
        const title = document.getElementById("nx-wa-notif-title");
        const description = document.getElementById("nx-wa-notif-desc");
        if (title) title.textContent = item.label;
        if (description) description.textContent = item.description;
      }
    }
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

  function renderAdditionalLinks(rows){
    const host = document.getElementById("nxTopMenuSocialLinks");
    if (!host) return;
    host.replaceChildren();
    rows.filter(item => !specialKeys.has(item.key)).forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nx-top-menu-item nx-social-menu-item";
      button.style.setProperty("--nx-menu-color", item.accentColor);
      button.innerHTML = '<span class="nx-top-menu-item-icon"><i></i></span><span class="nx-top-menu-item-copy"><b></b><span></span></span><span class="nx-top-menu-item-arrow"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>';
      button.querySelector("i").className = item.icon;
      button.querySelector("b").textContent = item.label;
      button.querySelector(".nx-top-menu-item-copy span").textContent = item.description;
      button.addEventListener("click", () => open(item.url));
      host.appendChild(button);
    });
  }

  function apply(rows){
    state.rows = rows.map(normalize).filter(Boolean).sort((a,b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    state.byKey = new Map(state.rows.map(item => [item.key, item]));
    state.loaded = true;
    applyWhatsappChannel(state.byKey.get("whatsapp_channel") || null);
    applyWhatsappAccess(state.byKey.get("whatsapp_access") || null);
    renderAdditionalLinks(state.rows);
    document.dispatchEvent(new CustomEvent("nexora:social-links-ready", { detail: { rows: state.rows.slice() } }));
  }

  async function load(){
    try{
      const response = await fetch("/api/health?mode=database&resource=socials", { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      const rows=response.ok && Array.isArray(payload.data) ? payload.data : [];
      if(rows.length){writeCache(rows);apply(rows);}else if(!state.loaded){apply(readCache()||FALLBACK_ROWS);}
    }catch{
      if(!state.loaded) apply(readCache()||FALLBACK_ROWS);
    }
    return state.rows.slice();
  }

  const initialRows=readCache()||FALLBACK_ROWS;
  apply(initialRows);
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
