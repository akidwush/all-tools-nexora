(function(){
  'use strict';
  const form=document.getElementById('brandingSettingsForm');
  if(!form)return;
  const config=window.NexoraBrandConfig;
  const message=document.getElementById('brandingMessage');
  let editable=false,dirty=false,busy=false;
  let draft={logoUrl:'',iconUrl:''};
  const generations={logoUrl:0,iconUrl:0};
  function status(text,error){message.textContent=text;message.className='modal-message '+(error?'is-error':'is-success');}
  function controls(){form.querySelectorAll('input,button').forEach(node=>{node.disabled=!editable||busy;});}
  function preview(){
    ['logoUrl','iconUrl'].forEach(key=>{
      const image=document.getElementById('brandPreview-'+key);
      const src=config.imageUrl(draft[key])||(key==='iconUrl'&&config.imageUrl(draft.logoUrl))||'/favicon.svg';
      image.onerror=()=>{image.onerror=null;image.src='/favicon.svg';};
      image.src=src;
    });
  }
  function fill(){
    ['logoUrl','iconUrl'].forEach(key=>{
      const input=document.getElementById('brandInput-'+key);
      input.value=draft[key].startsWith('data:')?'':draft[key];
      input.placeholder=draft[key].startsWith('data:')?'Gambar unggahan tersimpan — isi URL untuk mengganti':'https://... atau /assets/logo.png';
    });
    preview();controls();
  }
  async function fileData(file,size){
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>5*1024*1024)throw new Error('Pilih PNG, JPEG, atau WebP maksimal 5 MB.');
    const url=URL.createObjectURL(file);
    try{
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Gambar tidak dapat dibaca.'));img.src=url;});
      if(!image.naturalWidth||!image.naturalHeight)throw new Error('Ukuran gambar tidak valid.');
      const scale=Math.min(1,size/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Browser belum mendukung pengolahan gambar.');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/png');
      if(!config.imageUrl(data))throw new Error('Gambar terlalu besar setelah diperkecil. Coba gambar yang lebih sederhana.');
      return data;
    }finally{URL.revokeObjectURL(url);}
  }
  ['logoUrl','iconUrl'].forEach(key=>{
    document.getElementById('brandInput-'+key).addEventListener('input',event=>{
      generations[key]++;draft[key]=event.target.value.trim();dirty=true;preview();
    });
    document.getElementById('brandFile-'+key).addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file||!editable||busy)return;
      const generation=++generations[key];busy=true;controls();
      try{const data=await fileData(file,key==='logoUrl'?192:64);if(generation===generations[key]){draft[key]=data;dirty=true;fill();status('Gambar siap. Tekan Simpan Logo & Ikon untuk menerapkan.');}}
      catch(error){status(error.message,true);}
      finally{event.target.value='';busy=false;controls();}
    });
    document.getElementById('brandReset-'+key).addEventListener('click',()=>{generations[key]++;draft[key]='';dirty=true;fill();status('Reset siap. Simpan untuk menerapkan.');});
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!editable||busy)return;
    const value=config.normalize(draft);if(!value){status('URL harus HTTPS atau path lokal. Pilih gambar melalui tombol unggah.',true);return;}
    busy=true;controls();status('Menyimpan...');
    const csrf=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('nx_admin_csrf='));
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch('/api/admin/dashboard',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf?decodeURIComponent(csrf.slice(14)):''},body:JSON.stringify({key:'branding',branding:value}),signal:controller.signal});
      const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.message||result.error||'Gagal menyimpan logo.');
      draft=config.normalize(result.data.value)||value;dirty=false;fill();window.NexoraBranding?.apply(draft);
      document.dispatchEvent(new CustomEvent('nexora:branding-saved',{detail:result.data}));
      status('Logo dan ikon tersimpan. Muat ulang halaman publik untuk melihat perubahan.');
    }catch(error){status(error.name==='AbortError'?'Penyimpanan melewati batas waktu. Muat ulang untuk memeriksa hasil sebelum mencoba lagi.':error.message,true);}
    finally{clearTimeout(timer);busy=false;controls();}
  });
  window.NexoraAdminBranding={sync(dashboard,canEdit){
    editable=Boolean(canEdit);
    if(!dirty&&!busy){const row=(dashboard.settings||[]).find(item=>item.key==='branding');draft=config.normalize(row?.value)||{logoUrl:'',iconUrl:''};fill();}
    controls();
  }};
  controls();preview();
})();
