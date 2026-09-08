/* Controlled per-page queue. No image or provider secrets enter this module. */
(function(root){
 'use strict';
 async function run(options){
  var cursor=0,stop=false,failed=[],completed=0;
  var pending=options.pages.slice();
  function cancel(){stop=true;}
  options.control.cancel=cancel;
  async function worker(){
   while(!stop&&cursor<pending.length){
    var page=pending[cursor++],attempt=0;
    for(;;){
     try{
      var result=await options.request(page);
      completed++;options.result(page,result);options.progress(completed,failed.length);
      break;
     }catch(error){
      if(stop||error.name==='AbortError')break;
      var quota=!error.status||error.status===429||error.code==='JOB_EXPIRED'||error.status===401||error.status===403||error.status===503;
      if(quota){stop=true;options.pause(error);break;}
      if(attempt++<1&&(error.status>=500||error.code==='PAGE_BUSY')){
       await options.delay(error.code==='PAGE_BUSY'?5000:1500);
       if(stop)break;
       continue;
      }
      failed.push(page);options.failed(page,error);options.progress(completed,failed.length);break;
     }
    }
   }
  }
  await Promise.all(Array.from({length:Math.max(1,Math.min(3,options.concurrency||2))},worker));
  return {completed:completed,failed:failed,cancelled:stop};
 }
 root.NexoraComicQueue={run:run};
 if(typeof module==='object'&&module.exports)module.exports=root.NexoraComicQueue;
})(typeof window==='object'?window:globalThis);
