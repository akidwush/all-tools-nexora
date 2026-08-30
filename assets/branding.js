(function(){
  "use strict";

  var config=window.NexoraConfig;
  if(!config||!config.brand)return;
  var brand=config.brand;

  function setMeta(selector,value,attribute){
    var node=document.querySelector(selector);
    if(node&&value)node.setAttribute(attribute||"content",value);
  }

  function pageTitle(){
    var path=location.pathname.replace(/\/+$/,"")||"/";
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

    var hero=document.getElementById("nxBrandHero");
    if(hero){
      var owner=hero.querySelector("span");
      Array.prototype.forEach.call(hero.childNodes,function(node){
        if(node.nodeType===Node.TEXT_NODE&&String(node.nodeValue||"").trim())node.nodeValue="⚡ "+brand.name+" ";
      });
      if(owner)owner.textContent=brand.owner;
    }
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
    setMeta('link[rel="canonical"]',brand.canonicalUrl,"href");

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

  applyMetadata();
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",applyTextSlots,{once:true});
  else applyTextSlots();
})();
