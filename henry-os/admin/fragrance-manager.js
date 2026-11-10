// HENRY OS — private fragrance product workspace.
// The PUBLIC AMC fragrance page is intentionally NOT connected to this manager.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const fmt=v=>v===null||v===''||v===undefined?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
const usd=v=>v===null||v===''||v===undefined?'—':'US$'+Number(v).toFixed(2);
const gyd=v===null||v===''||v===undefined?'Not priced':'GYD $'+fmt(v);
const state={products:[],source:null,counts:null,filter:{text:'',collection:'all',status:'all',review:'all'},page:0,pageSize:20,selected:null,saving:false,loadId:0,previewId:0,previewTimer:null};
const numberFields=['exchangeRate','supplierShippingGyd','forwarderFreightGyd','importFeesGyd','insuranceGyd','packagingGyd','otherDirectGyd','verifiedLandedGyd','retailGyd','upfrontCommitmentGyd','stockOnHand','stockReserved','stockIncoming','reorderLevel'];
const boolFields=['costVerified','chargesConfirmed','supplierTierVerified','wholesaleEligible','supplierAvailabilityConfirmed','forwarderConfirmed','authenticitySourceConfirmed'];
const textFields=['name','brand','collection','size','concentration','gender','description','forwarderNotes','internalNotes','reviewResolution','supplierTier','landedMode','listingStatus'];
function flash(text,error=false){const n=$('global-status');n.textContent=text;n.className=error?'error':'';}
async function api(action,options={}){
 const url=new URL('/.netlify/functions/henry-fragrance',location.origin);
 url.searchParams.set('action',action);
 if(options.sku)url.searchParams.set('sku',options.sku);
 const init={credentials:'same-origin',cache:'no-store'};
 if(options.body){init.method='POST';init.headers={'Content-Type':'application/json'};init.body=JSON.stringify(options.body)}
 const res=await fetch(url,init);
 let payload;try{payload=await res.json()}catch{payload={}}
 if(res.status===401){$('workspace').classList.add('hidden');$('loading').classList.add('hidden');$('login').classList.remove('hidden');throw Error('Owner session expired. Open HENRY OS to sign in.')}
 if(!res.ok)throw Error(payload.error||'Unable to complete product request');
 return payload;
}
function filtered(){
 const f=state.filter,q=f.text.toLowerCase().trim();
 return state.products.filter(p=>{
  if(f.collection!=='all'&&p.collection!==f.collection)return false;
  if(f.status!=='all'&&p.listingStatus!==f.status)return false;
  if(f.review==='needs_source_review'&&!p.sourceReviewNotes&&!p.flags.some(x=>x.includes('Supplier PDF')))return false;
  if(f.review==='needs_photo'&&p.photoApproved)return false;
  if(f.review==='no_cost'&&p.pricing.landedGyd!==null)return false;
  if(f.review==='wholesale_ready'&&!p.pricing.wholesaleReady)return false;
  if(f.review==='edited'&&p.version<1)return false;
  return !q||[p.name,p.brand,p.sku,p.collection].some(x=>String(x||'').toLowerCase().includes(q));
 });
}
function renderStats(){
 const c=state.counts;
 if(!c)return;
 const metrics=[
  ['Supplier SKUs',c.total,'Private Onarys seed'],
  ['Edited records',c.edited,'Saved in HENRY OS'],
  ['Verified landed costs',c.withVerifiedCost,'No estimated costs assumed'],
  ['Wholesale ready',c.wholesaleReady,'3+ eligible products'],
  ['Approved photos',c.withApprovedPhoto,'Watermark-free approval required'],
  ['Published products',0,'Public catalogue held']
 ];
 $('stats').innerHTML=metrics.map(([name,n,note])=>'<article class="stat"><small>'+esc(name)+'</small><strong>'+fmt(n)+'</strong><span>'+esc(note)+'</span></article>').join('');
 $('catalog-subtitle').textContent=c.total+' Onarys supplier SKUs · '+c.flaggedSource+' supplier records need review · All private';
}
function renderList(){
 const result=filtered();
 const pages=Math.max(1,Math.ceil(result.length/state.pageSize));
 state.page=Math.min(Math.max(0,state.page),pages-1);
 const subset=result.slice(state.page*state.pageSize,(state.page+1)*state.pageSize);
 $('result-count').textContent=result.length+' matching fragrance'+(result.length===1?'':'s');
 $('page-index').textContent=(state.page+1)+' / '+pages;
 $('previous').disabled=state.page<=0;
 $('next').disabled=state.page>=pages-1;
 $('catalog-list').innerHTML=subset.map(p=>{
  const review=!!p.sourceReviewNotes&&!p.reviewResolution;
  const inStock=p.pricing.available>0&&p.listingStatus==='in_stock';
  const statuses=[
   p.version?'Edited':'Draft',
   p.photoApproved?'Photo approved':'No approved photo',
   p.pricing.landedGyd!==null?'Cost verified':'Cost needed'
  ];
  return '<button type="button" class="catalog-item '+(state.selected?.sku===p.sku?'active':'')+'" data-sku="'+esc(p.sku)+'">'+
    '<span class="product-placeholder '+(p.photoApproved?'ready':'')+'">'+(p.photoApproved?'✓':'◇')+'</span>'+
    '<span class="item-details"><strong>'+esc(p.name)+'</strong><small>'+
    esc(p.brand)+' · '+esc(p.sku)+' · '+esc(p.collection)+
    '</small><span class="item-flags">'+statuses.map(s=>'<span>'+esc(s)+'</span>').join('')+
    (review?'<span class="flag-warn">Name review</span>':'')+
    (inStock?'<span>Available '+p.pricing.available+'</span>':'')+'</span></span><span class="item-arrow">›</span></button>';
 }).join('')||'<div class="empty">No fragrances match these filters.</div>';
 $('catalog-list').querySelectorAll('[data-sku]').forEach(button=>
  button.addEventListener('click',()=>{void selectProduct(button.dataset.sku)}));
}
function formValue(name){const input=$('product-form').elements.namedItem(name);return input?input.type==='checkbox'?input.checked:input.value:''}
function formFields(){
 const fields={};
 for(const key of textFields)fields[key]=formValue(key);
 for(const key of numberFields)fields[key]=formValue(key);
 for(const key of boolFields)fields[key]=formValue(key);
 return fields;
}
function applyProduct(p){
 const f=$('product-form');
 for(const key of textFields){
  const input=f.elements.namedItem(key);if(input)input.value=String(p[key]??'');
 }
 for(const key of numberFields){
  const input=f.elements.namedItem(key);if(input)input.value=p[key]===null||p[key]===undefined?'':String(p[key]);
 }
 for(const key of boolFields){
  const input=f.elements.namedItem(key);if(input)input.checked=p[key]===true;
 }
 $('edit-sku').textContent='SUPPLIER SKU · '+p.sku+' · PDF PAGE '+(p.pdfPage||'—');
 $('edit-title').textContent=p.name;
 $('edit-subtitle').textContent=p.brand+' · '+p.collection+' · '+(p.size||'Size not listed');
 $('edit-private').textContent=p.version?'Edited privately':'Private draft';
 $('supplier-base').textContent=usd(p.supplierUsd);
 const st=p.supplierTiers||{};
 $('supplier-tiers').textContent='Onarys order tiers: $350+ '+usd(st.usd350)+' · $500+ '+usd(st.usd500)+' · $1,000+ '+usd(st.usd1000)+' · $1,500+ '+usd(st.usd1500);
 $('source-review').classList.toggle('hidden',!p.sourceReviewNotes);
 $('source-review').textContent=p.sourceReviewNotes?'Supplier catalogue review: '+p.sourceReviewNotes:'';
 $('photo-file').value='';
 $('photo-rights').checked=false;$('photo-no-watermark').checked=false;
 $('photo-holder').innerHTML='<span>IMAGE ON HOLD<br><small>No supplier photo is auto-published</small></span>';
 $('remove-photo').disabled=!p.photoApproved;
 toggleCostMode();
 renderPrice(p.pricing,p.flags);
 $('save-status').textContent='Owner-only · Version '+p.version+' · Not published';
 $('editor-empty').classList.add('hidden');$('editor-content').classList.remove('hidden');
 $('editor').scrollTop=0;
}
async function selectProduct(sku){
 const serial=++state.loadId;
 try{
  const result=await api('product',{sku});
  if(serial!==state.loadId)return;
  state.selected=result.product;
  applyProduct(result.product);renderList();
  if(result.product.photoApproved)await loadPhoto(sku,serial);
 }catch(e){flash(e.message,true)}
}
async function loadPhoto(sku,serial){
 try{
  const result=await api('photo',{sku});
  if(serial!==state.loadId||state.selected?.sku!==sku)return;
  const img=document.createElement('img');img.src=result.dataUrl;
  img.alt='Approved owner-uploaded image of '+state.selected.name;
  $('photo-holder').replaceChildren(img);
 }catch(e){if(serial===state.loadId)flash('Could not load private image: '+e.message,true)}
}
function toggleCostMode(){
 const mode=formValue('landedMode');
 $('verified-cost-section').classList.toggle('hidden',mode==='components');
 $('components-section').classList.toggle('hidden',mode!=='components');
}
function percentage(v){return v===null||v===undefined?'—':(v*100).toFixed(1)+'%'}
function renderPrice(p,flags=[]){
 const b=$('price-preview');
 if(!p||!p.landedGyd){b.innerHTML='<p><strong>Landed cost required.</strong> Verify your actual forwarder-inclusive cost before setting AMC selling prices.</p>'+
  (p?.componentEstimateGyd?'<p>Verified component total (GYD): '+fmt(p.componentEstimateGyd)+'</p>':'');return;}
 const tiers=[['Retail',p.retailGyd,p.retailMargin,p.retailGrossProfit],
  ['3–5 bottles',p.wholesale?.three?.price,p.wholesale?.three?.margin,p.wholesale?.three?.grossProfit],
  ['6–11 bottles',p.wholesale?.six?.price,p.wholesale?.six?.margin,p.wholesale?.six?.grossProfit],
  ['12+ bottles',p.wholesale?.twelve?.price,p.wholesale?.twelve?.margin,p.wholesale?.twelve?.grossProfit]];
 b.innerHTML='<div class="price-grid">'+tiers.map(([label,price,margin,profit])=>
  '<div class="price-cell"><small>'+esc(label)+'</small><strong>'+gyd(price)+'</strong><span>'+percentage(margin)+' margin'+
  (profit!==null&&profit!==undefined?' · GYD '+fmt(profit)+' gross profit':'')+'</span></div>').join('')+'</div>'+
  '<p class="price-notes">Verified landed cost: GYD '+fmt(p.landedGyd)+' · Stock available: '+fmt(p.available)+
  ' · Indicative pre-order deposit per bottle: '+gyd(p.preorderDepositPerBottle)+' (70% or upfront commitment; final mixed-order deposit is quoted separately)</p>'+
  ((p.warnings||flags||[]).length?'<p class="price-notes">'+(p.warnings||flags).map(esc).join(' · ')+'</p>':'');
}
function updatePreview(){
 if(!state.selected)return;
 clearTimeout(state.previewTimer);
 state.previewTimer=setTimeout(async()=>{
  const serial=++state.previewId;
  try{
   const payload=await api('price_preview',{body:{sku:state.selected.sku,fields:formFields()}});
   if(serial===state.previewId)renderPrice(payload.pricing,payload.flags);
  }catch(e){if(serial===state.previewId)$('price-preview').innerHTML='<p>'+esc(e.message)+'</p>'}
 },290);
}
async function reload(options={}){
 try{
  if(!state.products.length)$('loading').classList.remove('hidden');
  const data=await api('overview');
  state.products=data.products||[];state.source=data.source;state.counts=data.counts;
  $('loading').classList.add('hidden');$('login').classList.add('hidden');
  $('workspace').classList.remove('hidden');
  $('import-section').classList.toggle('hidden',!data.needsImport);
  $('catalog-panel').classList.toggle('hidden',!!data.needsImport);
  $('stats').classList.toggle('hidden',!!data.needsImport);
  if(data.needsImport){
    state.selected=null;
    $('editor-content').classList.add('hidden');
    $('editor-empty').classList.remove('hidden');
    flash('Choose your original Onarys master CSV to import 878 private product drafts.');
    return;
  }
  if(!options.keepPage)state.page=0;
  renderStats();renderList();
  if(options.selectedSku&&state.products.some(x=>x.sku===options.selectedSku))
    await selectProduct(options.selectedSku);
  else if(state.selected){
    const original=state.products.find(x=>x.sku===state.selected.sku);
    if(original)state.selected=original;
  }
  flash('Private catalogue loaded. No products have been published.');
 }catch(e){$('loading').classList.add('hidden');flash(e.message,true)}
}
function bindImport(){
 $('import-csv').addEventListener('click',async()=>{
  const selected=$('import-csv-file').files?.[0];
  if(!selected){flash('Choose the extracted 878-SKU CSV first.',true);return}
  if(selected.size<20000||selected.size>1000000){flash('Select the original Onarys master CSV, smaller than 1 MB.',true);return}
  if(!confirm('Import all 878 original Onarys supplier products as PRIVATE drafts? No product or photo will appear on the public website.'))return;
  const button=$('import-csv');button.disabled=true;
  $('import-status').textContent='Validating the CSV and importing privately…';
  try{
   const csv=await selected.text();
   const result=await api('import_csv',{body:{csv,confirmed:true}});
   $('import-status').textContent=result.imported+' supplier products imported as private drafts.';
   flash(result.message);
   await reload();
  }catch(e){$('import-status').textContent=e.message;flash(e.message,true)}
  finally{button.disabled=false}
 });
}
function bindFilters(){
 const pairs=[['search','text'],['collection','collection'],['status-filter','status'],['review-filter','review']];
 for(const [id,key] of pairs){
  const fn=e=>{state.filter[key]=e.target.value;state.page=0;renderList()};
  $(id).addEventListener(id==='search'?'input':'change',fn);
 }
 $('previous').onclick=()=>{state.page=Math.max(0,state.page-1);renderList()};
 $('next').onclick=()=>{state.page++;renderList()};
 $('reload').onclick=()=>void reload({keepPage:true,selectedSku:state.selected?.sku});
}
function bindForm(){
 const form=$('product-form');
 form.addEventListener('input',updatePreview);
 form.addEventListener('change',event=>{if(event.target.name==='landedMode')toggleCostMode();updatePreview()});
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!state.selected||state.saving)return;
  state.saving=true;$('save-product').disabled=true;
  const sku=state.selected.sku;
  try{
   const payload=await api('save',{body:{sku,version:state.selected.version,fields:formFields()}});
   flash('Saved '+sku+' privately. Public storefront unchanged.');
   await reload({keepPage:true,selectedSku:sku});
   $('save-status').textContent='Saved privately · Not published';
  }catch(e){flash(e.message,true);$('save-status').textContent=e.message}
  finally{state.saving=false;$('save-product').disabled=false}
 });
 $('upload-photo').onclick=async()=>{
  if(!state.selected||state.saving)return;
  const file=$('photo-file').files?.[0];
  if(!file){flash('Choose a JPG, PNG or WebP image first.',true);return}
  if(file.size>1500000||file.size<1){flash('Photo must be 1.5 MB or smaller.',true);return}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){flash('JPG, PNG or WebP only.',true);return}
  if(!$('photo-rights').checked||!$('photo-no-watermark').checked){
   flash('Confirm commercial-use permission and no Onarys watermark first.',true);return;
  }
  if(!confirm('Upload this verified watermark-free commercial-use photo privately for '+state.selected.sku+'?'))return;
  state.saving=true;$('upload-photo').disabled=true;
  try{
   const dataUrl=await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read image'));reader.readAsDataURL(file);
   });
   await api('upload_photo',{body:{sku:state.selected.sku,dataUrl,
    rightsConfirmed:true,noOnarysWatermarkConfirmed:true}});
   const sku=state.selected.sku;
   flash('Approved private photo stored. It is NOT published.');
   await reload({selectedSku:sku,keepPage:true});
  }catch(e){flash(e.message,true)}
  finally{state.saving=false;$('upload-photo').disabled=false}
 };
 $('remove-photo').onclick=async()=>{
  if(!state.selected||state.saving)return;
  if(!confirm('Remove the approved private photo for '+state.selected.sku+'?'))return;
  state.saving=true;
  try{
   const sku=state.selected.sku;
   await api('remove_photo',{body:{sku,confirmed:true}});
   flash('Photo removed. No public images were affected.');
   await reload({selectedSku:sku,keepPage:true});
  }catch(e){flash(e.message,true)}
  finally{state.saving=false}
 };
}
bindImport();bindFilters();bindForm();void reload();
