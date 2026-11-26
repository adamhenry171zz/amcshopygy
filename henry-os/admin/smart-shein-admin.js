(()=>{
 const $=id=>document.getElementById(id),endpoint='/.netlify/functions/henry-shein-quotes';
 const status=(s)=>{$('status').textContent=s};
 const api=async(action,body=null,id='')=>{const r=await fetch(endpoint+'?action='+action+(id?'&id='+encodeURIComponent(id):''),{credentials:'same-origin',cache:'no-store',...(body!==null?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});let d;try{d=await r.json()}catch{throw Error('Unable to contact quotation service.')}if(!r.ok)throw Error(d.error||'Request failed');return d};
 const stages={new:['review','needs_info','cancelled'],review:['needs_info','approved','cancelled'],needs_info:['review','cancelled'],approved:['review','sent','cancelled'],sent:['review','deposit_paid','cancelled'],deposit_paid:['ordered','cancelled'],ordered:['arrived'],arrived:['paid'],paid:[],cancelled:[]};
 let active=null;const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
 const fields=[['name','Product','text'],['price','Unit USD','number'],['qty','Quantity','number'],['size','Size','text'],['color','Colour','text'],['weight','Weight per unit (lb)','number'],['link','Retailer URL','url'],['image','Image URL (optional)','url'],['sku','SKU','text']];
 function itemRow(item={}){if($('items').children.length>=50)return;const field=document.createElement('fieldset');field.className='product';
 for(const [key,label,type] of fields){const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.type=type;i.value=item[key]??'';i.dataset.key=key;if(type==='number'){i.min=key==='qty'?'1':'0.01';i.step=key==='qty'?'1':'0.01'}l.append(i);field.append(l)}
 const b=document.createElement('button');b.type='button';b.textContent='Remove item';b.onclick=()=>field.remove();field.append(b);$('items').append(field)}
 function paymentRow(p={}){const f=document.createElement('fieldset');f.className='payment';for(const [k,l,t] of [['amount','Amount GYD','number'],['date','Payment date','date'],['reference','Payment reference / method','text']]){const label=document.createElement('label');label.textContent=l;const i=document.createElement('input');i.type=t;i.dataset.key=k;i.value=p[k]??'';label.append(i);f.append(label)}const b=document.createElement('button');b.type='button';b.textContent='Remove payment entry';b.onclick=()=>f.remove();f.append(b);$('payments').append(f)}
 let suggestion=null;
 function renderAI(ai){
  suggestion=ai?.state==='ready'?ai:null;
  const editable=active&&['new','review','needs_info'].includes(active.status);
  $('ai-run').disabled=!editable||!active?.aiConsent||!active?.screenshotCount||!!ai;
  $('ai-apply').hidden=!suggestion||!editable;
  $('ai-status').textContent=ai?.state==='ready'?'AI draft only. '+ai.items.length+' rows; estimated USD '+Number(ai.estimatedUsd).toFixed(4)+'; '+ai.inputTokens+' input / '+ai.outputTokens+' output tokens. '+ai.allowance?.today+'/20 attempts today.':ai?.state==='failed'?ai.error+' Use manual entry.':ai?.state==='processing'?'Extraction already started. Refresh later; do not repeat.':!active?.screenshotCount?'No screenshots attached.':!active?.aiConsent?'AI consent missing. Use manual entry.':'Ready for owner-triggered extraction.';
  $('ai-result').textContent=suggestion?[...suggestion.items.map((x,i)=>(i+1)+'. '+x.name+' | USD '+(x.price??'UNKNOWN')+' | Qty '+(x.qty??'UNKNOWN')+' | '+x.size+' | '+x.color+' | '+(suggestion.evidence[i]||'')),...suggestion.warnings,'Checkout notes: '+suggestion.checkoutNotes].join('\n'):'';
 }
 $('ai-run').onclick=async()=>{if(!active)return;if(!confirm('Send these cart screenshots to OpenAI? This uses paid API credits. Ensure no personal or payment data is visible.'))return;const id=active.id;$('ai-run').disabled=true;$('ai-status').textContent='Extracting…';try{const d=await api('admin_ai',{id,version:active.version});if(active?.id===id){active.ai=d.ai;renderAI(d.ai)}}catch(e){if(active?.id===id){$('ai-status').textContent=e.message;$('ai-run').disabled=false}}};
 $('ai-apply').onclick=()=>{if(!suggestion||!active)return;if(!confirm('Replace current product rows with AI suggestions? Verify all prices, quantities and variants before approving.'))return;$('items').replaceChildren();suggestion.items.forEach(itemRow);refreshDraft();$('editor-status').textContent='AI suggestions loaded. Review each row, then approve.'};
 const readRows=id=>[...$(id).children].map(el=>Object.fromEntries([...el.querySelectorAll('[data-key]')].map(i=>[i.dataset.key,i.value.trim()])));
 const safeLink=(url)=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname.includes('.')&&!/^[\d.]+$/.test(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:''}catch{return ''}};
 function show(q){active=q;$('retailer').value=q.retailer||'SHEIN';$('freight').checked=q.freightAcknowledged===true;renderAI(q.ai);$('editor').hidden=false;$('ref').textContent=q.reference+' · '+(q.retailer||'SHEIN')+' · '+q.name;$('contact').replaceChildren();
 const p=document.createElement('p');p.textContent=q.whatsapp+(q.email?' · '+q.email:'');$('contact').append(p);
 if(q.whatsapp){const phone=q.whatsapp.replace(/\D/g,'');if(phone.length>=7){const a=document.createElement('a');a.href='https://wa.me/'+phone;a.textContent='Open WhatsApp conversation';a.target='_blank';a.rel='noopener noreferrer';$('contact').append(a)}}
 $('customer-notes').textContent=q.notes||'No customer notes.';
 $('evidence').replaceChildren();const link=safeLink(q.cartLink);if(link){const a=document.createElement('a');a.href=link;a.textContent='Open customer cart / product link';a.target='_blank';a.rel='noopener noreferrer';$('evidence').append(a)}
 for(const s of q.screenshots||[]){if(!['image/png','image/jpeg','image/webp'].includes(s.mime))continue;const i=document.createElement('img');i.src='data:'+s.mime+';base64,'+s.data;i.alt='Customer cart screenshot';$('evidence').append(i)}
 $('items').replaceChildren();q.items.forEach(itemRow);$('payments').replaceChildren();q.payments.forEach(paymentRow);
 $('fees').value=q.feesUsd??0;$('extra').value=q.extraGyd??0;$('fee-note').value=q.feeNote||'';$('tuesday').value=q.orderTuesday||nextTuesday();$('follow').value=q.followUp||'';$('notes').value=q.ownerNotes||'';$('weights').checked=q.weightsAcknowledged===true;
 $('stage').replaceChildren();for(const st of [q.status,...(stages[q.status]||[])]){const opt=document.createElement('option');opt.value=st;opt.textContent=st.replaceAll('_',' ');$('stage').append(opt)}
 $('totals').textContent=q.totals?'Approved overall GYD $'+fmt(q.totals.overall)+' | Down payment $'+fmt(q.totals.down)+' | Balance on arrival $'+fmt(q.totals.balance)+'\nEstimated arrival: '+q.delivery.arrivalFrom+' to '+q.delivery.arrivalTo+'\nRecorded payments: $'+fmt(q.payments.reduce((n,p)=>n+p.amount,0)):'No approved totals yet. Save as review, then approve after verification.';
 $('editor-status').textContent='';refreshDraft();refreshActions();}
 async function list(){const d=await api('admin_list');$('environment').textContent=d.preview?'PREVIEW ONLY — use fictional customer records. Storage is isolated from production.':'PRODUCTION';$('queue').replaceChildren();const stats=$('queue-stats');stats.replaceChildren();for(const [label,n] of [['New requests',d.quotes.filter(q=>q.status==='new').length],['In review',d.quotes.filter(q=>['review','needs_info'].includes(q.status)).length],['Awaiting deposit',d.quotes.filter(q=>['approved','sent'].includes(q.status)).length]]){const el=document.createElement('div');el.className='metric';const s=document.createElement('small');s.textContent=label;const v=document.createElement('strong');v.textContent=n;el.append(s,v);stats.append(el)}if(!d.quotes.length){$('queue').textContent='No requests yet.';return}
 for(const q of d.quotes){const row=document.createElement('div');row.className='queue-row';const text=document.createElement('span');text.textContent=q.reference+' · '+(q.retailer||'SHEIN')+' · '+q.name+' · '+q.status.replaceAll('_',' ')+' · '+q.itemCount+' items · '+q.screenshotCount+' screenshots'+(q.followUp?' · Follow up '+q.followUp:'');const btn=document.createElement('button');btn.type='button';btn.textContent='Review';btn.onclick=async()=>{try{show((await api('admin_get',null,q.id)).quote);$('editor').scrollIntoView({behavior:'smooth'})}catch(e){status(e.message)}};row.append(text,btn);$('queue').append(row)}}
 $('refresh').onclick=()=>list().catch(e=>status(e.message));$('add').onclick=()=>itemRow();$('add-payment').onclick=()=>paymentRow();
 function nextTuesday(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 const d=new Date(p.year+'-'+p.month+'-'+p.day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+((2-d.getUTCDay()+7)%7||7));return d.toISOString().slice(0,10);
 }
 const editable=()=>active&&['new','review','needs_info'].includes(active.status);
 function refreshDraft(){
  if(!active)return;let totals=active.totals,detail='';
  if(editable()){
   const items=readRows('items'),valid=items.length&&items.every(i=>i.price.trim()&&Number(i.price)>0&&i.qty.trim()&&Number.isInteger(Number(i.qty))&&Number(i.qty)>0);
   if(valid){
    const subtotal=items.reduce((n,i)=>n+Math.round(Number(i.price)*100)*Number(i.qty),0),fees=Math.round(Number($('fees').value||0)*100),extra=Math.round(Number($('extra').value||0)*100);
    const rate=w=>w<=10?1500:w<=25?1300:w<=55?1200:w<=99?1100:1050;
    const freight=$('retailer').value==='SHEIN'?items.reduce((n,i)=>{const w=Number(i.weight);return n+(w>3?Math.round(w*100)*rate(w)*Number(i.qty):0)},0):0;
    const overall=Math.ceil(((subtotal+fees)*360+freight+extra)/10000)*100,down=Math.ceil((subtotal+fees)*240/10000)*100;totals={overall,down,balance:overall-down};
    detail='Draft estimate · USD subtotal $'+(subtotal/100).toFixed(2)+' · Heavy-item freight GYD $'+fmt(freight/100)+'. Confirm weights and fees.';
   }else{totals=null;detail='Add USD prices and quantities to calculate the draft automatically.'}
   const dt=new Date($('tuesday').value+'T12:00:00Z');if(Number.isFinite(dt.getTime())&&dt.getUTCDay()===2){const a=$('retailer').value==='Amazon'?7:14,b=$('retailer').value==='Amazon'?14:21;const plus=n=>{const d=new Date(dt);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};detail+=' Estimated arrival: '+plus(a)+' to '+plus(b)+'.'}
  }else detail=active.delivery?'Approved snapshot · Estimated arrival: '+active.delivery.arrivalFrom+' to '+active.delivery.arrivalTo+'.':'No approved quotation.';
  for(const [id,k] of [['sum-overall','overall'],['sum-down','down'],['sum-balance','balance']])$(id).textContent=totals?'GYD $'+fmt(totals[k]):'—';
  $('draft-summary').textContent=detail;
 }
 function refreshActions(){
  const canPdf=active?.totals&&active?.delivery&&['approved','sent','deposit_paid','ordered','arrived','paid'].includes(active.status);
  $('approve').disabled=!editable();$('quote-status').textContent=active.status.replaceAll('_',' ').toUpperCase();
  const a=$('pdf');a.setAttribute('aria-disabled',String(!canPdf));
  if(canPdf){a.href=endpoint+'?action=admin_pdf&id='+encodeURIComponent(active.id);a.target='_blank';a.rel='noopener';$('pdf-help').textContent='Approved quotation ready. Download the PDF and attach it to the customer’s WhatsApp conversation.'}
  else{a.removeAttribute('href');$('pdf-help').textContent='Review the products, confirm weights and any fees, then approve to enable Generate PDF.'}
  const locked=!editable();for(const e of $('items').querySelectorAll('input,button'))e.disabled=locked;
  for(const id of ['retailer','fees','extra','fee-note','tuesday','weights','freight','add'])$(id).disabled=locked;
 }
 $('edit').addEventListener('input',refreshDraft);$('edit').addEventListener('change',refreshDraft);
 const itemObserver=new MutationObserver(refreshDraft);itemObserver.observe($('items'),{childList:true});
 async function save(approve=false){
  if(!active)return;
  if(approve&&!confirm('Approve these verified prices and lock the quotation for PDF generation?'))return;
  if(!approve&&!$('edit').reportValidity())return;
  $('save').disabled=true;$('approve').disabled=true;
  try{
   const target=approve?'approved':$('stage').value==='new'?'review':$('stage').value;
   const d=await api('admin_save',{id:active.id,version:active.version,approve,retailer:$('retailer').value,freightAcknowledged:$('freight').checked,items:readRows('items'),payments:readRows('payments').map(p=>({...p,amount:Number(p.amount)})),feesUsd:$('fees').value,extraGyd:$('extra').value,feeNote:$('fee-note').value,orderTuesday:$('tuesday').value,followUp:$('follow').value,ownerNotes:$('notes').value,weightsAcknowledged:$('weights').checked,status:target});
   show(d.quote);$('editor-status').textContent=approve?'Approved. Generate PDF is now available.':'Saved.';await list();
  }catch(err){$('editor-status').textContent=err.message}finally{$('save').disabled=false;refreshActions()}
 }
 $('edit').onsubmit=e=>{e.preventDefault();save(false)};
 $('approve').onclick=()=>save(true);
 (async()=>{try{await list();$('workspace').hidden=false;status('Owner session authenticated.')}catch(e){status(e.message+' Sign into HENRY OS on this same preview first.')}})();
})();