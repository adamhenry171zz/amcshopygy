const presets={
  members:{title:'Save More With AMC Members Club',text:'Lower shipping costs, waived package fees and member benefits on eligible shipments.',cta:'amcshopping.com/members'},
  course:{title:'Learn With AMC',text:'Build practical online shopping and business skills with AMC live classes and training.',cta:'amcshopping.com/course'},
  streaming:{title:'AMC Streaming Services',text:'Netflix, Prime Video, Disney+, Crunchyroll and more available through AMC.',cta:'amcshopping.com/streaming'},
  mailbox:{title:'Get Your AMC Mailbox',text:'Sign up for your AMC mailbox and start shipping your online purchases with confidence.',cta:'amcshopping.com/mailbox'},
  custom:{title:'AMC Promotion',text:'Add your own promotion message here.',cta:'amcshopping.com'}
};
const $=id=>document.getElementById(id);
function setView(type){
  $('normalView').classList.toggle('hide',type!=='normal');
  $('memberView').classList.toggle('hide',type!=='member');
  $('normalBtn').classList.toggle('on',type==='normal');
  $('memberBtn').classList.toggle('on',type==='member');
}
function syncPromo(){
  document.querySelectorAll('.promoTitle').forEach(el=>el.textContent=$('promoTitle').value||'AMC Promotion');
  document.querySelectorAll('.promoText').forEach(el=>el.textContent=$('promoText').value||'');
  document.querySelectorAll('.promoCta').forEach(el=>el.textContent=$('promoCta').value||'amcshopping.com');
}
function applyPreset(){
  const p=presets[$('promoPreset').value]||presets.custom;
  $('promoTitle').value=p.title;$('promoText').value=p.text;$('promoCta').value=p.cta;syncPromo();
}
function savePromo(){
  const data={preset:$('promoPreset').value,title:$('promoTitle').value,text:$('promoText').value,cta:$('promoCta').value};
  localStorage.setItem('amcInvoicePromo',JSON.stringify(data));
  const btn=$('savePromoBtn');const old=btn.textContent;btn.textContent='Saved';setTimeout(()=>btn.textContent=old,1200);
}
function loadPromo(){
  try{const d=JSON.parse(localStorage.getItem('amcInvoicePromo')||'null');if(d){$('promoPreset').value=d.preset||'custom';$('promoTitle').value=d.title||'';$('promoText').value=d.text||'';$('promoCta').value=d.cta||'';syncPromo();return;}}catch(e){}
  $('promoPreset').value='mailbox';applyPreset();
}
document.addEventListener('DOMContentLoaded',()=>{
  $('normalBtn').addEventListener('click',()=>setView('normal'));
  $('memberBtn').addEventListener('click',()=>setView('member'));
  $('promoPreset').addEventListener('change',applyPreset);
  $('promoTitle').addEventListener('input',syncPromo);
  $('promoText').addEventListener('input',syncPromo);
  $('promoCta').addEventListener('input',syncPromo);
  $('savePromoBtn').addEventListener('click',savePromo);
  loadPromo();
});
