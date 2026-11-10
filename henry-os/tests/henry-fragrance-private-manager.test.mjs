import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';

import {calculateFragrance,PRICE_RULES,DEFAULT_RULES} from '../functions/henry-fragrance-logic.mjs';
const source=await readFile(new URL('../functions/henry-fragrance.mjs',import.meta.url),'utf8');
const admin=await readFile(new URL('../admin/fragrance-manager.js',import.meta.url),'utf8');
const page=await readFile(new URL('../admin/fragrance-manager.html',import.meta.url),'utf8');
const installer=await readFile(new URL('../../deploy-henry-os/inject.mjs',import.meta.url),'utf8');

const stripped=source.replace(/^import .*$/gm,'').replace('export default async function','async function');
const fixture=()=>{
 const headers=['Collection','Brand','Product Name (as shown)','Onarys SKU','Size (supplier-listed)',
  'Concentration (supplier-listed)','Gender (supplier-listed)','Wholesale USD','Buy USD 350+',
  'Buy USD 500+','Buy USD 1000+','Buy USD 1500+','Barcode (if shown)','PDF Page',
  'Image Filename','Image Status','Review Notes','Source'];
 const rows=Array.from({length:878},(_,i)=>{
  const id=String(i+1).padStart(4,'0');
  const cost=i===0?'39.78':i===1?'38.33':'20.00';
  const imageStatus=i>=875?'Missing in supplier PDF':'Extracted';
  const review=i<40?'Supplier title appears shortened':'';
  return ['Arabian','Afnan','Test Fragrance '+id,'EC'+id,'100 ml','EDP','Unisex',
   cost,'19.50','19.00','18.50','18.00','','2',
   i>=875?'':'EC'+id+'.jpg',imageStatus,review,'Onarys 2026-11-07'];
 });
 return [headers.join(','),...rows.map(row=>row.join(','))].join('\n');
};
function testHarness(){
 const email='owner@example.invalid',secret='s'.repeat(40),db=new Map();
 const getStore=name=>{
  if(!db.has(name))db.set(name,new Map());
  const map=db.get(name);
  return{
   list:async({prefix,cursor})=>{
    const keys=[...map.keys()].filter(key=>key.startsWith(prefix));
    const start=cursor?Number(cursor):0,slice=keys.slice(start,start+1000);
    return {blobs:slice.map(key=>({key})),cursor:start+1000<keys.length?String(start+1000):undefined};
   },
   get:async key=>map.get(key)||null,
   setJSON:async(key,value)=>{map.set(key,structuredClone(value))},
   delete:async key=>{map.delete(key)}
  };
 };
 const handler=new Function('crypto','getStore','calculateFragrance','PRICE_RULES','DEFAULT_RULES',
  'process','Response','URL','Buffer',stripped+'\nreturn handler;')(
   crypto,getStore,calculateFragrance,PRICE_RULES,DEFAULT_RULES,
   {env:{HENRY_ADMIN_EMAIL:email,HENRY_SESSION_SECRET:secret}},Response,URL,Buffer);
 const body=Buffer.from(JSON.stringify({email,exp:Date.now()+3600000})).toString('base64url');
 const cookie=body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url');
 const call=async(action='overview',payload=null,options={})=>{
  const path='https://admin.example.invalid/.netlify/functions/henry-fragrance?action='+action+
   (options.sku?'&sku='+encodeURIComponent(options.sku):'');
  const request=new Request(path,{
   method:payload?'POST':'GET',
   headers:options.unauth?{}:{cookie:'henry_session='+cookie},
   ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const res=await handler(request,{deploy:{context:options.preview?'deploy-preview':'production'}});
  return {status:res.status,data:await res.json()};
 };
 return {db,getStore,call};
}
const sku='EC0001';
test('supplier costs stay out of static assets and git-tracked dataset files',()=>{
 assert.ok(!source.includes('henry-fragrance-seed.mjs'));
 assert.ok(!installer.includes("'henry-fragrance-seed.mjs'"));
 assert.ok(installer.includes('henry-fragrance-lib'));
 assert.ok(page.includes('id="import-csv"'));
 assert.ok(page.includes('id="photo-file"'));
 assert.ok(page.includes('id="catalog-list"'));
 assert.ok(page.includes('id="price-preview"'));
 assert.ok(admin.includes("api('import_csv'"));
 assert.ok(admin.includes("api('upload_photo'"));
 assert.doesNotThrow(()=>new Function(admin));
 assert.doesNotThrow(()=>new Function(stripped));
});
test('private one-time catalogue upload enforces authenticated original 878-SKU CSV',async()=>{
 const h=testHarness(),csv=fixture();
 assert.equal((await h.call('overview',null,{unauth:true})).status,401);
 const initial=await h.call();
 assert.equal(initial.status,200);
 assert.equal(initial.data.needsImport,true);
 assert.equal(initial.data.products.length,0);
 assert.equal((await h.call('import_csv',{csv,confirmed:true},{unauth:true})).status,401);
 assert.equal((await h.call('import_csv',{csv,confirmed:true},{preview:true})).status,403);
 assert.equal((await h.call('import_csv',{csv,confirmed:false})).status,400);
 assert.equal((await h.call('import_csv',{csv:csv.split('\n').slice(0,-1).join('\n'),confirmed:true})).status,400);
 const imported=await h.call('import_csv',{csv,confirmed:true});
 assert.equal(imported.status,201);
 assert.equal(imported.data.imported,878);
 const overview=await h.call();
 assert.equal(overview.data.products.length,878);
 assert.equal(overview.data.counts.total,878);
 assert.equal(overview.data.counts.drafts,878);
 assert.equal(overview.data.counts.publiclyPublished,0);
 assert.equal(overview.data.counts.withApprovedPhoto,0);
 assert.equal(overview.data.counts.withVerifiedCost,0);
 assert.equal(overview.data.source.reviewFlagged,43);
 assert.equal(overview.data.products[0].supplierUsd,39.78);
 assert.equal(overview.data.products[0].pricing.landedGyd,null);
 assert.equal((await h.call('import_csv',{csv,confirmed:true})).status,409);
 assert.equal(h.db.get('henry-fragrance-private').size,1);
 assert.equal(h.db.get('henry-fragrance-private-photos')?.size||0,0);
});
test('private SKU edits use verified costs, wholesale safeguards, and stock reservations',async()=>{
 const h=testHarness(),csv=fixture();
 await h.call('import_csv',{csv,confirmed:true});
 const fields={
  name:'Actual SKU One',brand:'Afnan',collection:'Arabian',landedMode:'verified_total',
  verifiedLandedGyd:10400,costVerified:true,retailGyd:15000,wholesaleEligible:true,
  listingStatus:'in_stock',stockOnHand:3,stockReserved:1,stockIncoming:10,
  reorderLevel:1
 };
 const preview=await h.call('price_preview',{sku,fields});
 assert.equal(preview.status,200);
 assert.equal(preview.data.pricing.wholesale.three.price,14000);
 assert.equal(preview.data.pricing.wholesale.six.price,13500);
 assert.equal(preview.data.pricing.wholesale.twelve.price,13200);
 assert.equal(preview.data.pricing.available,2);
 assert.equal((await h.call('product',null,{sku})).data.product.version,0);
 assert.equal((await h.call('save',{sku,version:0,fields}, {preview:true})).status,403);
 const saved=await h.call('save',{sku,version:0,fields});
 assert.equal(saved.status,200);
 assert.equal(saved.data.product.version,1);
 assert.equal(saved.data.product.publiclyPublished,false);
 assert.equal(saved.data.product.pricing.retailGrossProfit,4600);
 assert.equal(saved.data.product.pricing.wholesaleReady,true);
 assert.equal((await h.call('save',{sku,version:0,fields})).status,409);
 assert.equal((await h.call('save',{sku,version:1,fields:{...fields,stockReserved:5}})).status,400);
 const after=await h.call();
 assert.equal(after.data.counts.edited,1);
 assert.equal(after.data.counts.withVerifiedCost,1);
 assert.equal(after.data.counts.availableStock,2);
 assert.equal(after.data.products[0].name,'Actual SKU One');
 assert.equal(after.data.counts.publiclyPublished,0);
});
test('supplier discount requires confirmation and incomplete landed cost remains unpriced',async()=>{
 const h=testHarness();await h.call('import_csv',{csv:fixture(),confirmed:true});
 const invalid=await h.call('save',{sku,version:0,fields:{
  name:'Test Fragrance',brand:'Afnan',listingStatus:'draft',supplierTier:'usd500',
  supplierTierVerified:false
 }});
 assert.equal(invalid.status,400);
 const noCost=await h.call('price_preview',{sku,fields:{
  name:'Test Fragrance',brand:'Afnan',verifiedLandedGyd:10400,
  costVerified:false,wholesaleEligible:true
 }});
 assert.equal(noCost.data.pricing.landedGyd,null);
 const b=await h.call('price_preview',{sku:'EC0002',fields:{
  name:'Test Fragrance',brand:'Afnan',landedMode:'verified_total',
  verifiedLandedGyd:9700,costVerified:true,retailGyd:14500,
  wholesaleEligible:true
 }});
 assert.equal(b.data.pricing.wholesale.three.price,13500);
 assert.equal(b.data.pricing.wholesale.six.price,13100);
 assert.equal(b.data.pricing.wholesale.twelve.price,12500);
});
test('photos require actual owner confirmation and remain private',async()=>{
 const h=testHarness();await h.call('import_csv',{csv:fixture(),confirmed:true});
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/woAAgAB/og1FxoAAAAASUVORK5CYII=';
 assert.equal((await h.call('photo',null,{sku})).status,404);
 assert.equal((await h.call('upload_photo',{sku,dataUrl:png,rightsConfirmed:false,noOnarysWatermarkConfirmed:true})).status,400);
 assert.equal((await h.call('upload_photo',{sku,dataUrl:png,rightsConfirmed:true,noOnarysWatermarkConfirmed:true},{preview:true})).status,403);
 const uploaded=await h.call('upload_photo',{sku,dataUrl:png,rightsConfirmed:true,noOnarysWatermarkConfirmed:true});
 assert.equal(uploaded.status,200);
 assert.equal((await h.call('photo',null,{sku})).data.dataUrl,png);
 assert.equal((await h.call()).data.counts.withApprovedPhoto,1);
 assert.equal((await h.call()).data.products[0].publiclyPublished,false);
 const deleted=await h.call('remove_photo',{sku,confirmed:true});
 assert.equal(deleted.status,200);
 assert.equal((await h.call('photo',null,{sku})).status,404);
});
