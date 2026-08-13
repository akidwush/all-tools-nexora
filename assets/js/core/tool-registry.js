(function(){
  "use strict";
  if(window.NexoraToolRegistry) return;

  var rows = [
    ["terabox","Terabox Downloader","api","download-pack","renderTerabox","https://api.nexray.eu.cc/"],
    ["instagram","Instagram","api",null,"renderInstagram","https://api.nexray.eu.cc/"],
    ["tiktok","TikTok","api","tiktok","renderTiktok","https://www.tikwm.com/"],
    ["youtube","YouTube","api",null,"renderYoutube","https://api.nexray.eu.cc/"],
    ["spotify","Spotify Downloader","api","download-pack","renderSpotify","https://api.nexray.eu.cc/"],
    ["fakebankjago","Fake Bank Jago","api","download-pack","renderFakeBankJago","https://api.nexray.eu.cc/"],
    ["brat","BRAT Generator","api",null,"renderBrat","https://api.siputzx.my.id/"],
    ["iqc","IQC Generator","api","generator-pack","renderIqc2","https://api.nexray.eu.cc/"],
    ["sertifikat","Sertifikat Custom","api","source-features","renderSertifikatTololSource","https://api.siputzx.my.id/"],
    ["ektp","E-KTP Generator","local",null,"renderEktp",null],
    ["fakedana","Fake Dana","api",null,"renderFakeDana","https://api.nexray.eu.cc/"],
    ["fakedev","FakeDev","api","source-features","renderFakeDev","https://api.ikyyxd.my.id/"],
    ["fakelobby","Fake Lobby","api",null,"renderFakeLobby","https://api.nexray.eu.cc/"],
    ["winquotes","Windows Quotes","api","generator-pack","renderWinquotes2","https://apii.nexadev.my.id/"],
    ["nokiamsg","Nokia Message","api","generator-pack","renderNokiaMsg","https://apii.nexadev.my.id/"],
    ["tanyaustadz","Tanya Ustadz","local",null,"renderTanyaUstadz",null],
    ["mltools","ML Tools","module","imported-tools","renderMlTools",null],
    ["comicreader","Baca Komik Full","module","comic-reader","renderComicReader",null],
    ["promptgenerate","Prompt Generator","module","imported-tools","renderPromptGenerator",null],
    ["fakeovo","Fake OVO","module","imported-tools","renderFakeOvo",null],
    ["quotegenerator","Quote Generator","module","imported-tools","renderQuoteGenerator",null],
    ["carifakta","CariFakta","module","imported-tools","renderCariFakta",null],
    ["virusscan","Virus Scan","module","virus-scan","renderVirusScan",null],
    ["cryptomarket","Crypto Market Scanner","api","crypto-market","renderCryptoMarket","https://api.coingecko.com/"],
    ["webintel","Nexora Web Intelligence","hybrid","web-intelligence","renderWebIntelligence","https://pagespeedonline.googleapis.com/"],
    ["spaceexplorer","Space Explorer","api","space-explorer","renderSpaceExplorer","https://api.nasa.gov/"],
    ["ocrintel","Nexora OCR Intelligence","api","ocr-intelligence","renderOcrIntelligence","https://api.ocr.space/"],
    ["svgalight","SVG → Alight XML","api","svg-alight","renderSvgAlight","https://svgtoxml.vercel.app/"],
    ["imagevectorizer","Nexora Image Vectorizer","module","image-vectorizer","renderImageVectorizer",null],
    ["bigimage","Big Image","api","big-image","renderBigImage",null],
    ["calc","Calculator","local",null,"renderCalc",null],
    ["pwgen","Password Gen","local",null,"renderPwgen",null],
    ["morse","Morse Code","local",null,"renderMorse",null],
    ["removebg","Remove BG","local",null,"renderRemovebg",null],
    ["enhancer","Image Enhancer","local",null,"renderEnhancer",null],
    ["ttquote","Quote TikTok Nexus","module","tiktok-quote","renderTiktokQuote",null],
    ["qrgen","QR Generator","local",null,"renderQrGenerator",null],
    ["tiktokhd","Upload TikTok HD","external",null,"openTikTokHdUpload","https://www.tiktok.com/tiktokstudio"],
    ["getcode","Get Code HTML","module","get-code","openGetCodeRoom",null],
    ["vdeploy","Deploy & Update Web","module","deploy-center","openDeploy",null],
    ["zxvai","ZxVAI","external",null,null,"https://zxvaiapk.netlify.app/"],
    ["fotolink","Foto To Link","external",null,null,"https://pixvault-bykz.netlify.app/"],
    ["webencryption","Web Encryption","module","web-encryption","renderWebEncryption",null],
    ["unbanwa","Unban WhatsApp","module","unban-whatsapp","openNexusUnban",null]
  ];

  var map = Object.create(null);
  rows.forEach(function(row,index){
    map[row[0]] = Object.freeze({
      id:row[0],name:row[1],mode:row[2],module:row[3]||null,handler:row[4]||null,
      dependency:row[5]||null,order:index,requiresNetwork:["api","hybrid","external"].indexOf(row[2])!==-1,
      restricted:row[2]==="restricted"
    });
  });

  function get(id){ return map[String(id||"").toLowerCase()] || null; }
  function list(){ return rows.map(function(row){ return map[row[0]]; }); }
  function statusLabel(status){
    return ({ready:"Siap",degraded:"Terbatas",offline:"Gangguan",restricted:"Terbatas",missing:"Tidak lengkap",unknown:"Belum dicek"})[status] || status;
  }

  window.NexoraToolRegistry = Object.freeze({version:"6.3.18",count:rows.length,get:get,list:list,statusLabel:statusLabel});
  window.dispatchEvent(new CustomEvent("nexora:tool-registry-ready"));
})();
