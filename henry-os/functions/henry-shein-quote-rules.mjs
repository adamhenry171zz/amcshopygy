// Server-side quotation rules shared with the preview test suite.
export const RATES=Object.freeze({overall:360,down:240});
export const MAX_ITEMS=150;
export function text(v,n=200){return String(v??'').trim().replace(/[\u0000-\u001f]/g,' ').slice(0,n)}
export const RETAILERS=Object.freeze(['SHEIN','Amazon','Temu','eBay','Walmart','Fashion Nova','Nike','AliExpress','Other']);
export function retailer(v){const s=String(v||'SHEIN');if(!RETAILERS.includes(s))throw Error('Select a supported shopping source.');return s}
export function safeRetailLink(v,store='SHEIN'){
 if(store==='SHEIN')return safeSheinLink(v);
 const raw=text(v,2000);if(!raw)return '';
 let u;try{u=new URL(raw)}catch{throw Error('Enter a complete HTTPS product or cart URL.')}
 const h=u.hostname.toLowerCase(),domains={Amazon:['amazon.com','amzn.to','a.co'],Temu:['temu.com'],'eBay':['ebay.com','ebay.us'],Walmart:['walmart.com'],'Fashion Nova':['fashionnova.com'],Nike:['nike.com'],AliExpress:['aliexpress.com','aliexpress.us']};
 if(u.protocol!=='https:'||u.username||u.password||u.port||!h.includes('.')||/^[\d.]+$/.test(h)||h.endsWith('.local')||h.endsWith('.internal'))throw Error('Use a public HTTPS retailer URL.');
 if(domains[store]&&!domains[store].some(d=>h===d||h.endsWith('.'+d)))throw Error('The link must match the selected retailer.');
 return u.href;
}
export function safeSheinLink(v){
 const raw=text(v,2000);if(!raw)return '';
 let u;try{u=new URL(raw)}catch{throw Error('Enter a complete SHEIN share URL.')}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='shein.com'||u.hostname.endsWith('.shein.com')))throw Error('Only HTTPS SHEIN links are accepted.');
 return u.href;
}
export function safeImageLink(v){const raw=text(v,1500);if(!raw)return '';try{const u=new URL(raw);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='ltwebstatic.com'||u.hostname.endsWith('.ltwebstatic.com')||u.hostname==='shein.com'||u.hostname.endsWith('.shein.com')))return u.href}catch{}return ''}
const number=(v,label,min,max,integer=false)=>{
 if(v===null||v===undefined||String(v).trim()==='')throw Error(label+' is required.');
 const s=String(v).trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error(label+' must be a valid number.');
 const n=Number(s);if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(label+' is out of range.');return n;
};
export function normalizeItems(input,{complete=false,store='SHEIN'}={}){
 if(!Array.isArray(input)||input.length>MAX_ITEMS)throw Error('Maximum 150 product rows.');
 return input.map((v,i)=>{
  const p=v&&typeof v==='object'?v:{},name=text(p.name,200),size=text(p.size,60),color=text(p.color,80),link=p.link?safeRetailLink(p.link,store):'',image=safeImageLink(p.image),sku=text(p.sku,100);
  const price=p.price===''||p.price==null?null:number(p.price,'Price',0.01,10000);
  const qty=p.qty===''||p.qty==null?null:number(p.qty,'Quantity',1,100,true);
  const weight=p.weight===''||p.weight==null?null:number(p.weight,'Per-item weight',0.01,500);
  if(complete&&(!name||price===null||qty===null||!size||!color))throw Error('Complete name, USD price, quantity, size and colour (use N/A where applicable) for row '+(i+1)+'.');
  return {name,size,color,link,image,sku,price,qty,weight};
 });
}
// Preserve the currently deployed SHEIN calculator's rate brackets, per unit.
export function shippingRate(w){return w<=10?1500:w<=25?1300:w<=55?1200:w<=99?1100:1050}
const round100Cents=c=>Math.ceil(c/10000)*100;
export function normalizeRates(input=RATES){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Enter both pricing rates.');
 const overall=number(input.overall,'Overall rate',1,10000,true),down=number(input.down,'Down-payment rate',1,10000,true);
 if(down>overall)throw Error('Down-payment rate cannot exceed overall rate.');
 return {overall,down};
}
export function quoteTotals(items,feesUsd=0,extraGyd=0,store='SHEIN',rates=RATES){
 rates=normalizeRates(rates);
 retailer(store);
 if(!items.length||items.some(x=>x.price==null||x.qty==null))throw Error('Complete USD price and quantity for every item.');
 const usdFee=number(feesUsd,'Supplier fees (USD)',0,10000);
 const extra=number(extraGyd,'Extra charge (GYD)',0,1000000);
 // USD cents avoid floating-point rounding errors; extra charges fall on arrival.
 const subtotalCents=items.reduce((n,x)=>n+Math.round(x.price*100)*x.qty,0);
 const usdCents=subtotalCents+Math.round(usdFee*100);
 const heavyCents=items.reduce((n,x)=>n+(store==='SHEIN'&&x.weight!=null&&x.weight>3?Math.round(x.weight*100)*shippingRate(x.weight)*x.qty:0),0);
 const down=round100Cents(usdCents*rates.down);
 const overall=round100Cents(usdCents*rates.overall+heavyCents+Math.round(extra*100));
 return {subtotalUsd:subtotalCents/100,feesUsd:usdFee,totalUsd:usdCents/100,heavyShippingGyd:heavyCents/100,extraGyd:extra,overall,down,balance:overall-down,unknownWeights:items.filter(x=>x.weight==null).length};
}
export function deliveryWindow(orderTuesday,store='SHEIN'){
 retailer(store);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(orderTuesday||''))throw Error('Select the confirmed Tuesday order placement date.');
 const d=new Date(orderTuesday+'T12:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==orderTuesday||d.getUTCDay()!==2)throw Error('Order placement must be a valid Tuesday.');
 const plus=n=>{const x=new Date(d);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
 return {orderTuesday,arrivalFrom:plus(store==='Amazon'?7:14),arrivalTo:plus(store==='Amazon'?14:21)};
}
export function nextTuesday(today){const d=new Date(today+'T12:00:00Z');if(!Number.isFinite(d.getTime()))throw Error('Invalid date');d.setUTCDate(d.getUTCDate()+((2-d.getUTCDay()+7)%7||7));return d.toISOString().slice(0,10)}
// Explicitly customer-supplied tabular data. No requests to SHEIN or cart providers.
export function parseCartText(input,store='SHEIN'){
 const lines=String(input||'').trim().split(/\r?\n/).filter(l=>l.trim());
 if(lines.length<2||lines.length>MAX_ITEMS+1)throw Error('Paste a tab-separated table with a header and 1–150 product rows.');
 const headers=lines.shift().split('\t').map(h=>h.toLowerCase().trim().replace(/[^a-z0-9]/g,''));
 const aliases={name:['name','title','product','productname','item'],price:['price','usdprice','priceusd','unitprice','unitpriceusd'],qty:['qty','quantity'],size:['size'],color:['color','colour'],link:['link','url','productlink'],sku:['sku','productsku'],image:['image','imageurl'],weight:['weight','weightlb','weightlbs'],currency:['currency','currencycode']};
 const indices=Object.fromEntries(Object.entries(aliases).map(([k,keys])=>[k,headers.findIndex(h=>keys.includes(h))]));
 if(indices.name<0||indices.price<0)throw Error('The export needs a product name/title and USD unit price column.');
 const rows=lines.map(l=>{
  const cells=l.split('\t'),v=k=>indices[k]>=0?(cells[indices[k]]||'').trim():'';
  if(v('currency')&&v('currency').toUpperCase()!=='USD')throw Error('Only USD cart exports are supported.');
  const price=v('price').replace(/^(?:USD|US\$|\$)\s*/i,'');
  return {name:v('name'),price,qty:v('qty'),size:v('size'),color:v('color'),link:v('link'),sku:v('sku'),image:v('image'),weight:v('weight')};
 });
 return normalizeItems(rows,{store});
}
export function validateScreenshot(s){
 const mime=text(s?.mime,30),data=String(s?.data||'');
 if(!['image/jpeg','image/png','image/webp'].includes(mime)||data.length>1500000||!(/^[A-Za-z0-9+/]+={0,2}$/.test(data)))throw Error('Use JPG, PNG or WebP screenshots, up to about 1 MB each.');
 const b=Buffer.from(data,'base64');
 const valid=mime==='image/png'?b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255:b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
 if(!valid||b.length>1050000)throw Error('Screenshot format or size is invalid.');
 return {mime,data:b.toString('base64')};
}

// Public estimates expose amounts only; the current private rates stay on the server.
export function publicEstimate(input,rates=RATES){
 rates=normalizeRates(rates);
 if(!Array.isArray(input)||input.length<1||input.length>20)throw Error('Enter 1–20 items.');
 const rows=input.map((i)=>({price:number(i.price,'USD value',0,10000),qty:1,weight:number(i.weight??0,'Weight',0,500)}));
 const total=quoteTotals(rows,0,0,'SHEIN',rates);
 return {overall:total.overall,down:total.down,balance:total.balance,heavyShippingGyd:total.heavyShippingGyd,cardSubtotal:round100Cents(Math.round(total.subtotalUsd*100)*rates.overall),rows:rows.map(i=>{const t=quoteTotals([i],0,0,'SHEIN',rates);return {overall:t.overall,down:t.down,balance:t.balance,heavyShippingGyd:t.heavyShippingGyd}})};
}
