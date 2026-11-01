const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=v=>`GYD $${(Number(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const today=()=>new Date().toISOString().slice(0,10);
const round2=v=>Math.round((Number(v)||0)*100)/100;
const round4=v=>Math.round((Number(v)||0)*10000)/10000;
const num=v=>Number(String(v??'').replace(/,/g,''))||0;
const isMember=v=>/member/i.test(String(v||''));
const presets={
  members:{title:'Save More With AMC Members Club',text:'Lower shipping costs, waived package fees and member benefits on eligible shipments.',cta:'amcshopping.com/members'},
  course:{title:'Learn With AMC',text:'Build practical online shopping and business skills with AMC live classes and training.',cta:'amcshopping.com/course'},
  streaming:{title:'AMC Streaming Services',text:'Netflix, Prime Video, Disney+, Crunchyroll and more available through AMC.',cta:'amcshopping.com/streaming'},
  mailbox:{title:'Get Your AMC Mailbox',text:'Sign up for your AMC mailbox and start shipping your online purchases with confidence.',cta:'amcshopping.com/mailbox'},
  custom:{title:'AMC Promotion',text:'Add your own promotion message here.',cta:'amcshopping.com'}
};
const state={customers:[],selected:0,authenticated:false,savedResults:[],lastValidation:null};

function standardCharge(weight){
  const bill=Math.max(1,round4(weight));
  if(bill<=2)return {rate:0,total:2800,label:'GYD $2,800 flat 1–2 lb special',billWeight:bill};
  let rate=1500,label='GYD $1,500/lb · 1–10 lbs';
  if(bill>10&&bill<=25){rate=1300;label='GYD $1,300/lb · 11–25 lbs'}
  else if(bill>25&&bill<=55){rate=1200;label='GYD $1,200/lb · 26–55 lbs'}
  else if(bill>55&&bill<100){rate=1100;label='GYD $1,100/lb · 56–99 lbs'}
  else if(bill>=100){rate=1050;label='GYD $1,050/lb · 100+ lbs'}
  return {rate,total:round2(bill*rate),label,billWeight:bill};
}
function calcCustomer(c){
  const weight=round4((c.packages||[]).reduce((s,p)=>s+num(p.weightLb),0));
  const adjustment=round2(num(c.adjustment));
  const standard=standardCharge(weight);
  if(isMember(c.customerType)){
    const billWeight=Math.max(1,weight),shipping=round2(billWeight*950),total=round2(shipping+adjustment),regular=round2(standard.total+adjustment);
    return {weight,billWeight,shipping,adjustment,total,member:true,rateLabel:'GYD $950/lb · Members Club',regular,savings:round2(regular-total)};
  }
  return {weight,billWeight:standard.billWeight,shipping:standard.total,adjustment,total:round2(standard.total+adjustment),member:false,rateLabel:standard.label,regular:round2(standard.total+adjustment),savings:0};
}
function weightToLb(value){
  if(typeof value==='number')return round4(value);
  const s=String(value??'').trim().toLowerCase();if(!s)return 0;
  const lb=(s.match(/([\d.]+)\s*(?:lb|lbs|pound|pounds)/)||[])[1];
  const oz=(s.match(/([\d.]+)\s*(?:oz|ounce|ounces)/)||[])[1];
  if(lb||oz)return round4((Number(lb)||0)+(Number(oz)||0)/16);
  const kg=(s.match(/([\d.]+)\s*(?:kg|kilogram|kilograms)/)||[])[1];if(kg)return round4(Number(kg)*2.2046226218);
  const g=(s.match(/([\d.]+)\s*(?:g|gram|grams)\b/)||[])[1];if(g)return round4(Number(g)/453.59237);
  const n=Number(s.replace(/,/g,''));return Number.isFinite(n)?round4(n):0;
}
function normalizePackage(p={}){
  const sourceWeight=p.sourceWeight??p.source_weight??p.originalWeight??p.original_weight??p.weightLabel??p.weight_label??p.weight??'';
  const direct=p.weightLb??p.weight_lb??p.weightLbs??p.weight_lbs??p.pounds??p.lbs;
  const weightLb=direct!==undefined&&direct!==null&&direct!==''?weightToLb(direct):weightToLb(sourceWeight);
  return {tracking:String(p.tracking??p.trackingNumber??p.tracking_number??p.trackingNo??p.tracking_no??'').trim(),carrier:String(p.carrier??p.shippingCarrier??p.source??'').trim(),sourceWeight:String(sourceWeight??'').trim(),weightLb,ref:String(p.ref??p.reference??p.sourceRef??p.source_ref??'').trim(),status:String(p.status??'ready').trim()||'ready'};
}
function normalizeCustomer(c={}){
  const rawPackages=c.packages??c.items??c.shipments??[];
  const type=c.customerType??c.customer_type??c.type??(c.member?'member':'regular');
  return {localId:crypto.randomUUID?crypto.randomUUID():String(Math.random()),name:String(c.name??c.customer??c.customerName??c.customer_name??'').trim(),whatsapp:String(c.whatsapp??c.phone??c.mobile??'').trim(),mailboxCode:String(c.mailboxCode??c.mailbox_code??c.mailbox??c.customerCode??c.customer_code??'').trim(),customerType:isMember(type)?'member':'regular',adjustment:round2(num(c.adjustment??c.additionalCharge??c.additional_charge??0)),notes:String(c.notes??c.note??'').trim(),packages:Array.isArray(rawPackages)?rawPackages.map(normalizePackage):[]};
}
function groupFlat(rows){
  const map=new Map();
  for(const row of rows){
    const name=String(row.customer??row.customerName??row.customer_name??row.name??'').trim();
    const mailbox=String(row.mailboxCode??row.mailbox_code??row.mailbox??row.customerCode??row.customer_code??'').trim();
    const key=(mailbox||name||`row-${map.size}`).toLowerCase();
    if(!map.has(key))map.set(key,normalizeCustomer({name,whatsapp:row.whatsapp??row.phone,mailboxCode:mailbox,customerType:row.customerType??row.customer_type??row.type??(row.member?'member':'regular'),notes:row.customerNotes??row.customer_notes,packages:[]}));
    map.get(key).packages.push(normalizePackage(row));
  }
  return [...map.values()];
}
function normalizePayload(payload){
  if(Array.isArray(payload)){
    if(payload.some(x=>Array.isArray(x?.packages)||Array.isArray(x?.items)))return payload.map(normalizeCustomer);
    return groupFlat(payload);
  }
  if(!payload||typeof payload!=='object')throw new Error('The pasted data must be JSON.');
  if(Array.isArray(payload.customers))return payload.customers.map(normalizeCustomer);
  if(Array.isArray(payload.records))return groupFlat(payload.records);
  if(Array.isArray(payload.packages))return groupFlat(payload.packages);
  if(payload.customer||payload.name)return [normalizeCustomer(payload)];
  throw new Error('I could not find a customers, records or packages array in this block.');
}
function extractJson(text){
  let s=String(text||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(s)}catch{}
  const a=s.indexOf('{'),b=s.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));
  const x=s.indexOf('['),y=s.lastIndexOf(']');if(x>=0&&y>x)return JSON.parse(s.slice(x,y+1));
  throw new Error('The pasted block is not valid JSON.');
}
function examplePayload(){
  return {version:'AMC_INVOICE_FACTORY_V1',batchId:`shipment-${today()}-a`,invoiceDate:today(),customers:[{name:'Sample Regular Customer',whatsapp:'+592 600 0000',mailboxCode:'AMC999',customerType:'regular',packages:[{tracking:'TRACKING-SAMPLE-001',carrier:'GOFO',sourceWeight:'14.4 oz',weightLb:0.9,ref:'GFUS'}]},{name:'Sample Member',whatsapp:'+592 600 0001',mailboxCode:'AMC203',customerType:'member',packages:[{tracking:'MEMBER-SAMPLE-001',carrier:'SwiftX',sourceWeight:'3.25 lb',weightLb:3.25,ref:'SWX'},{tracking:'MEMBER-SAMPLE-002',carrier:'GOFO',sourceWeight:'8 oz',weightLb:0.5,ref:'GFUS'}]}]};
}
function validateBatch(){
  const errors=[],warnings=[],seen=new Set();let packages=0,totalWeight=0,totalDue=0;
  state.customers.forEach((c,ci)=>{
    if(!c.name.trim())errors.push(`Customer ${ci+1} has no name.`);
    if(!c.packages.length)errors.push(`${c.name||`Customer ${ci+1}`} has no packages.`);
    c.packages.forEach((p,pi)=>{packages++;totalWeight+=num(p.weightLb);const t=p.tracking.trim().toUpperCase();if(!t)errors.push(`${c.name||`Customer ${ci+1}`} package ${pi+1} has no tracking number.`);else if(seen.has(t))errors.push(`Duplicate tracking number in this batch: ${t}`);else seen.add(t);if(num(p.weightLb)<=0)errors.push(`${t||`Package ${pi+1}`} has an invalid weight.`);if(!p.carrier)warnings.push(`${t||`Package ${pi+1}`} has no carrier/source.`)});
    totalDue+=calcCustomer(c).total;
    if(c.adjustment&&!c.notes)warnings.push(`${c.name} has a manual adjustment but no internal note explaining it.`);
  });
  const result={errors,warnings,customers:state.customers.length,packages,totalWeight:round4(totalWeight),totalDue:round2(totalDue)};state.lastValidation=result;return result;
}
function renderValidation(){
  if(!state.customers.length){$('validationSummary').innerHTML='';return}
  const v=validateBatch();
  $('validationSummary').innerHTML=`<div class="validationBox ${v.errors.length?'bad':'good'}"><small>VALIDATION</small><strong>${v.errors.length?v.errors.length+' error'+(v.errors.length===1?'':'s'):'Ready'}</strong></div><div class="validationBox"><small>CUSTOMERS</small><strong>${v.customers}</strong></div><div class="validationBox"><small>PACKAGES / WEIGHT</small><strong>${v.packages} · ${v.totalWeight.toFixed(4)} lb</strong></div><div class="validationBox"><small>BATCH TOTAL</small><strong>${money(v.totalDue)}</strong></div>${v.errors.length?`<div class="validationBox bad validationWide"><small>FIX BEFORE SAVING</small><strong>${v.errors.map(esc).join('<br>')}</strong></div>`:''}${v.warnings.length?`<div class="validationBox validationWide"><small>CHECK</small><strong>${v.warnings.map(esc).join('<br>')}</strong></div>`:''}`;
  $('commitBtn').disabled=Boolean(v.errors.length)||!state.authenticated;
}
function renderCustomerList(){
  const list=$('customerList');list.innerHTML=state.customers.map((c,i)=>{const calc=calcCustomer(c);return `<button class="customerButton ${i===state.selected?'active':''}" data-customer-index="${i}" type="button"><span class="miniTotal">${money(calc.total)}</span><strong>${esc(c.name||`Customer ${i+1}`)}</strong><small>${esc(c.mailboxCode||'No mailbox')} · ${isMember(c.customerType)?'Member':'Regular'} · ${c.packages.length} pkg</small></button>`}).join('');
  const totalPackages=state.customers.reduce((s,c)=>s+c.packages.length,0);$('batchSummary').textContent=`${state.customers.length} customer${state.customers.length===1?'':'s'} · ${totalPackages} package${totalPackages===1?'':'s'}`;
}
function loadEditor(){
  const c=state.customers[state.selected];if(!c)return;
  $('editTitle').textContent=c.name||`Customer ${state.selected+1}`;$('customerName').value=c.name;$('customerWhatsapp').value=c.whatsapp;$('customerMailbox').value=c.mailboxCode;$('customerType').value=c.customerType;$('customerAdjustment').value=c.adjustment||0;$('customerNotes').value=c.notes||'';
  $('packageEditor').innerHTML=c.packages.map((p,i)=>`<div class="packageRow" data-package-row="${i}"><label>Tracking<input data-package-field="tracking" value="${esc(p.tracking)}"></label><label>Carrier<input data-package-field="carrier" value="${esc(p.carrier)}"></label><label>Source weight<input data-package-field="sourceWeight" value="${esc(p.sourceWeight)}"></label><label>Weight lb<input data-package-field="weightLb" type="number" min="0" step="0.0001" value="${round4(p.weightLb)}"></label><label>Ref<input data-package-field="ref" value="${esc(p.ref)}"></label><button class="removePackage" data-remove-package="${i}" type="button" aria-label="Remove package">×</button></div>`).join('');
}
function syncCustomerFields(){
  const c=state.customers[state.selected];if(!c)return;
  c.name=$('customerName').value.trim();c.whatsapp=$('customerWhatsapp').value.trim();c.mailboxCode=$('customerMailbox').value.trim();c.customerType=$('customerType').value;c.adjustment=round2(num($('customerAdjustment').value));c.notes=$('customerNotes').value.trim();
  renderCustomerList();renderValidation();renderPreview();
}
function selectCustomer(i){if(i<0||i>=state.customers.length)return;state.selected=i;renderCustomerList();loadEditor();renderValidation();renderPreview()}
function promoData(){return {title:$('promoTitle').value||'AMC Promotion',text:$('promoText').value||'',cta:$('promoCta').value||'amcshopping.com'}}
function applyPreset(){const p=presets[$('promoPreset').value]||presets.custom;$('promoTitle').value=p.title;$('promoText').value=p.text;$('promoCta').value=p.cta;renderPreview()}
function savePromo(){const d={preset:$('promoPreset').value,...promoData()};localStorage.setItem('amcInvoicePromo',JSON.stringify(d));const b=$('savePromoBtn'),old=b.textContent;b.textContent='Saved';setTimeout(()=>b.textContent=old,1000);renderPreview()}
function loadPromo(){try{const d=JSON.parse(localStorage.getItem('amcInvoicePromo')||'null');if(d){$('promoPreset').value=d.preset||'custom';$('promoTitle').value=d.title||'';$('promoText').value=d.text||'';$('promoCta').value=d.cta||'';return}}catch{}$('promoPreset').value='members';applyPreset()}
function invoiceNoFor(index){return state.savedResults[index]?.invoiceNo||'PENDING'}
function packageRows(packages,start=0){return packages.map((p,i)=>`<div class="tr"><div>${start+i+1}</div><div>${esc(p.tracking)}</div><div>${esc(p.sourceWeight||`${round4(p.weightLb).toFixed(4)} lb`)}</div><div>${round4(p.weightLb).toFixed(4)}</div><div>${esc(p.ref||p.carrier||'—')}</div></div>`).join('')}
function headerHtml(title,invoiceNo,date,type){return `<header class="header"><div class="brand"><div class="logo" aria-label="AMC Online Shopping logo"></div><div><h2>A.M.C SHOPPING</h2><h3>${esc(title)}</h3><p>Your Package. Our Priority. Always.</p></div></div><div class="meta"><div><span>Invoice #</span><b>${esc(invoiceNo)}</b></div><div><span>Date</span><b>${esc(date)}</b></div><div><span>Type</span><b>${esc(type)}</b></div></div></header>`}
function promoSlotHtml(){const p=promoData();return `<div class="promoSlot"><div><h4>${esc(p.title)}</h4><p>${esc(p.text)}</p></div><div class="promoCta">${esc(p.cta)}</div></div>`}
function continuationPage(c,invoiceNo,date,chunk,start){return `<section class="page"><div class="sheet">${headerHtml('Package Continuation',invoiceNo,date,isMember(c.customerType)?'AMC Members Club':'Normal AMC')}<div class="content"><div class="note"><b>${esc(c.name)}</b> · continuation of package list for ${esc(invoiceNo)}.</div><div class="table invoiceDataTable"><div class="tr head"><div>#</div><div>FULL TRACKING NUMBER</div><div>SOURCE WT.</div><div>WEIGHT (LB)</div><div>REF</div></div>${packageRows(chunk,start)}</div></div><div class="footer">© 2026 amcshopping. All rights reserved. | Shipping Invoice Continuation</div></div></section>`}
function normalPromoPage(c,calc){const p=promoData();const memberEstimate=round2(Math.max(1,calc.weight)*950+calc.adjustment),saving=Math.max(0,round2(calc.total-memberEstimate));return `<section class="page promoPage"><div class="sheet"><header class="header"><div class="brand"><div class="logo"></div><div><h2>SAVE MORE WITH AMC</h2><p>Every normal invoice includes an AMC promotion.</p></div></div></header><div class="content"><div class="promoHero"><span class="badge">AMC PROMOTION</span><h2>${esc(p.title)}</h2><p>${esc(p.text)}</p></div><div class="promoStats"><div class="card"><h4>NORMAL TOTAL</h4><strong>${money(calc.total)}</strong><small>Current shipment total</small></div><div class="card"><h4>MEMBER RATE ESTIMATE</h4><strong>${money(memberEstimate)}</strong><small>Shipping-rate comparison only</small></div><div class="card"><h4>POTENTIAL RATE DIFFERENCE</h4><strong class="green">${money(saving)}</strong><small>Before membership plan conditions</small></div></div><div class="plans"><div class="plan"><h5>Starter</h5><b>20 lbs</b><small>Unlimited packages · fees waived</small></div><div class="plan"><h5>Small Business</h5><b>50 lbs</b><small>Priority processing</small></div><div class="plan"><h5>Business Pro</h5><b>100 lbs</b><small>Higher-volume customers</small></div><div class="plan"><h5>Enterprise</h5><b>300 lbs</b><small>Highest-volume tier</small></div></div></div>${promoSlotHtml()}<div class="footer">© 2026 amcshopping. All rights reserved. | AMC Promotion</div></div></section>`}
function memberSummaryPage(c,calc,invoiceNo,date){return `<section class="page memberPage2"><div class="sheet">${headerHtml('Members Club Payment Summary',invoiceNo,date,'AMC Members Club')}<div class="content"><div class="memberSummary"><div class="card"><h4>MEMBER TOTAL</h4><strong>${money(calc.total)}</strong><small>${calc.weight.toFixed(4)} lb combined shipment</small></div><div class="card"><h4>REGULAR CUSTOMER EQUIVALENT</h4><strong>${money(calc.regular)}</strong><small>Using current standard shipping tier</small></div><div class="card"><h4>MEMBER SAVINGS</h4><strong class="green">${money(calc.savings)}</strong><small>Shipping-rate difference</small></div></div><div class="two"><div class="panel"><h4>HOW TO PAY</h4><div class="inside"><div class="row"><span>MMG Merchant</span><b>AMCSHOPPING / m742288</b></div><div class="row"><span>Name</span><b>Adam Henry</b></div><div class="row"><span>Number</span><b>+592-604-2826</b></div></div></div><div class="panel"><h4>MEMBERS CLUB BENEFITS</h4><div class="inside"><p>• Unlimited packages</p><p>• Package fees waived</p><p>• Priority processing / faster clearance</p><div class="grand"><span>TOTAL DUE</span><span>${money(calc.total)}</span></div></div></div></div></div>${promoSlotHtml()}<div class="footer">© 2026 amcshopping. All rights reserved. | Members Club Shipping Invoice</div></div></section>`}
function invoicePages(c,index){
  const calc=calcCustomer(c),invoiceNo=invoiceNoFor(index),date=$('invoiceDate').value||today(),member=calc.member,first=c.packages.slice(0,7),rest=c.packages.slice(7);let pages='';
  pages+=`<section class="page"><div class="sheet">${headerHtml(member?'Members Club Shipping Invoice':'Shipping Invoice',invoiceNo,date,member?'AMC Members Club':'Normal AMC')}<div class="content"><div class="summary"><div class="card"><h4>CUSTOMER</h4><div class="row"><span>Name</span><b>${esc(c.name||'—')}</b></div><div class="row"><span>Mailbox</span><b>${esc(c.mailboxCode||'—')}</b></div><div class="row"><span>Customer Type</span><b>${member?'AMC Member':'Regular'}</b></div></div><div class="card"><h4>${member?'MEMBERS CLUB SUMMARY':'SHIPMENT SUMMARY'}</h4><div class="row"><span>Packages</span><b>${c.packages.length}</b></div><div class="row"><span>Combined Weight</span><b>${calc.weight.toFixed(4)} lb</b></div><div class="row"><span>Billing</span><b>${esc(calc.rateLabel)}</b></div><div class="row"><span>Package Fee</span><b>${member?'WAIVED':'GYD $0'}</b></div></div><div class="card total"><h4>TOTAL DUE</h4><strong>${money(calc.total)}</strong><small>${member?'Members Club pricing applied':'Current AMC standard pricing'}</small></div></div><div class="table invoiceDataTable"><div class="tr head"><div>#</div><div>FULL TRACKING NUMBER</div><div>SOURCE WT.</div><div>WEIGHT (LB)</div><div>REF</div></div>${packageRows(first)}</div><div class="note"><b>BILLING NOTE:</b> Combined shipment weight ${calc.weight.toFixed(4)} lb · ${esc(calc.rateLabel)}.${calc.adjustment?` Manual adjustment: ${money(calc.adjustment)}.`:''}</div>${member?'':`<div class="two"><div class="panel"><h4>HOW TO PAY</h4><div class="inside"><div class="row"><span>MMG Merchant</span><b>AMCSHOPPING / m742288</b></div><div class="row"><span>Name</span><b>Adam Henry</b></div><div class="row"><span>Number</span><b>+592-604-2826</b></div><div class="tiny">Send payment confirmation after payment.</div></div></div><div class="panel"><h4>CALCULATION CHECK</h4><div class="inside"><div class="row"><span>Combined Weight</span><b>${calc.weight.toFixed(4)} lb</b></div><div class="row"><span>Shipping Charge</span><b>${money(calc.shipping)}</b></div><div class="row"><span>Adjustment</span><b>${money(calc.adjustment)}</b></div><div class="grand"><span>GRAND TOTAL DUE</span><span>${money(calc.total)}</span></div></div></div></div><div class="tiny">Storage: GYD $500/day after 7 days. Payment must be cleared before release.</div>`}</div><div class="footer">© 2026 amcshopping. All rights reserved. | ${member?'Members Club Shipping Invoice':'Shipping Invoice'}</div></div></section>`;
  let offset=7;for(let i=0;i<rest.length;i+=14){const chunk=rest.slice(i,i+14);pages+=continuationPage(c,invoiceNo,date,chunk,offset);offset+=chunk.length}
  pages+=member?memberSummaryPage(c,calc,invoiceNo,date):normalPromoPage(c,calc);return pages;
}
function renderPreview(){if(!state.customers.length){$('invoicePreview').innerHTML='<div class="previewEmpty">Import a batch to preview invoices.</div>';return}const i=Math.min(state.selected,state.customers.length-1);$('previewCount').textContent=`${i+1} / ${state.customers.length}`;$('invoicePreview').innerHTML=invoicePages(state.customers[i],i)}
function renderAll(){renderCustomerList();loadEditor();renderValidation();renderPreview()}
async function checkSession(){const el=$('sessionState');try{const r=await fetch('/.netlify/functions/henry-auth?action=session',{credentials:'same-origin',cache:'no-store'}),d=await r.json();state.authenticated=Boolean(d.authenticated);if(state.authenticated){el.classList.add('online');el.classList.remove('offline');el.innerHTML='<span></span>HENRY OS connected'}else{el.classList.add('offline');el.innerHTML='<span></span>Sign in to HENRY OS before saving'}}catch{state.authenticated=false;el.classList.add('offline');el.innerHTML='<span></span>HENRY OS unavailable'}renderValidation()}
function importBatch(){
  try{const payload=extractJson($('importBox').value),customers=normalizePayload(payload);if(!customers.length)throw new Error('No customers were found.');state.customers=customers;state.selected=0;state.savedResults=[];if(payload&&typeof payload==='object'&&!Array.isArray(payload)){if(payload.batchId)$('batchId').value=String(payload.batchId);if(payload.invoiceDate)$('invoiceDate').value=String(payload.invoiceDate).slice(0,10)}if(!$('batchId').value)$('batchId').value=`shipment-${$('invoiceDate').value||today()}-a`;$('reviewArea').classList.remove('hidden');$('importStatus').className='statusLine good';$('importStatus').textContent=`Imported ${customers.length} customer${customers.length===1?'':'s'}. Review the data below before saving.`;renderAll();$('reviewArea').scrollIntoView({behavior:'smooth',block:'start'})}catch(e){$('importStatus').className='statusLine bad';$('importStatus').textContent=e.message}}
