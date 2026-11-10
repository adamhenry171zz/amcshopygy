import crypto from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {calculateFragrance,PRICE_RULES,DEFAULT_RULES} from './henry-fragrance-logic.mjs';

// SERVER-ONLY: No public product/publishing endpoint. All supplier USD costs,
// owner pricing, photos and inventory are protected by the HENRY owner session.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'x-content-type-options':'nosniff','x-robots-tag':'noindex,nofollow',
 'vary':'Cookie'}});
const clean=(x,n=500)=>String(x??'').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,n);
const sha=x=>crypto.createHash('sha256').update(String(x||'')).digest();
const same=(x,y)=>crypto.timingSafeEqual(sha(x),sha(y));
const sign=(text,secret)=>crypto.createHmac('sha256',secret).update(text).digest('base64url');
const parseCookies=str=>Object.fromEntries(String(str||'').split(';').map(s=>s.trim()).filter(Boolean).map(k=>{
 const i=k.indexOf('=');return i>=0?[k.slice(0,i),k.slice(i+1)]:[k,''];
}));
const hasSession=(request,secret,email)=>{
 let token;try{token=decodeURIComponent(parseCookies(request.headers.get('cookie')).henry_session||'')}catch{return false}
 if(!token)return false;
 const [payload,sig]=token.split('.');
 if(!payload||!sig||!same(sign(payload,secret),sig))return false;
 try{const session=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  return session.email===email&&session.exp>Date.now()}catch{return false}
};
const fieldsText={name:220,brand:90,collection:60,size:80,concentration:80,gender:30,
 description:1600,forwarderNotes:500,internalNotes:1000,reviewResolution:550};
const fieldsNumbers=['exchangeRate','supplierShippingGyd','forwarderFreightGyd','importFeesGyd',
 'insuranceGyd','packagingGyd','otherDirectGyd','verifiedLandedGyd','retailGyd',
 'upfrontCommitmentGyd','stockOnHand','stockReserved','stockIncoming','reorderLevel'];
const fieldsBool=['costVerified','chargesConfirmed','supplierTierVerified','wholesaleEligible',
 'supplierAvailabilityConfirmed','forwarderConfirmed','authenticitySourceConfirmed'];
