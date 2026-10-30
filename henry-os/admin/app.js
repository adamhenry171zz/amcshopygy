const $=id=>document.getElementById(id);
const show=id=>{for(const key of ['setup','login','dashboard'])$(key).classList.toggle('hidden',key!==id)};
const status=msg=>$('login-status').textContent=msg;
async function api(action,method='GET',body){const r=await fetch('/.netlify/functions/henry-auth?action='+encodeURIComponent(action),{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});let data;try{data=await r.json()}catch{data={}}return {ok:r.ok,data,status:r.status}}
async function boot(){try{const r=await api('session');if(r.status===503){show('setup');return}show(r.ok&&r.data.authenticated?'dashboard':'login');$('owner-name').textContent='Signed in as ahdesignai@gmail.com'}catch{show('setup')}}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();status('Checking credentials…');$('sign-in').disabled=true;try{const r=await api('login','POST',{email:$('email').value,password:$('password').value});$('password').value='';if(!r.ok){status(r.data.error||'Unable to sign in');return}status('');await boot()}catch{status('Unable to sign in')}finally{$('sign-in').disabled=false}});
$('logout').addEventListener('click',async()=>{await api('logout','POST');show('login')});
boot();
