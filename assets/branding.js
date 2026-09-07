(function(){
  "use strict";

  var config=window.NexoraConfig;
  if(!config||!config.brand||!window.NexoraBrandConfig)return;
  if(window.NexoraBranding)return;
  var imageConfig=window.NexoraBrandConfig;
  var revision=0;
  var brand=config.brand;

  function setMeta(selector,value,attribute){
    var node=document.querySelector(selector);
    if(node&&value)node.setAttribute(attribute||"content",value);
  }

  function pageTitle(){
    var path=location.pathname.replace(/\/index\.html$/, "").replace(/\.html$/, "").replace(/\/+$/,"")||"/";
    if(path==="/admin/login")return "Login Admin — "+brand.shortName;
    if(path==="/admin")return "Dashboard Admin — "+brand.shortName;
    if(path==="/about")return "About Developer — "+brand.name;
    if(path==="/feedback")return "Feedback — "+brand.name;
    return brand.title;
  }

  function applyTextSlots(){
    var values={
      name:brand.name,
      shortName:brand.shortName,
      owner:brand.owner,
      title:brand.title,
      signature:brand.name+" · "+brand.owner,
      aiName:brand.aiName
    };
    document.querySelectorAll("[data-nx-brand]").forEach(function(node){
      var value=values[node.getAttribute("data-nx-brand")];
      if(value)node.textContent=value;
    });

    document.querySelectorAll("[data-nx-brand-template]").forEach(function(node){
      var template=node.getAttribute("data-nx-brand-template");
      if(template==="feedback-submit")node.textContent="Kirim ke "+brand.owner;
      if(template==="feedback-center")node.textContent=brand.name+" · Dev Feedback Center";
      if(template==="unban-center")node.textContent=brand.name+" · Unban Center";
      if(template==="admin-console")node.textContent=brand.name+" · Admin Console v6.0";
    });

    var heroName=document.querySelector('[data-nx-hero-name]');
    if(heroName)heroName.textContent=brand.name;
  }

  function applyMetadata(){
    document.title=pageTitle();
    setMeta('meta[name="description"]',brand.description);
    setMeta('meta[property="og:site_name"]',brand.name);
    setMeta('meta[property="og:title"]',brand.title);
    setMeta('meta[property="og:description"]',brand.description);
    setMeta('meta[property="og:url"]',brand.canonicalUrl);
    setMeta('meta[property="og:image"]',brand.logoUrl);
    setMeta('meta[name="twitter:title"]',brand.title);
    setMeta('meta[name="twitter:description"]',brand.description);
    setMeta('meta[name="twitter:image"]',brand.logoUrl);
    var publicPath=location.pathname.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/\/+$/, '')||'/';
    var canonical=new URL(publicPath,brand.canonicalUrl).href;
    setMeta('link[rel="canonical"]',canonical,"href");
    setMeta('meta[property="og:url"]',canonical);

    var schema=document.querySelector('script[type="application/ld+json"]');
    if(schema){
      try{
        var data=JSON.parse(schema.textContent);
        data.name=brand.name;
        data.url=brand.canonicalUrl;
        data.description=brand.description;
        schema.textContent=JSON.stringify(data);
      }catch(_){ }
    }
  }

  function applyImages(value){
    revision++;
    var images=imageConfig.normalize(value)||{logoUrl:'',iconUrl:''};
    var logo=images.logoUrl||'/favicon.svg';
    var icon=images.iconUrl||logo;
    document.querySelectorAll('[data-nx-logo]').forEach(function(node){
      node.onerror=function(){node.onerror=null;node.src='/favicon.svg';};
      node.src=logo;
    });
    ['icon','apple-touch-icon'].forEach(function(rel){
      var link=document.querySelector('link[rel="'+rel+'"]');
      if(!link){link=document.createElement('link');link.rel=rel;document.head.appendChild(link);}
      link.removeAttribute('type');link.href=icon;
    });
    // Social crawlers need an HTTP URL; inline uploads are only used as UI images.
    var socialLogo=logo.startsWith('data:')?brand.logoUrl:new URL(logo,location.origin).href;
    setMeta('meta[property="og:image"]',socialLogo);
    setMeta('meta[name="twitter:image"]',socialLogo);
  }
  async function refresh(){
    var started=revision;
    var controller=new AbortController();
    var timer=setTimeout(function(){controller.abort();},8000);
    try{
      var response=await fetch('/api/health?mode=database&resource=settings',{cache:'no-store',credentials:'same-origin',signal:controller.signal});
      var payload=await response.json();
      if(!response.ok||payload.ok===false||!Array.isArray(payload.data)||started!==revision)return;
      var row=payload.data.find(function(item){return item.key==='branding';});
      applyImages(row&&row.value);
    }catch(_){/* The bundled logo remains usable when settings are unavailable. */}
    finally{clearTimeout(timer);}
  }
  window.NexoraBranding={apply:applyImages,refresh:refresh};
  applyMetadata();
  function start(){applyTextSlots();applyImages(null);refresh();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