const validStatus=new Set(['draft','coming_soon','check_availability','in_stock','pre_order','sold_out']);
const validTier=new Set(['base','usd350','usd500','usd1000','usd1500']);
const validMode=new Set(['verified_total','components']);
const parseFloatField=(value,integer=false)=>{
 if(value===''||value===null||value===undefined)return '';
 const num=Number(value);
 if(!Number.isFinite(num)||num<0||num>10000000||(integer&&!Number.isInteger(num)))return null;
 return num;
};
const defaultProduct=source=>({
 sku:source.sku,name:source.name,brand:source.brand,
 collection:source.collection,size:source.size,concentration:source.concentration,
 gender:source.gender,description:'',
 listingStatus:'draft',wholesaleEligible:false,landedMode:'verified_total',
 costVerified:false,chargesConfirmed:false,supplierTierVerified:false,
 supplierTier:'base',exchangeRate:'',supplierShippingGyd:0,forwarderFreightGyd:0,
 importFeesGyd:0,insuranceGyd:0,packagingGyd:0,otherDirectGyd:0,
 verifiedLandedGyd:'',retailGyd:'',upfrontCommitmentGyd:0,
 stockOnHand:0,stockReserved:0,stockIncoming:0,reorderLevel:0,
 supplierAvailabilityConfirmed:false,forwarderConfirmed:false,authenticitySourceConfirmed:false,
 forwarderNotes:'',internalNotes:'',reviewResolution:'',
 version:0,updatedAt:'',updatedBy:''
});
const fill=(source,override={},photo=false)=>{
 const row={...defaultProduct(source),...override};
 row.photoApproved=photo;
 row.photoUploaded=photo;
 const pricing=calculateFragrance(source,row);
 const flags=[];
 if(source.reviewNotes&&!row.reviewResolution)flags.push('Catalogue description needs review');
 if(source.sourcePhotoStatus!=='Extracted'&&!photo)flags.push('Supplier PDF has no photo');
 if(!photo)flags.push('Approved photo not uploaded');
 if(!pricing.landedGyd)flags.push('Landed cost is unverified');
 if(row.listingStatus==='in_stock'&&pricing.available<1)flags.push('In-stock listing without available bottles');
 if(row.listingStatus==='pre_order'&&(!row.supplierAvailabilityConfirmed||!row.forwarderConfirmed))
  flags.push('Preorder supplier/forwarder not confirmed');
 return {...row,supplierUsd:source.supplierUsd,supplierTiers:source.supplierTiers,
 barcode:source.barcode,pdfPage:source.page,sourceReviewNotes:source.reviewNotes,
 sourcePhotoStatus:source.sourcePhotoStatus,
 pricing,flags,publiclyPublished:false};
};
async function listAll(store,prefix){
 const values=[];let cursor;
 do{
  const page=await store.list({...cursor?{cursor}:{},prefix});
  values.push(...(page.blobs||[]));
  const next=page.cursor||null;
  if(next===cursor)break;
  cursor=next;
 }while(cursor&&values.length<10000);
 return values;
}
async function readOverrides(store,skus){
 const blobs=await listAll(store,'product/');
 const out=new Map();
 for(let index=0;index<blobs.length;index+=40){
  const batch=blobs.slice(index,index+40);
  const values=await Promise.all(batch.map(x=>store.get(x.key,{type:'json'}).catch(()=>null)));
  values.forEach(x=>{if(x&&skus.has(x.sku))out.set(x.sku,x)});
 }
 return out;
}
function cleanInput(input,source,existing){
 const out={};
 for(const [key,max] of Object.entries(fieldsText)){
  out[key]=clean(input[key]??(existing?.[key]??defaultProduct(source)[key]),max);
 }
 for(const key of fieldsNumbers){
  const n=parseFloatField(input[key]??(existing?.[key]??defaultProduct(source)[key]),
   ['stockOnHand','stockReserved','stockIncoming','reorderLevel'].includes(key));
  if(n===null)throw Error('Invalid nonnegative amount for '+key);
  out[key]=n;
 }
 for(const key of fieldsBool)out[key]=input[key]===true;
 out.listingStatus=clean(input.listingStatus||'draft',30);
 out.supplierTier=clean(input.supplierTier||'base',20);
 out.landedMode=clean(input.landedMode||'verified_total',25);
 if(!validStatus.has(out.listingStatus)||!validTier.has(out.supplierTier)||!validMode.has(out.landedMode))
  throw Error('Select a valid product status, pricing mode and supplier discount tier');
 if(!out.name||!out.brand)throw Error('Product name and brand are required');
 if(out.stockReserved>out.stockOnHand)throw Error('Reserved bottles cannot exceed stock physically on hand');
 if(out.listingStatus==='in_stock'&&out.stockOnHand-out.stockReserved<1)
  throw Error('In Stock requires at least one available bottle, after reservations');
 if(out.listingStatus==='pre_order'&&(!out.supplierAvailabilityConfirmed||!out.forwarderConfirmed))
  throw Error('Confirm supplier availability and your forwarder before marking Pre-Order');
 if(out.supplierTier!=='base'&&!out.supplierTierVerified)
  throw Error('Confirm the actual Onarys supplier discount tier before applying it');
 return out;
}
const maxPhotoBytes=1500000;
const validImage=(mime,data)=>{
 const raw=Buffer.from(data,'base64');
 if(!raw.length||raw.length>maxPhotoBytes)throw Error('Image must be 1.5 MB or less');
 const jpg=raw.length>3&&raw[0]===255&&raw[1]===216&&raw[2]===255;
 const png=raw.length>8&&raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=raw.length>12&&raw.subarray(0,4).toString()==='RIFF'&&raw.subarray(8,12).toString()==='WEBP';
 if(!((mime==='image/jpeg'&&jpg)||(mime==='image/png'&&png)||(mime==='image/webp'&&webp)))
  throw Error('Only real JPG, PNG and WebP product photographs are accepted');
 return raw;
};
// Strict owner-upload CSV parser; supplier data never goes into a public Git file.
function csvRows(source){
 const text=String(source||'').replace(/^\uFEFF/,'');
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){field+='"';i++}
   else if(quoted)quoted=false;
   else if(!field)quoted=true;
   else throw Error('Invalid quote in supplier CSV');
  }else if(!quoted&&c===','){row.push(field);field=''}
  else if(!quoted&&(c==='\r'||c==='\n')){
   if(c==='\r'&&text[i+1]==='\n')i++;
   row.push(field);rows.push(row);row=[];field='';
  }else field+=c;
 }
 if(quoted)throw Error('Unclosed quoted field in supplier CSV');
 if(field||row.length){row.push(field);rows.push(row)}
 return rows.filter(r=>r.some(v=>String(v).trim()));
}
function parsePrivateCatalogue(source){
 if(typeof source!=='string'||source.length<20000||source.length>1000000)
  throw Error('Select the original 878-product Onarys master CSV (maximum 1 MB).');
 const matrix=csvRows(source),head=matrix.shift()?.map(x=>String(x).trim())||[];
 const required=['Collection','Brand','Product Name (as shown)','Onarys SKU','Size (supplier-listed)',
  'Concentration (supplier-listed)','Gender (supplier-listed)','Wholesale USD','Buy USD 350+',
  'Buy USD 500+','Buy USD 1000+','Buy USD 1500+','Barcode (if shown)','PDF Page',
  'Image Filename','Image Status','Review Notes','Source'];
 if(required.some(x=>!head.includes(x)))throw Error('This is not the approved Onarys product master CSV.');
 const at=k=>head.indexOf(k);
 const get=(row,k)=>clean(row[at(k)]||'',2200);
 const price=(row,k)=>{const raw=get(row,k);if(!raw)return null;const n=Number(raw);if(!Number.isFinite(n)||n<=0||n>100000)return null;return n};
 if(matrix.length!==878)throw Error('Expected exactly 878 original supplier records; found '+matrix.length+'.');
 const seen=new Set();
 const products=matrix.map(row=>{
  const sku=get(row,'Onarys SKU');
  const supplierUsd=price(row,'Wholesale USD');
  if(!/^[A-Za-z0-9_-]{2,40}$/.test(sku)||seen.has(sku)||supplierUsd===null)
   throw Error('Invalid duplicate SKU or supplier cost near '+sku);
  seen.add(sku);
  const tiers={usd350:price(row,'Buy USD 350+'),usd500:price(row,'Buy USD 500+'),
   usd1000:price(row,'Buy USD 1000+'),usd1500:price(row,'Buy USD 1500+')};
  if(Object.values(tiers).some(v=>v===null))throw Error('Missing required USD supplier tier for SKU '+sku);
  const collection=get(row,'Collection');
  if(!['Arabian','Designer'].includes(collection))throw Error('Unexpected collection for '+sku);
  return {
   sku,name:get(row,'Product Name (as shown)'),brand:get(row,'Brand'),collection,
   size:get(row,'Size (supplier-listed)'),concentration:get(row,'Concentration (supplier-listed)'),
   gender:get(row,'Gender (supplier-listed)'),supplierUsd,supplierTiers:tiers,
   barcode:get(row,'Barcode (if shown)'),page:Number(get(row,'PDF Page'))||null,
   sourcePhotoFilename:get(row,'Image Filename'),sourcePhotoStatus:get(row,'Image Status'),
   reviewNotes:get(row,'Review Notes'),source:get(row,'Source')
  };
 });
 if(seen.size!==878)throw Error('SKU count mismatch.');
 const flagged=products.filter(p=>p.reviewNotes||p.sourcePhotoStatus!=='Extracted').length;
 const missing=products.filter(p=>p.sourcePhotoStatus!=='Extracted').length;
 return {rows:products,source:{name:'Onarys Wholesale Catalog',date:'2026-11-07',
  count:products.length,missingPhotos:missing,reviewFlagged:flagged}};
}
export default async function handler(req,context){
 const email=clean(process.env.HENRY_ADMIN_EMAIL,200).toLowerCase();
 const secret=String(process.env.HENRY_SESSION_SECRET||'');
 if(!email||secret.length<32)return json({error:'HENRY OS owner session not configured'},503);
 if(!hasSession(req,secret,email))return json({error:'Owner sign-in required'},401);
 const url=new URL(req.url),action=url.searchParams.get('action')||'overview';
 const sku=clean(url.searchParams.get('sku'),60);
 const store=getStore('henry-fragrance-private'),photos=getStore('henry-fragrance-private-photos');
 const storedCatalog=await store.get('catalog/seed',{type:'json'}).catch(()=>null);
 const SEED=Array.isArray(storedCatalog?.rows)?storedCatalog.rows:[];
 const SOURCE_META=storedCatalog?.source||{name:'Onarys Wholesale Catalog',date:'2026-11-07',count:0,missingPhotos:0,reviewFlagged:0};
 const skus=new Map(SEED.map(row=>[row.sku,row]));
 const isWrite=req.method==='POST'&&action!=='price_preview';
 if(isWrite&&context?.deploy?.context!=='production')
  return json({error:'Preview deployments are read-only'},403);
 if(action==='import_csv'&&req.method==='POST'){
  if(storedCatalog?.rows?.length)return json({error:'The private catalogue has already been imported. Existing owner edits were protected; no duplicate import was created.'},409);
  let body;try{body=await req.json()}catch{return json({error:'Invalid supplier upload'},400)}
  if(body.confirmed!==true)return json({error:'Please confirm that you are importing the original supplier master privately.'},400);
  let parsed;try{parsed=parsePrivateCatalogue(body.csv)}catch(error){return json({error:error.message},400)}
  await store.setJSON('catalog/seed',{...parsed,importedAt:new Date().toISOString(),importedBy:email});
  return json({imported:parsed.rows.length,source:parsed.source,
   message:'878 private drafts imported. No supplier prices or photographs published.'},201);
 }
 if(action==='overview'&&req.method==='GET'&&!SEED.length){
  return json({needsImport:true,source:SOURCE_META,
   counts:{total:0,drafts:0,edited:0,withApprovedPhoto:0,withVerifiedCost:0,
    wholesaleReady:0,availableStock:0,flaggedSource:0,publiclyPublished:0},
   products:[],rules:PRICE_RULES,retailRules:DEFAULT_RULES,privacy:'owner_only_unpublished'});
 }
 if(action==='overview'&&req.method==='GET'){
  const [edits,imageKeys]=await Promise.all([readOverrides(store,skus),listAll(photos,'photo/')]);
  const images=new Set(imageKeys.map(x=>x.key.slice(6)));
  const products=SEED.map(source=>fill(source,edits.get(source.sku),images.has(source.sku)));
  const counts={
   total:products.length,drafts:products.filter(p=>p.version===0).length,
   edited:products.filter(p=>p.version>0).length,
   withApprovedPhoto:images.size,
   withVerifiedCost:products.filter(p=>p.pricing.landedGyd!==null).length,
   wholesaleReady:products.filter(p=>p.pricing.wholesaleReady).length,
   availableStock:products.reduce((n,p)=>n+p.pricing.available,0),
   flaggedSource:SEED.filter(s=>s.reviewNotes||s.sourcePhotoStatus!=='Extracted').length,
   publiclyPublished:0
  };
  return json({source:SOURCE_META,counts,products,
   rules:PRICE_RULES,retailRules:DEFAULT_RULES,privacy:'owner_only_unpublished'});
 }
 if(action==='product'&&req.method==='GET'){
  const source=skus.get(sku);if(!source)return json({error:'Unknown supplier SKU'},404);
  const [data,photo]=await Promise.all([
   store.get('product/'+sku,{type:'json'}).catch(()=>null),
   photos.get('photo/'+sku,{type:'json'}).catch(()=>null)
  ]);
  return json({product:fill(source,data,!!photo)});
 }
 if(action==='photo'&&req.method==='GET'){
  if(!skus.has(sku))return json({error:'Unknown supplier SKU'},404);
  const photo=await photos.get('photo/'+sku,{type:'json'}).catch(()=>null);
  if(!photo)return json({error:'No approved photo uploaded'},404);
  return json({mimeType:photo.mimeType,dataUrl:'data:'+photo.mimeType+';base64,'+photo.base64,
   uploadedAt:photo.uploadedAt,rightsApproved:true,noOnarysWatermarkConfirmed:true});
 }
 if(['save','price_preview','upload_photo','remove_photo'].includes(action)&&req.method==='POST'){
  let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
  const id=clean(body.sku,60),source=skus.get(id);
  if(!source)return json({error:'Unknown supplier SKU'},404);
  if(['upload_photo','remove_photo'].includes(action)){
   if(action==='remove_photo'){
    if(body.confirmed!==true)return json({error:'Confirm photo removal'},400);
    await photos.delete('photo/'+id);
    return json({sku:id,photoApproved:false});
   }
   if(body.rightsConfirmed!==true||body.noOnarysWatermarkConfirmed!==true)
    return json({error:'Confirm permission for commercial use and that the photograph has no Onarys watermark'},400);
   const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl||''));
   if(!match||body.dataUrl.length>2100000)return json({error:'Image is missing, invalid or too large (maximum 1.5 MB)'},400);
   try{validImage(match[1],match[2])}catch(e){return json({error:e.message},400)}
   await photos.setJSON('photo/'+id,{
    sku:id,mimeType:match[1],base64:match[2],approvedBy:email,
    rightsConfirmed:true,noOnarysWatermarkConfirmed:true,
    uploadedAt:new Date().toISOString()
   });
   return json({sku:id,photoApproved:true});
  }
  const existing=await store.get('product/'+id,{type:'json'}).catch(()=>null);
  let fields;try{fields=cleanInput(body.fields||{},source,existing)}catch(e){return json({error:e.message},400)}
  const preview=fill(source,fields,false);
  if(action==='price_preview')return json({sku:id,pricing:preview.pricing,flags:preview.flags});
  const version=Number(body.version);
  if(!Number.isInteger(version)||version<0||version!==Number(existing?.version||0))
   return json({error:'This product changed in another session. Refresh before saving.'},409);
  const now=new Date().toISOString();
  const changedKeys=Object.keys(fields).filter(k=>JSON.stringify(fields[k])!==JSON.stringify(existing?.[k]??defaultProduct(source)[k]));
  const history=[...(Array.isArray(existing?.history)?existing.history:[]),
   {at:now,by:email,fields:changedKeys}].slice(-30);
  const record={...existing,...fields,sku:id,version:version+1,updatedAt:now,updatedBy:email,history};
  await store.setJSON('product/'+id,record);
  const approvedPhoto=await photos.get('photo/'+id,{type:'json'}).catch(()=>null);
  return json({product:fill(source,record,!!approvedPhoto),message:'Private product saved. Not published.'});
 }
 return json({error:'Action not found'},404);
}
