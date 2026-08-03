(function(){
  "use strict";
  const form=document.getElementById("adminLoginForm");
  const email=document.getElementById("adminEmail");
  const password=document.getElementById("adminPassword");
  const submit=document.getElementById("loginSubmit");
  const message=document.getElementById("loginMessage");
  const toggle=document.getElementById("passwordToggle");

  function setMessage(text,type){
    message.textContent=text||"";
    message.className="form-message"+(type?` is-${type}`:"");
  }
  function setLoading(loading){
    submit.disabled=loading;
    submit.innerHTML=loading?'<i class="fa-solid fa-spinner fa-spin"></i><span>Memverifikasi...</span>':'<span>Masuk ke Dashboard</span><i class="fa-solid fa-arrow-right"></i>';
  }
  async function sessionCheck(){
    try{
      const response=await fetch("/api/admin/auth",{cache:"no-store",credentials:"same-origin"});
      const data=await response.json();
      if(data.authenticated) location.replace("/admin");
    }catch{}
  }
  toggle.addEventListener("click",()=>{
    const show=password.type==="password";
    password.type=show?"text":"password";
    toggle.innerHTML=show?'<i class="fa-regular fa-eye-slash"></i>':'<i class="fa-regular fa-eye"></i>';
    toggle.setAttribute("aria-label",show?"Sembunyikan kata sandi":"Tampilkan kata sandi");
  });
  form.addEventListener("submit",async(event)=>{
    event.preventDefault();
    setMessage("");
    if(!email.validity.valid||password.value.length<6){
      setMessage("Periksa kembali email dan kata sandi.","error");
      return;
    }
    setLoading(true);
    try{
      const response=await fetch("/api/admin/auth",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({email:email.value.trim(),password:password.value})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok) throw new Error(data.message||"Login gagal.");
      setMessage("Login berhasil. Membuka dashboard...","success");
      location.replace("/admin");
    }catch(error){
      setMessage(error.message||"Login gagal.","error");
      setLoading(false);
    }
  });
  sessionCheck();
})();
