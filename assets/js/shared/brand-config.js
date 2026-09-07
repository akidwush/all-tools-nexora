/* Shared browser/server validation for admin-managed brand images. */
(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.NexoraBrandConfig=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  var MAX_IMAGE_LENGTH=220000;
  function imageUrl(value){
    if(typeof value!=='string')return null;
    var text=value.trim();
    if(!text)return '';
    if(/[\u0000-\u001f\u007f\\]/.test(text))return null;
    if(text.startsWith('data:')){
      if(text.length>MAX_IMAGE_LENGTH)return null;
      var match=text.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if(!match||match[2].length%4!==0)return null;
      var bytes;
      try{bytes=typeof atob==='function'?atob(match[2]):Buffer.from(match[2],'base64').toString('latin1');}catch(_){return null;}
      var valid=match[1]==='png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
      return valid?text:null;
    }
    if(text.length>2000)return null;
    try{
      var parsed=new URL(text,'https://nexora.invalid');
      if(parsed.username||parsed.password)return null;
      if(/^\/(?!\/)/.test(text)&&parsed.origin==='https://nexora.invalid')return parsed.pathname+parsed.search+parsed.hash;
      return /^https:\/\//i.test(text)&&parsed.protocol==='https:'?parsed.href:null;
    }catch(_){return null;}
  }
  function normalize(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return null;
    var logo=imageUrl(value.logoUrl),icon=imageUrl(value.iconUrl);
    return logo===null||icon===null?null:{logoUrl:logo,iconUrl:icon};
  }
  return Object.freeze({imageUrl:imageUrl,normalize:normalize,MAX_IMAGE_LENGTH:MAX_IMAGE_LENGTH});
});
