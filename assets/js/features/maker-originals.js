/* Nexora Maker Originals — server-proxied, truthful provider results only. */
(function(){
  'use strict';

  var SPECS={
    brat:{
      title:'BRAT Generator',icon:'fa-wand-magic-sparkles',note:'Menggunakan maker original. Tidak ada canvas lokal pengganti.',
      fields:[
        {key:'text',label:'Teks',type:'textarea',placeholder:'Tulis teks BRAT…',required:true,maxlength:500},
        {key:'style',label:'Style',type:'select',options:[['original','Original'],['hd','HD']]}
      ]
    },
    iqc:{
      title:'IQC Generator',icon:'fa-images',note:'Provider original dengan fallback server-side. Mode Image/Dark lama yang tidak stabil dihapus.',
      fields:[
        {key:'text',label:'Teks',type:'textarea',placeholder:'Tulis pesan IQC…',required:true,maxlength:500},
        {key:'style',label:'Mode',type:'select',options:[['v1','IQC v1'],['simple','IQC Simple']]},
        {key:'provider',label:'Operator',type:'text',value:'INDOSAT',maxlength:24,conditional:'v1'},
        {key:'jam',label:'Jam',type:'time',value:'12:00',conditional:'v1'},
        {key:'baterai',label:'Baterai (%)',type:'number',value:'50',min:'0',max:'100',conditional:'v1'}
      ]
    },
    fakebankjago:{
      title:'Fake Bank Jago',icon:'fa-building-columns',note:'Simulasi/prank. Output original provider diberi watermark permanen “BUKAN BUKTI TRANSAKSI”.',
      fields:[
        {key:'nama',label:'Nama',type:'text',value:'Nexora User',maxlength:80},
        {key:'saldo',label:'Saldo simulasi',type:'number',value:'100000',min:'0',max:'999999999999'}
      ]
    },
    fakedana:{
      title:'Fake DANA',icon:'fa-money-bill-wave',note:'Simulasi/prank. Tidak dapat digunakan sebagai bukti transaksi karena watermark permanen.',
      fields:[{key:'nominal',label:'Nominal simulasi',type:'number',value:'100000',min:'0',max:'999999999999'}]
    },
    fakeovo:{
      title:'Fake OVO',icon:'fa-wallet',note:'Sekarang memakai route khusus Fake OVO — tidak lagi membuka ML Tools. Output diberi watermark simulasi.',
      fields:[{key:'nominal',label:'Nominal simulasi',type:'number',value:'100000',min:'0',max:'999999999999'}]
    },
    fakedev:{
      title:'FakeDev',icon:'fa-laptop-code',note:'Novelty developer card dari provider original; tidak ada renderer lokal pengganti.',
      fields:[
        {key:'name',label:'Nama',type:'text',value:'Nexora Developer',maxlength:80},
        {key:'image',label:'URL foto HTTPS',type:'url',placeholder:'https://…',required:true,maxlength:1000},
        {key:'verified',label:'Verified badge',type:'checkbox',value:'true'}
      ]
    },
    sertifikat:{
      title:'Sertifikat Meme',icon:'fa-certificate',note:'Hanya memakai sumber sertifikat original. Jika sumber offline, Nexora menampilkan error — bukan template lokal palsu.',
      fields:[{key:'text',label:'Nama / teks',type:'text',placeholder:'Masukkan nama…',required:true,maxlength:180}]
    },
    tanyaustadz:{
      title:'Tanya Ustadz',icon:'fa-user-tie',note:'Endpoint lama Nanzz diganti ke maker Ustadz Nexray melalui proxy Nexora.',
      fields:[{key:'text',label:'Pertanyaan',type:'textarea',placeholder:'Tulis pertanyaan…',required:true,maxlength:500}]
    }
  };

  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fieldHtml(field){
    var attrs=' name="'+esc(field.key)+'" data-nx-maker-field="'+esc(field.key)+'"';
    if(field.placeholder)attrs+=' placeholder="'+esc(field.placeholder)+'"';
    if(field.value!=null && field.type!=='checkbox')attrs+=' value="'+esc(field.value)+'"';
    if(field.required)attrs+=' required';
    if(field.maxlength)attrs+=' maxlength="'+esc(field.maxlength)+'"';
    if(field.min!=null)attrs+=' min="'+esc(field.min)+'"';
    if(field.max!=null)attrs+=' max="'+esc(field.max)+'"';
    if(field.conditional)attrs+=' data-nx-maker-conditional="'+esc(field.conditional)+'"';
    if(field.type==='textarea') return '<label class="nx-maker-field'+(field.conditional?' nx-maker-conditional':'')+'"><span>'+esc(field.label)+'</span><textarea'+attrs+'></textarea></label>';
    if(field.type==='select'){
      return '<label class="nx-maker-field"><span>'+esc(field.label)+'</span><select'+attrs+'>'+field.options.map(function(row){return '<option value="'+esc(row[0])+'">'+esc(row[1])+'</option>';}).join('')+'</select></label>';
    }
    if(field.type==='checkbox') return '<label class="nx-maker-check"><input type="checkbox"'+attrs+' checked><span>'+esc(field.label)+'</span></label>';
    return '<label class="nx-maker-field'+(field.conditional?' nx-maker-conditional':'')+'"><span>'+esc(field.label)+'</span><input type="'+esc(field.type||'text')+'"'+attrs+'></label>';
  }

  function render(tool,body){
    var spec=SPECS[tool];
    if(!spec||!body)return;
    if(body.__nxMakerObjectUrl){try{URL.revokeObjectURL(body.__nxMakerObjectUrl);}catch(_){ } body.__nxMakerObjectUrl='';}
    body.innerHTML='<section class="nx-maker-original" data-nx-maker="'+esc(tool)+'">'+
      '<header class="nx-maker-head"><div class="nx-maker-icon"><i class="fa-solid '+esc(spec.icon)+'"></i></div><div><span class="nx-maker-kicker">NEXORA // ORIGINAL SOURCE</span><h2>'+esc(spec.title)+'</h2><p>'+esc(spec.note)+'</p></div></header>'+
      '<form class="nx-maker-form">'+spec.fields.map(fieldHtml).join('')+
      '<button class="nx-maker-submit" type="submit"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Generate</span></button></form>'+
      '<div class="nx-maker-status" role="status" aria-live="polite"></div>'+
      '<div class="nx-maker-result" hidden><div class="nx-maker-preview"><img alt="Hasil '+esc(spec.title)+'"></div><div class="nx-maker-actions"><a class="nx-maker-download" download><i class="fa-solid fa-download"></i> Download hasil</a></div><small class="nx-maker-provider"></small></div>'+ 
      '</section>';

    var root=body.querySelector('.nx-maker-original');
    var form=root.querySelector('form');
    var status=root.querySelector('.nx-maker-status');
    var result=root.querySelector('.nx-maker-result');
    var img=result.querySelector('img');
    var download=result.querySelector('.nx-maker-download');
    var provider=result.querySelector('.nx-maker-provider');

    function conditional(){
      if(tool!=='iqc')return;
      var style=form.elements.style && form.elements.style.value;
      root.querySelectorAll('[data-nx-maker-conditional]').forEach(function(row){row.hidden=row.getAttribute('data-nx-maker-conditional')!==style;});
    }
    if(form.elements.style)form.elements.style.addEventListener('change',conditional);
    conditional();

    form.addEventListener('submit',async function(event){
      event.preventDefault();
      if(!form.reportValidity())return;
      result.hidden=true;
      status.className='nx-maker-status is-loading';
      status.textContent='Menghubungi provider original…';
      var params=new URLSearchParams({mode:'maker-original',tool:tool});
      spec.fields.forEach(function(field){
        var element=form.elements[field.key];
        if(!element)return;
        if(field.conditional && form.elements.style && form.elements.style.value!==field.conditional)return;
        params.set(field.key,field.type==='checkbox'?(element.checked?'true':'false'):String(element.value||'').trim());
      });
      var controller=new AbortController();
      var timer=setTimeout(function(){controller.abort();},32000);
      try{
        var response=await fetch('/api/tool-health?'+params.toString(),{method:'GET',headers:{Accept:'image/*,application/json'},credentials:'same-origin',signal:controller.signal});
        if(!response.ok){
          var message='Maker gagal (HTTP '+response.status+').';
          try{var data=await response.json(); if(data&&data.message)message=data.message;}catch(_){ }
          throw new Error(message);
        }
        var blob=await response.blob();
        if(!blob.size)throw new Error('Provider mengembalikan file kosong.');
        if(body.__nxMakerObjectUrl){try{URL.revokeObjectURL(body.__nxMakerObjectUrl);}catch(_){ }}
        var objectUrl=URL.createObjectURL(blob); body.__nxMakerObjectUrl=objectUrl;
        img.src=objectUrl; download.href=objectUrl;
        var extension=(blob.type.indexOf('svg')>=0?'svg':blob.type.indexOf('webp')>=0?'webp':blob.type.indexOf('gif')>=0?'gif':blob.type.indexOf('jpeg')>=0?'jpg':'png');
        download.download='nexora-'+tool+'-'+Date.now()+'.'+extension;
        var providerName=response.headers.get('x-nexora-maker-provider')||'Original provider';
        provider.textContent='Source: '+providerName+(response.headers.get('x-nexora-simulation-watermark')?' · watermark simulasi permanen':'');
        result.hidden=false; status.className='nx-maker-status is-ok'; status.textContent='Hasil original berhasil dimuat.';
      }catch(error){
        status.className='nx-maker-status is-error';
        status.textContent=error&&error.name==='AbortError'?'Provider melewati batas waktu. Coba lagi nanti.':(error&&error.message||'Maker gagal.');
      }finally{clearTimeout(timer);}
    });
  }

  window.renderBrat=function(body){render('brat',body);};
  window.renderIqc=function(body){render('iqc',body);};
  window.renderIqc2=function(body){render('iqc',body);};
  window.renderFakeBankJago=function(body){render('fakebankjago',body);};
  window.renderFakeDana=function(body){render('fakedana',body);};
  window.renderFakeOvo=function(body){render('fakeovo',body);};
  window.renderFakeDev=function(body){render('fakedev',body);};
  window.renderSertifikatTololSource=function(body){render('sertifikat',body);};
  window.renderTanyaUstadz=function(body){render('tanyaustadz',body);};
})();
