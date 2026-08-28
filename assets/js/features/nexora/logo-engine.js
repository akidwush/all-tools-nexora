/* Native adapter for the complete local Nexora Logo Animate XML template set. */
(function(global){
  'use strict';
  var cache=null;
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
  function slug(value){return String(value||'nexora-logo-animate').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9#_-]+/g,'-').replace(/-+/g,'-').replace(/^-+|-+$/g,'')||'nexora-logo-animate';}
  function argb(value){var raw=String(value||'#ffffff').replace('#','').slice(0,6);return '#FF'+raw.toUpperCase().padEnd(6,'F');}
  function load(){
    if(cache)return cache;
    cache=Promise.all(['head','textblock','tail'].map(function(name){return fetch('assets/data/nexora/logo/template-'+name+'.xml',{cache:'force-cache'}).then(function(response){if(!response.ok)throw new Error('Template Logo Animate tidak ditemukan: '+name);return response.text();});})).then(function(parts){return{head:parts[0],textblock:parts[1],tail:parts[2]};}).catch(function(error){cache=null;throw error;});
    return cache;
  }
  function generate(options){
    var opts=options||{};
    return load().then(function(templates){
      var head=templates.head.replace('<scene title="Nexora Tools Logo Animate"','<scene title="'+esc(slug(opts.filename))+'"');
      var text='';
      if(opts.addText!==false){
        text=templates.textblock;
        var content=String(opts.text||'Nexora Tools').slice(0,80);
        var font=String(opts.fontFile||'PlusJakartaSans-SemiBold.ttf').replace(/[^a-zA-Z0-9_.-]/g,'');
        text=text.split('imported?name=PlusJakartaSans-SemiBold.ttf').join('imported?name='+font);
        text=text.split('<content>Nexora Tools</content>').join('<content>'+esc(content)+'</content>');
        text=text.split('label="Nexora Tools"').join('label="'+esc(content)+'"');
        text=text.replace(/(<\/transform>\s*)(<effect id="com\.alightcreative\.effects\.texttransform")/g,'$1<fillColor value="'+argb(opts.textColor)+'"/>\n            $2');
      }
      var xml=head+text+templates.tail;
      if(!/<scene\b/.test(xml)||!/<media\b/.test(xml))throw new Error('Template Logo Animate tidak valid.');
      return xml;
    });
  }
  global.NexoraLogoAnimateEngine=Object.freeze({ready:true,load:load,generate:generate});
})(window);
