(function(){
  "use strict";
  if(window.NexoraToolRegistry)return;

  var config=window.NexoraConfig;
  if(!config||!config.tools)throw new Error("NexoraConfig harus dimuat sebelum tool-registry.js.");

  var categories=["downloader","maker","tools","vault","external"];
  var rows=[];
  categories.forEach(function(category){
    var items=Array.isArray(config.tools[category])?config.tools[category]:[];
    items.forEach(function(item){
      var runtime=item.runtime||{};
      rows.push(Object.freeze({
        id:String(item.id||"").toLowerCase(),
        name:String(item.name||item.id||"Tool"),
        category:category,
        mode:runtime.mode||"local",
        module:runtime.module||null,
        handler:runtime.handler||null,
        dependency:runtime.dependency||item.link||null,
        order:rows.length,
        requiresNetwork:["api","hybrid","external"].indexOf(runtime.mode)!==-1,
        restricted:runtime.mode==="restricted"
      }));
    });
  });

  var map=Object.create(null);
  rows.forEach(function(tool){map[tool.id]=tool;});

  function get(id){return map[String(id||"").toLowerCase()]||null;}
  function list(){return rows.slice();}
  function statusLabel(status){
    return ({ready:"Siap",degraded:"Terbatas",offline:"Gangguan",restricted:"Terbatas",missing:"Tidak lengkap",unknown:"Belum dicek"})[status]||status;
  }

  window.NexoraToolRegistry=Object.freeze({
    version:config.version,
    count:rows.length,
    get:get,
    list:list,
    statusLabel:statusLabel
  });
  window.dispatchEvent(new CustomEvent("nexora:tool-registry-ready"));
})();
