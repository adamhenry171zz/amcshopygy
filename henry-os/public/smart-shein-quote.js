(()=>{
 const root=document.getElementById('smart-shein-quote');if(!root)return;
 const $=id=>root.querySelector('#'+id),form=$('sq-form'),filesInput=$('sq-files'),consent=$('sq-consent');
 const radios=[...root.querySelectorAll('input[name="sq-retailer"]')];
 const selected=()=>radios.find(r=>r.checked)?.value||'';
 const msg=(s,bad=false)=>{$('sq-msg').textContent=s;$('sq-msg').classList.toggle('sq-error',bad)};
 function syncStore(){const store=selected();$('sq-upload-title').textContent='Upload '+(store&&store!=='Other'?store+' ':'')+'cart screenshots';$('sq-other-wrap').hidden=store!=='Other';$('sq-other').required=store==='Other';}
 function syncFiles(){const files=[...filesInput.files];$('sq-files-line').hidden=!files.length;$('sq-consent-wrap').hidden=!files.length;consent.required=files.length>0;if(!files.length)consent.checked=false;$('sq-file-list').textContent=files.length?files.length+' screenshot'+(files.length===1?'':'s')+' selected · '+files.map(f=>f.name).join(', '):'';}
 radios.forEach(r=>r.addEventListener('change',syncStore));filesInput.addEventListener('change',()=>{syncFiles();if(filesInput.files.length>3)msg('Please choose no more than three screenshots.',true);else msg('')});
 $('sq-clear').addEventListener('click',()=>{filesInput.value='';syncFiles();msg('')});
 const asData=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Unable to read screenshot.'));r.onload=()=>resolve({mime:blob.type,data:String(r.result).split(',')[1]});r.readAsDataURL(blob)});
 async function screenshot(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use JPG, PNG or WebP screenshots.');
  if(file.size<=1050000)return asData(file);
  if(file.size>20000000)throw Error('Screenshot is too large. Crop it and try again.');
  // Retain the original when possible; resize oversized mobile screenshots locally.
  const image=new Image(),url=URL.createObjectURL(file);
  try{
   await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Unable to open screenshot.'));image.src=url});
   const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw Error('Unable to resize this screenshot.');
   for(const [max,quality] of [[2600,.92],[2300,.88],[1900,.85],[1600,.82]]){
    const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(blob&&blob.size<=1050000)return asData(blob);
   }
   throw Error('Screenshot is too large after resizing. Crop it or split the cart across screenshots.');
  }finally{URL.revokeObjectURL(url)}
 }
 form.onsubmit=async e=>{
  e.preventDefault();if(!form.reportValidity())return;const files=[...filesInput.files],store=selected(),link=$('sq-link').value.trim();
  if(!store){msg('Choose your shopping store.',true);return}
  if(files.length>3){msg('Upload no more than three screenshots.',true);return}
  if(!files.length&&!link){msg('Upload a cart screenshot or paste a shopping link.',true);return}
  if(files.length&&!consent.checked){msg('Confirm AI screenshot consent or remove the screenshots.',true);return}
  if(store==='Other'&&!$('sq-other').value.trim()){msg('Enter the name of the store.',true);return}
  $('sq-submit').disabled=true;msg('Sending your request…');
  try{
   const notes=(store==='Other'?'Store: '+$('sq-other').value.trim()+'\n':'')+$('sq-notes').value.trim();
   const screenshots=await Promise.all(files.map(screenshot));
   const response=await fetch('/.netlify/functions/henry-shein-quotes?action=submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({retailer:store,aiConsent:consent.checked,name:$('sq-name').value,whatsapp:$('sq-phone').value,email:'',cartLink:link,usConfirmed:$('sq-us').checked,website:$('sq-trap').value,notes,items:[],source:files.length?'customer_screenshots':'customer_link',screenshots}),cache:'no-store'});
   let d;try{d=await response.json()}catch{throw Error('Unable to contact AMC. Please try again.')}
   if(!response.ok)throw Error(d.error||'Request failed. Please try again.');
   form.reset();syncStore();syncFiles();msg('Request received! Reference '+d.reference+'. AMC will review your cart and contact you on WhatsApp.');
  }catch(err){msg(err.message||'Unable to submit your request.',true)}finally{$('sq-submit').disabled=false}
 };
 syncStore();syncFiles();
})();
