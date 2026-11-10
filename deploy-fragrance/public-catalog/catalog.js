/* AMC Shopping — Public Fragrance Catalogue (enquiry only, no checkout).
   IMPORTANT: The public data contains no supplier USD prices, landed costs or stock quantities.
   Product images are curated from supplier-extracted 500x500 pack; 300px watermarked
   source images are never published. Customer approval required for any order. */
(()=>{
'use strict';
const root=document.getElementById('fragrance-catalog');
const data=window.AMC_FRAGRANCE_CATALOG;
if(!root||!data||!Array.isArray(data.items))return;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const products=data.items;
const map=new Map(products.map(x=>[x.s,x]));
const state={search:'',collection:'all',brand:'all',type:'all',sort:'featured',page:0,limit:24,cart:new Map()};
const loaded=new Set(),loading=new Map();
let serial=0;
const typeName=p=>p.k==='Gift Sets'?'Gift set':p.c+' fragrance';
const isPhoto=p=>Number.isInteger(p.p)&&p.p>=0&&p.p<=13;
const money=n=>'GYD [...state.cart.values()].reduce((sum,x)=>sum+x,0);
const subtotalRows=()=>[...state.cart].map(([sku,qty])=>({...map.get(sku),qty})).filter(p=>p.s);
function loadPack(n){
 if(loaded.has(n))return Promise.resolve();
 if(loading.has(n))return loading.get(n);
 const id=String(n).padStart(2,'0');
 const p=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='/assets/fragrance/catalog-photos-'+id+'.js';
  script.async=true;
  script.onload=()=>{loaded.add(n);resolve();};
  script.onerror=()=>reject(Error('Image preview could not be loaded'));
  document.head.appendChild(script);
 });
 loading.set(n,p);
 p.finally(()=>loading.delete(n)).catch(()=>{});
 return p;
}
function allResults(){
 const q=state.search.toLowerCase().trim();
 let rows=products.filter(p=>
  (state.collection==='all'||p.c===state.collection)&&
  (state.brand==='all'||p.b===state.brand)&&
  (state.type==='all'||(state.type==='Gift Sets'?p.k==='Gift Sets':p.k!=='Gift Sets'))&&
  (!q||[p.n,p.b,p.s,p.z,p.c].some(x=>String(x||'').toLowerCase().includes(q))));
 if(state.sort==='brand')rows.sort((a,b)=>a.b.localeCompare(b.b)||a.n.localeCompare(b.n));
 else if(state.sort==='name')rows.sort((a,b)=>a.n.localeCompare(b.n));
 else if(state.sort==='photo')rows.sort((a,b)=>Number(isPhoto(b))-Number(isPhoto(a))||a.n.localeCompare(b.n));
 else {
  // Balanced initial browse: product photos first, Arabian + Designer alternated.
  const arabian=rows.filter(x=>x.c==='Arabian'),designer=rows.filter(x=>x.c==='Designer');
  for(const a of [arabian,designer])a.sort((a,b)=>Number(isPhoto(b))-Number(isPhoto(a))||a.b.localeCompare(b.b));
  rows=[];let i=0;while(i<arabian.length||i<designer.length){
   if(i<arabian.length)rows.push(arabian[i]);
   if(i<designer.length)rows.push(designer[i]);
   i++;
  }
 }
 return rows;
}
function placeholder(){
 return '<div class="amc-product-placeholder" aria-label="Product photo not available">'+
   '<svg viewBox="0 0 160 170" role="img" aria-label="Fragrance bottle illustration" focusable="false"><defs><linearGradient id="amc-frag-placeholder" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eedec6"/><stop offset="1" stop-color="#af9778"/></linearGradient></defs>'+
   '<rect x="62" y="17" width="36" height="25" rx="4" fill="#b9a387"/><rect x="67" y="43" width="26" height="10" rx="2" fill="#cfbaa1"/>'+
   '<rect x="37" y="54" width="86" height="94" rx="11" fill="url(#amc-frag-placeholder)" fill-opacity=".43" stroke="#c7b59e" stroke-width="2"/>'+
   '<rect x="48" y="88" width="64" height="36" rx="3" fill="#fffaf5" fill-opacity=".65"/><text x="80" y="110" text-anchor="middle" fill="#8f7d65" font-size="12" font-family="Georgia,serif">FRAGRANCE</text></svg>'+
   '<small>PHOTO ON REQUEST</small></div>';
}
function card(p){
 const qty=state.cart.get(p.s)||0;
 return '<article class="amc-product-card" data-sku="'+esc(p.s)+'">'+
   '<div class="amc-product-photo" data-photo-sku="'+esc(p.s)+'">'+placeholder()+'</div>'+
   '<div class="amc-product-body"><div class="amc-product-meta"><span>'+esc(p.b)+'</span><span>'+esc(typeName(p))+'</span></div>'+
   '<h3>'+esc(p.n)+'</h3><p class="amc-product-size">'+esc(p.z||'Size on request')+'</p>'+
   '<p class="amc-product-pricing"><strong>'+money(p.r)+'</strong> retail <small>· Wholesale from 3 eligible bottles</small></p>'+
   '<div class="amc-product-bottom"><span class="amc-product-sku">SKU '+esc(p.s)+'</span>'+
   '<button class="amc-product-add '+(qty?'added':'')+'" type="button" data-add="'+esc(p.s)+'" aria-label="Add '+esc(p.n)+' to your fragrance enquiry">'+(qty?'Added '+qty+' ✓':'+ Enquire')+'</button></div></div></article>';
}
function hydrateImages(){
 const cards=[...$('amc-catalog-grid').querySelectorAll('[data-photo-sku]')];
 const page=serial;
 const groups=new Set(cards.map(el=>map.get(el.dataset.photoSku)?.p).filter(Number.isInteger));
 for(const id of groups){
  loadPack(id).then(()=>{
   if(serial!==page)return;
   for(const el of cards){
    const p=map.get(el.dataset.photoSku);
    const src=window.AMC_FRAG_PHOTOS?.[p?.s];
    if(p?.p!==id||!src)continue;
    const img=document.createElement('img');
    img.src=src;img.alt=p.n+' product photo';img.loading='lazy';img.decoding='async';
    el.replaceChildren(img);
   }
  }).catch(()=>{/* Accessible placeholder remains; never show an unverified URL. */});
 }
}
function draw(){
 const rows=allResults();
 const maxPage=Math.max(1,Math.ceil(rows.length/state.limit));
 state.page=Math.max(0,Math.min(state.page,maxPage-1));
 const current=rows.slice(state.page*state.limit,(state.page+1)*state.limit);
 $('amc-catalog-total').textContent=rows.length.toLocaleString()+' fragrances';
 $('amc-catalog-range').textContent=rows.length?((state.page*state.limit)+1)+'–'+Math.min(rows.length,(state.page+1)*state.limit)+' of '+rows.length:'0 products';
 $('amc-catalog-grid').innerHTML=current.map(card).join('')||
  '<div class="amc-no-results"><h3>No matching products</h3><p>Try a different brand, collection or search term.</p><button type="button" id="amc-clear-search">Clear filters</button></div>';
 $('amc-page').textContent='Page '+(state.page+1)+' of '+maxPage;
 $('amc-prev').disabled=state.page===0;
 $('amc-next').disabled=state.page>=maxPage-1;
 serial++;hydrateImages();renderBasket();
 $('amc-catalog-grid').querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>{
  addSku(button.dataset.add,1);
 }));
 const clear=$('amc-clear-search');if(clear)clear.onclick=()=>{for(const key of ['search','collection','brand','type'])state[key]=key==='search'?'':'all';syncFilters();state.page=0;draw();};
}
function syncFilters(){
 $('amc-search').value=state.search;
 $('amc-collection').value=state.collection;
 $('amc-brand').value=state.brand;
 $('amc-type').value=state.type;
}
function addSku(sku,num){
 if(!map.has(sku))return;
 const old=state.cart.get(sku)||0;
 const next=Math.max(0,Math.min(100,old+num));
 if(next===0)state.cart.delete(sku);else state.cart.set(sku,next);
 draw();
}
function renderBasket(){
 const rows=subtotalRows(),qty=countTotal();
 $('amc-enquiry-count').textContent=qty+' bottle'+(qty===1?'':'s');
 $('amc-enquiry-item-count').textContent=rows.length+' fragrance'+(rows.length===1?'':'s');
 $('amc-cart-qualifier').textContent=qty>=3?
  '3+ bottles selected · Request wholesale pricing (eligibility confirmed by AMC)':
  qty?'Add '+(3-qty)+' more bottle'+(3-qty===1?'':'s')+' to request 3-piece wholesale pricing':
  'Mix any 3 eligible bottles to request wholesale pricing';
 const idx=tierIndex(qty);
 const total=rows.reduce((sum,p)=>sum+(idx>=0&&Number.isFinite(p.w?.[idx])?p.w[idx]:p.r)*p.qty,0);
 const retailTotal=rows.reduce((sum,p)=>sum+p.r*p.qty,0);
 $('amc-cart-qualifier').textContent += ' · Estimated '+(idx>=0?'wholesale':'retail')+' total: '+money(total)+(retailTotal>total?' · Save '+money(retailTotal-total):'')+' · Subject to confirmation';
 const list=$('amc-enquiry-items');
 list.innerHTML=rows.length?rows.map(p=>'<div class="amc-basket-row"><div><strong>'+esc(p.n)+'</strong><span>'+esc(p.s)+' · '+esc(p.b)+'</span></div>'+
  '<div class="amc-basket-controls"><span class="amc-basket-price">'+money((idx>=0&&Number.isFinite(p.w?.[idx])?p.w[idx]:p.r)*p.qty)+'</span><button type="button" data-sub="'+esc(p.s)+'" aria-label="Remove one '+esc(p.n)+'">−</button><b>'+p.qty+'</b>'+
  '<button type="button" data-plus="'+esc(p.s)+'" aria-label="Add one '+esc(p.n)+'">+</button></div></div>').join(''):
  '<p class="amc-basket-empty">Add products from the catalogue to build your fragrance enquiry.</p>';
 list.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>addSku(b.dataset.sub,-1));
 list.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>addSku(b.dataset.plus,1));
 $('amc-enquiry-send').disabled=qty===0;
 $('amc-enquiry-clear').disabled=qty===0;
 $('amc-enquiry-floating').classList.toggle('is-visible',qty>0);
 $('amc-floating-count').textContent=qty;
}
function whatsapp(){
 const rows=subtotalRows();if(!rows.length)return;
 const qty=countTotal();const idx=tierIndex(qty);
 const estimated=rows.reduce((sum,p)=>sum+(idx>=0&&Number.isFinite(p.w?.[idx])?p.w[idx]:p.r)*p.qty,0);
 const msg=['Hello AMC Shopping! I would like a quotation for these authentic fragrance enquiries:',
  ...rows.map((p,i)=>(i+1)+'. '+p.n+' | SKU '+p.s+' | Qty '+p.qty+' | Unit '+money(idx>=0&&Number.isFinite(p.w?.[idx])?p.w[idx]:p.r)),
  'Total requested bottles: '+qty,
  'Estimated GYD total: '+money(estimated)+' (subject to AMC confirmation)',
  qty>=3?'Please check which products qualify for mixed 3+ wholesale pricing.':'Please quote the individual retail prices.',
  'Please confirm current availability, authenticity information, total GYD costs, deposit requirements, your forwarder arrangements and an estimated delivery timeframe before I pay.',
  'This is an enquiry, not an order or payment.'].join('\n');
 window.open('https://wa.me/5926042826?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
}
const brands=[...new Set(products.map(x=>x.b))].sort((a,b)=>a.localeCompare(b));
$('amc-brand').innerHTML='<option value="all">All brands</option>'+brands.map(b=>'<option value="'+esc(b)+'">'+esc(b)+'</option>').join('');
$('amc-total-listings').textContent=data.published.toLocaleString();
const photoCount=$('amc-photo-listings');
if(photoCount)photoCount.textContent=data.photosCurated.toLocaleString();
$('amc-search').oninput=e=>{state.search=e.target.value;state.page=0;draw()};
$('amc-collection').onchange=e=>{state.collection=e.target.value;state.page=0;draw()};
$('amc-brand').onchange=e=>{state.brand=e.target.value;state.page=0;draw()};
$('amc-type').onchange=e=>{state.type=e.target.value;state.page=0;draw()};
$('amc-sort').onchange=e=>{state.sort=e.target.value;state.page=0;draw()};
$('amc-prev').onclick=()=>{state.page--;draw();root.scrollIntoView({behavior:'smooth',block:'start'})};
$('amc-next').onclick=()=>{state.page++;draw();root.scrollIntoView({behavior:'smooth',block:'start'})};
$('amc-enquiry-send').onclick=whatsapp;
$('amc-enquiry-clear').onclick=()=>{if(!state.cart.size)return;if(confirm('Remove all fragrances from your enquiry?')){state.cart.clear();draw()}};
$('amc-floating-open').onclick=()=>{$('amc-enquiry-panel').scrollIntoView({behavior:'smooth',block:'start'})};
draw();
})();
+Number(n).toLocaleString('en-US');
const tierIndex=n=>n>=12?2:n>=6?1:n>=3?0:-1;
const linePrice=(p,qty)=>{const idx=tierIndex(qty);return idx>=0&&Number.isFinite(p.w?.[idx])?p.w[idx]:p.r;};
const countTotal=()=>[...state.cart.values()].reduce((sum,x)=>sum+x,0);
const subtotalRows=()=>[...state.cart].map(([sku,qty])=>({...map.get(sku),qty})).filter(p=>p.s);
function loadPack(n){
 if(loaded.has(n))return Promise.resolve();
 if(loading.has(n))return loading.get(n);
 const id=String(n).padStart(2,'0');
 const p=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='/assets/fragrance/catalog-photos-'+id+'.js';
  script.async=true;
  script.onload=()=>{loaded.add(n);resolve();};
  script.onerror=()=>reject(Error('Image preview could not be loaded'));
  document.head.appendChild(script);
 });
 loading.set(n,p);
 p.finally(()=>loading.delete(n)).catch(()=>{});
 return p;
}
function allResults(){
 const q=state.search.toLowerCase().trim();
 let rows=products.filter(p=>
  (state.collection==='all'||p.c===state.collection)&&
  (state.brand==='all'||p.b===state.brand)&&
  (state.type==='all'||(state.type==='Gift Sets'?p.k==='Gift Sets':p.k!=='Gift Sets'))&&
  (!q||[p.n,p.b,p.s,p.z,p.c].some(x=>String(x||'').toLowerCase().includes(q))));
 if(state.sort==='brand')rows.sort((a,b)=>a.b.localeCompare(b.b)||a.n.localeCompare(b.n));
 else if(state.sort==='name')rows.sort((a,b)=>a.n.localeCompare(b.n));
 else if(state.sort==='photo')rows.sort((a,b)=>Number(isPhoto(b))-Number(isPhoto(a))||a.n.localeCompare(b.n));
 else {
  // Balanced initial browse: product photos first, Arabian + Designer alternated.
  const arabian=rows.filter(x=>x.c==='Arabian'),designer=rows.filter(x=>x.c==='Designer');
  for(const a of [arabian,designer])a.sort((a,b)=>Number(isPhoto(b))-Number(isPhoto(a))||a.b.localeCompare(b.b));
  rows=[];let i=0;while(i<arabian.length||i<designer.length){
   if(i<arabian.length)rows.push(arabian[i]);
   if(i<designer.length)rows.push(designer[i]);
   i++;
  }
 }
 return rows;
}
function placeholder(){
 return '<div class="amc-product-placeholder" aria-label="Product photo not available">'+
   '<svg viewBox="0 0 160 170" role="img" aria-label="Fragrance bottle illustration" focusable="false"><defs><linearGradient id="amc-frag-placeholder" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eedec6"/><stop offset="1" stop-color="#af9778"/></linearGradient></defs>'+
   '<rect x="62" y="17" width="36" height="25" rx="4" fill="#b9a387"/><rect x="67" y="43" width="26" height="10" rx="2" fill="#cfbaa1"/>'+
   '<rect x="37" y="54" width="86" height="94" rx="11" fill="url(#amc-frag-placeholder)" fill-opacity=".43" stroke="#c7b59e" stroke-width="2"/>'+
   '<rect x="48" y="88" width="64" height="36" rx="3" fill="#fffaf5" fill-opacity=".65"/><text x="80" y="110" text-anchor="middle" fill="#8f7d65" font-size="12" font-family="Georgia,serif">FRAGRANCE</text></svg>'+
   '<small>PHOTO ON REQUEST</small></div>';
}
function card(p){
 const qty=state.cart.get(p.s)||0;
 return '<article class="amc-product-card" data-sku="'+esc(p.s)+'">'+
   '<div class="amc-product-photo" data-photo-sku="'+esc(p.s)+'">'+placeholder()+'</div>'+
   '<div class="amc-product-body"><div class="amc-product-meta"><span>'+esc(p.b)+'</span><span>'+esc(typeName(p))+'</span></div>'+
   '<h3>'+esc(p.n)+'</h3><p class="amc-product-size">'+esc(p.z||'Size on request')+'</p>'+
   '<p class="amc-product-pricing">Price &amp; availability on enquiry</p>'+
   '<div class="amc-product-bottom"><span class="amc-product-sku">SKU '+esc(p.s)+'</span>'+
   '<button class="amc-product-add '+(qty?'added':'')+'" type="button" data-add="'+esc(p.s)+'" aria-label="Add '+esc(p.n)+' to your fragrance enquiry">'+(qty?'Added '+qty+' ✓':'+ Enquire')+'</button></div></div></article>';
}
function hydrateImages(){
 const cards=[...$('amc-catalog-grid').querySelectorAll('[data-photo-sku]')];
 const page=serial;
 const groups=new Set(cards.map(el=>map.get(el.dataset.photoSku)?.p).filter(Number.isInteger));
 for(const id of groups){
  loadPack(id).then(()=>{
   if(serial!==page)return;
   for(const el of cards){
    const p=map.get(el.dataset.photoSku);
    const src=window.AMC_FRAG_PHOTOS?.[p?.s];
    if(p?.p!==id||!src)continue;
    const img=document.createElement('img');
    img.src=src;img.alt=p.n+' product photo';img.loading='lazy';img.decoding='async';
    el.replaceChildren(img);
   }
  }).catch(()=>{/* Accessible placeholder remains; never show an unverified URL. */});
 }
}
function draw(){
 const rows=allResults();
 const maxPage=Math.max(1,Math.ceil(rows.length/state.limit));
 state.page=Math.max(0,Math.min(state.page,maxPage-1));
 const current=rows.slice(state.page*state.limit,(state.page+1)*state.limit);
 $('amc-catalog-total').textContent=rows.length.toLocaleString()+' fragrances';
 $('amc-catalog-range').textContent=rows.length?((state.page*state.limit)+1)+'–'+Math.min(rows.length,(state.page+1)*state.limit)+' of '+rows.length:'0 products';
 $('amc-catalog-grid').innerHTML=current.map(card).join('')||
  '<div class="amc-no-results"><h3>No matching products</h3><p>Try a different brand, collection or search term.</p><button type="button" id="amc-clear-search">Clear filters</button></div>';
 $('amc-page').textContent='Page '+(state.page+1)+' of '+maxPage;
 $('amc-prev').disabled=state.page===0;
 $('amc-next').disabled=state.page>=maxPage-1;
 serial++;hydrateImages();renderBasket();
 $('amc-catalog-grid').querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>{
  addSku(button.dataset.add,1);
 }));
 const clear=$('amc-clear-search');if(clear)clear.onclick=()=>{for(const key of ['search','collection','brand','type'])state[key]=key==='search'?'':'all';syncFilters();state.page=0;draw();};
}
function syncFilters(){
 $('amc-search').value=state.search;
 $('amc-collection').value=state.collection;
 $('amc-brand').value=state.brand;
 $('amc-type').value=state.type;
}
function addSku(sku,num){
 if(!map.has(sku))return;
 const old=state.cart.get(sku)||0;
 const next=Math.max(0,Math.min(100,old+num));
 if(next===0)state.cart.delete(sku);else state.cart.set(sku,next);
 draw();
}
function renderBasket(){
 const rows=subtotalRows(),qty=countTotal();
 $('amc-enquiry-count').textContent=qty+' bottle'+(qty===1?'':'s');
 $('amc-enquiry-item-count').textContent=rows.length+' fragrance'+(rows.length===1?'':'s');
 $('amc-cart-qualifier').textContent=qty>=3?
  '3+ bottles selected · Request wholesale pricing (eligibility confirmed by AMC)':
  qty?'Add '+(3-qty)+' more bottle'+(3-qty===1?'':'s')+' to request 3-piece wholesale pricing':
  'Mix any 3 eligible bottles to request wholesale pricing';
 const list=$('amc-enquiry-items');
 list.innerHTML=rows.length?rows.map(p=>'<div class="amc-basket-row"><div><strong>'+esc(p.n)+'</strong><span>'+esc(p.s)+' · '+esc(p.b)+'</span></div>'+
  '<div class="amc-basket-controls"><button type="button" data-sub="'+esc(p.s)+'" aria-label="Remove one '+esc(p.n)+'">−</button><b>'+p.qty+'</b>'+
  '<button type="button" data-plus="'+esc(p.s)+'" aria-label="Add one '+esc(p.n)+'">+</button></div></div>').join(''):
  '<p class="amc-basket-empty">Add products from the catalogue to build your fragrance enquiry.</p>';
 list.querySelectorAll('[data-sub]').forEach(b=>b.onclick=()=>addSku(b.dataset.sub,-1));
 list.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>addSku(b.dataset.plus,1));
 $('amc-enquiry-send').disabled=qty===0;
 $('amc-enquiry-clear').disabled=qty===0;
 $('amc-enquiry-floating').classList.toggle('is-visible',qty>0);
 $('amc-floating-count').textContent=qty;
}
function whatsapp(){
 const rows=subtotalRows();if(!rows.length)return;
 const qty=countTotal();
 const msg=['Hello AMC Shopping! I would like a quotation for these authentic fragrance enquiries:',
  ...rows.map((p,i)=>(i+1)+'. '+p.n+' | SKU '+p.s+' | Qty '+p.qty),
  'Total requested bottles: '+qty,
  qty>=3?'Please check which products qualify for mixed 3+ wholesale pricing.':'Please quote the individual retail prices.',
  'Please confirm current availability, authenticity information, total GYD costs, deposit requirements, your forwarder arrangements and an estimated delivery timeframe before I pay.',
  'This is an enquiry, not an order or payment.'].join('\n');
 window.open('https://wa.me/5926042826?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer');
}
const brands=[...new Set(products.map(x=>x.b))].sort((a,b)=>a.localeCompare(b));
$('amc-brand').innerHTML='<option value="all">All brands</option>'+brands.map(b=>'<option value="'+esc(b)+'">'+esc(b)+'</option>').join('');
$('amc-total-listings').textContent=data.published.toLocaleString();
const photoCount=$('amc-photo-listings');
if(photoCount)photoCount.textContent=data.photosCurated.toLocaleString();
$('amc-search').oninput=e=>{state.search=e.target.value;state.page=0;draw()};
$('amc-collection').onchange=e=>{state.collection=e.target.value;state.page=0;draw()};
$('amc-brand').onchange=e=>{state.brand=e.target.value;state.page=0;draw()};
$('amc-type').onchange=e=>{state.type=e.target.value;state.page=0;draw()};
$('amc-sort').onchange=e=>{state.sort=e.target.value;state.page=0;draw()};
$('amc-prev').onclick=()=>{state.page--;draw();root.scrollIntoView({behavior:'smooth',block:'start'})};
$('amc-next').onclick=()=>{state.page++;draw();root.scrollIntoView({behavior:'smooth',block:'start'})};
$('amc-enquiry-send').onclick=whatsapp;
$('amc-enquiry-clear').onclick=()=>{if(!state.cart.size)return;if(confirm('Remove all fragrances from your enquiry?')){state.cart.clear();draw()}};
$('amc-floating-open').onclick=()=>{$('amc-enquiry-panel').scrollIntoView({behavior:'smooth',block:'start'})};
draw();
})();