async function commitBatch(){
  const v=validateBatch();renderValidation();if(v.errors.length){$('commitStatus').className='statusLine bad';$('commitStatus').textContent='Fix the validation errors before saving.';return}if(!state.authenticated){$('commitStatus').className='statusLine bad';$('commitStatus').innerHTML='Your HENRY OS session is not active. <a href="/admin/">Sign in first</a>, then return here.';return}
  const btn=$('commitBtn');btn.disabled=true;const old=btn.textContent;btn.textContent='Saving batch…';$('commitStatus').className='statusLine';$('commitStatus').textContent='Validating duplicate tracking numbers and allocating invoice numbers on the server…';
  try{const body={batchId:$('batchId').value.trim(),invoiceDate:$('invoiceDate').value||today(),customers:state.customers};const r=await fetch('/.netlify/functions/henry-invoice-batch',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let data={};try{data=await r.json()}catch{}if(r.status===401){state.authenticated=false;throw new Error('Your HENRY OS session expired. Sign in again before saving.')}if(!r.ok)throw new Error(data.error||'Could not save the invoice batch.');state.savedResults=Array.isArray(data.results)?data.results:[];renderPreview();renderCustomerList();const rows=state.savedResults.map(x=>`<div class="savedInvoice"><span>${esc(x.invoiceNo)} · ${esc(x.customer)}</span><b>${money(x.amount)}</b></div>`).join('');$('commitStatus').className='statusLine good';$('commitStatus').innerHTML=`<div class="savedBanner"><strong>${data.reused?'Batch already existed — no duplicates created.':'Batch saved successfully to HENRY OS.'}</strong>${rows}<div class="savedLink"><a href="/admin/">Open HENRY OS dashboard →</a></div></div>`}catch(e){$('commitStatus').className='statusLine bad';$('commitStatus').textContent=e.message}finally{btn.textContent=old;renderValidation()}}
function preparePrint(all){if(!state.customers.length)return;const html=all?state.customers.map((c,i)=>invoicePages(c,i)).join(''):invoicePages(state.customers[state.selected],state.selected);$('printArea').innerHTML=html;setTimeout(()=>window.print(),80)}
function bind(){
  $('invoiceDate').value=today();
  $('exampleBtn').addEventListener('click',()=>{const e=examplePayload();$('importBox').value=JSON.stringify(e,null,2);$('batchId').value=e.batchId;$('invoiceDate').value=e.invoiceDate;$('importStatus').textContent='Example loaded. Replace it with your real shipment block when ready.'});
  $('importBtn').addEventListener('click',importBatch);$('clearBtn').addEventListener('click',()=>{$('importBox').value='';$('importStatus').textContent=''});
  $('customerList').addEventListener('click',e=>{const b=e.target.closest('[data-customer-index]');if(b)selectCustomer(Number(b.dataset.customerIndex))});
  for(const id of ['customerName','customerWhatsapp','customerMailbox','customerType','customerAdjustment','customerNotes'])$(id).addEventListener('input',syncCustomerFields);
  $('packageEditor').addEventListener('input',e=>{const row=e.target.closest('[data-package-row]');if(!row||!e.target.dataset.packageField)return;const c=state.customers[state.selected],p=c.packages[Number(row.dataset.packageRow)],field=e.target.dataset.packageField;if(field==='weightLb')p[field]=round4(num(e.target.value));else p[field]=e.target.value;renderCustomerList();renderValidation();renderPreview()});
  $('packageEditor').addEventListener('click',e=>{const b=e.target.closest('[data-remove-package]');if(!b)return;const c=state.customers[state.selected];c.packages.splice(Number(b.dataset.removePackage),1);loadEditor();renderCustomerList();renderValidation();renderPreview()});
  $('addPackageBtn').addEventListener('click',()=>{state.customers[state.selected].packages.push(normalizePackage({status:'ready'}));loadEditor();renderCustomerList();renderValidation();renderPreview()});
  $('addCustomerBtn').addEventListener('click',()=>{state.customers.push(normalizeCustomer({name:'New Customer',customerType:'regular',packages:[{}]}));selectCustomer(state.customers.length-1)});
  $('removeCustomerBtn').addEventListener('click',()=>{if(!state.customers.length)return;if(state.customers.length===1){state.customers=[];$('reviewArea').classList.add('hidden');$('invoicePreview').innerHTML='';return}state.customers.splice(state.selected,1);state.selected=Math.max(0,state.selected-1);renderAll()});
  $('validateBtn').addEventListener('click',()=>{renderValidation();$('validationSummary').scrollIntoView({behavior:'smooth',block:'center'})});
  $('prevCustomerBtn').addEventListener('click',()=>selectCustomer((state.selected-1+state.customers.length)%state.customers.length));$('nextCustomerBtn').addEventListener('click',()=>selectCustomer((state.selected+1)%state.customers.length));
  $('promoPreset').addEventListener('change',applyPreset);for(const id of ['promoTitle','promoText','promoCta'])$(id).addEventListener('input',renderPreview);$('savePromoBtn').addEventListener('click',savePromo);
  $('commitBtn').addEventListener('click',commitBatch);$('printSelectedBtn').addEventListener('click',()=>preparePrint(false));$('printAllBtn').addEventListener('click',()=>preparePrint(true));
  loadPromo();checkSession();
}
document.addEventListener('DOMContentLoaded',bind);
