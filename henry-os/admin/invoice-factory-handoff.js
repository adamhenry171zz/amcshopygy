(()=>{
  const VERSION_KEY='henry_os_data_version';
  const BATCH_KEY='henry_os_last_invoice_batch';
  const status=document.getElementById('commitStatus');
  if(!status)return;
  let handled='';
  const invoiceNos=()=>[...status.querySelectorAll('.savedInvoice span')].map(el=>String(el.textContent||'').split('·')[0].trim()).filter(Boolean);
  async function verifyAndSignal(){
    const banner=status.querySelector('.savedBanner');
    if(!banner)return;
    const batchId=String(document.getElementById('batchId')?.value||'').trim();
    const ids=invoiceNos();
    const fingerprint=`${batchId}|${ids.join(',')}`;
    if(!ids.length||fingerprint===handled)return;
    handled=fingerprint;
    let verify=status.querySelector('[data-henry-handoff-verify]');
    if(!verify){verify=document.createElement('div');verify.dataset.henryHandoffVerify='1';verify.className='statusLine';banner.appendChild(verify)}
    verify.textContent='Verifying the saved invoices inside HENRY OS…';
    try{
      const r=await fetch('/.netlify/functions/henry-amc?action=list&type=invoices',{credentials:'same-origin',cache:'no-store'});
      let data={};try{data=await r.json()}catch{}
      if(r.status===401)throw new Error('Owner session expired before HENRY OS verification.');
      if(!r.ok)throw new Error(data.error||'Could not verify the HENRY OS invoice list.');
      const existing=new Set((Array.isArray(data.items)?data.items:[]).map(x=>String(x.invoiceNo||'').trim().toUpperCase()));
      const missing=ids.filter(x=>!existing.has(x.toUpperCase()));
      if(missing.length)throw new Error(`Save returned successfully, but HENRY OS did not return: ${missing.join(', ')}.`);
      const stamp=Date.now();
      localStorage.setItem(VERSION_KEY,String(stamp));
      localStorage.setItem(BATCH_KEY,JSON.stringify({stamp,batchId,invoiceNos:ids}));
      verify.className='statusLine good';
      verify.textContent=`Verified in HENRY OS: ${ids.join(', ')}. The main dashboard will refresh automatically.`;
      const link=banner.querySelector('a[href^="/admin/"]');if(link)link.href=`/admin/?sync=${stamp}`;
    }catch(e){
      verify.className='statusLine bad';
      verify.textContent=e.message||'The batch could not be verified in HENRY OS.';
    }
  }
  const observer=new MutationObserver(()=>verifyAndSignal());
  observer.observe(status,{childList:true,subtree:true});
  verifyAndSignal();
})();