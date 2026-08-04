(function(){
  "use strict";
  var ENDPOINT="/api/feedback?mode=analytics";
  var VISITOR_KEY="nx_analytics_visitor_v1";
  var SESSION_KEY="nx_analytics_session_v1";
  var PAGE_KEY="nx_analytics_page_sent_v1";
  var lastTool="";var lastToolAt=0;

  function randomId(){
    try{return crypto.randomUUID();}catch{return Date.now().toString(36)+Math.random().toString(36).slice(2);}
  }
  function readOrCreate(storage,key){
    try{var value=storage.getItem(key);if(value)return value;value=randomId();storage.setItem(key,value);return value;}catch{return randomId();}
  }
  var visitorId=readOrCreate(localStorage,VISITOR_KEY);
  var sessionId=readOrCreate(sessionStorage,SESSION_KEY);

  function deviceType(){var ua=navigator.userAgent||"";if(/tablet|ipad/i.test(ua))return "tablet";if(/mobile|android|iphone/i.test(ua))return "mobile";return "desktop";}
  function browserName(){var ua=navigator.userAgent||"";if(/Edg\//.test(ua))return "Edge";if(/Firefox\//.test(ua))return "Firefox";if(/SamsungBrowser\//.test(ua))return "Samsung Internet";if(/OPR\//.test(ua))return "Opera";if(/Chrome\//.test(ua))return "Chrome";if(/Safari\//.test(ua))return "Safari";return "Other";}
  function countryCode(){var node=document.getElementById("userCountry");return node&&node.dataset?node.dataset.countryCode||"":"";}
  function cleanToolId(value){var id=String(value||"").trim().toLowerCase();return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)?id:"";}
  function send(eventType,toolId,metadata){
    var payload={eventType:eventType,toolId:cleanToolId(toolId)||undefined,visitorId:visitorId,sessionId:sessionId,path:location.pathname,referrer:document.referrer,countryCode:countryCode(),deviceType:deviceType(),browser:browserName(),metadata:metadata||{}};
    try{fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),keepalive:true,credentials:"same-origin"}).catch(function(){});}catch{}
  }
  function toolFromCard(card){if(!card)return "";return cleanToolId(card.getAttribute("data-tool-id")||card.getAttribute("data-nx-room-tool")||"");}
  function trackCard(event){
    var card=event.target&&event.target.closest?event.target.closest("[data-tool-id],[data-nx-room-tool]"):null;
    var toolId=toolFromCard(card);if(!toolId)return;
    var now=Date.now();if(lastTool===toolId&&now-lastToolAt<900)return;lastTool=toolId;lastToolAt=now;
    var anchor=event.target.closest&&event.target.closest("a[href]");var external=anchor&&anchor.origin!==location.origin;
    send(external?"external_open":"tool_open",toolId,{source:"card"});
  }
  document.addEventListener("click",trackCard,true);
  document.addEventListener("nexora:tool-error",function(event){var detail=event.detail||{};send("tool_error",detail.toolId,{module:detail.module||"",reason:String(detail.reason||"module_failed").slice(0,150)});});
  try{if(!sessionStorage.getItem(PAGE_KEY)){sessionStorage.setItem(PAGE_KEY,"1");send("page_view",null,{source:"website"});}}catch{send("page_view",null,{source:"website"});}
  window.NexoraAnalytics={track:send};
})();
