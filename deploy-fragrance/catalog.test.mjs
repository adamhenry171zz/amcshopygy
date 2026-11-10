import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'public-catalog');
const html=fs.readFileSync(new URL('./landing.html',import.meta.url),'utf8');
const app=fs.readFileSync(path.join(dir,'catalog.js'),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(dir,'catalog-products.js'),'utf8'),context);
const catalogue=context.window.AMC_FRAGRANCE_CATALOG;
test('835 unique product enquiries; source-review names withheld and no private supplier prices',()=>{
 assert.equal(catalogue.totalExtracted,878);
 assert.equal(catalogue.published,835);
 assert.equal(catalogue.flaggedExcluded,43);
 assert.equal(catalogue.photosCurated,530);
 assert.equal(catalogue.items.length,835);
 assert.equal(new Set(catalogue.items.map(x=>x.s)).size,835);
 assert.equal(catalogue.items.filter(x=>x.p!==null).length,530);
 for(const p of catalogue.items){
  assert.match(p.s,/^EC[0-9]+$/);
  assert.ok(p.n&&p.b&&['Arabian','Designer'].includes(p.c));
  assert.equal(Object.hasOwn(p,'supplierUsd'),false);
  assert.equal(Object.hasOwn(p,'wholesaleUsd'),false);
  assert.equal(Object.hasOwn(p,'retailPrice'),false);
  assert.equal(Object.hasOwn(p,'landedCost'),false);
 }
});
test('all 530 curated images have valid WebP data and no wrong-sku mappings',()=>{
 const map={};
 let count=0;
 for(let i=0;i<14;i++){
  const file='catalog-photos-'+String(i).padStart(2,'0')+'.js';
  const src=fs.readFileSync(path.join(dir,file),'utf8');
  const single=vm.createContext({window:{}});
  vm.runInContext(src,single);
  const all=single.window.AMC_FRAG_PHOTOS||{};
  for(const [sku,data] of Object.entries(all)){
   assert.equal(map[sku],undefined,'Duplicate photo for '+sku);
   assert.match(data,/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
   assert.ok(Buffer.from(data.split(',')[1],'base64').subarray(0,4).equals(Buffer.from('RIFF')));
   map[sku]=i;count++;
  }
 }
 assert.equal(count,530);
 for(const p of catalogue.items){
  assert.equal(p.p===null,!(p.s in map));
  if(p.p!==null)assert.equal(p.p,map[p.s]);
 }
});
test('fragrance page supports browse, filters and mixed-quantity WhatsApp enquiries without payment',()=>{
 assert.ok(html.includes('id="fragrance-catalog"'));
 assert.ok(html.includes('id="amc-search"'));
 assert.ok(html.includes('id="amc-brand"'));
 assert.ok(html.includes('id="amc-enquiry-send"'));
 assert.ok(html.includes('/assets/fragrance/catalog-products.js'));
 assert.ok(html.includes('/assets/fragrance/catalog.js'));
 assert.ok(html.includes('/assets/fragrance/catalog.css'));
 assert.ok(!html.includes('Onarys_Wholesale_Complete_Extract.zip'));
 assert.ok(app.includes('countTotal()'));
 assert.ok(app.includes('qty>=3'));
 assert.ok(app.includes('https://wa.me/5926042826?text='));
 assert.ok(app.includes('availability, authenticity information'));
 assert.ok(!app.includes('supplierUsd'));
 assert.ok(!app.includes('stripe.com'));
 assert.doesNotThrow(()=>new Function(app));
});
test('site injector copies 14 lazy image bundles and route remains /fragrances',()=>{
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'amc-public-catalogue-'));
 try{
  fs.mkdirSync(path.join(scratch,'assets'),{recursive:true});
  fs.writeFileSync(path.join(scratch,'index.html'),'<html><head></head><body><header></header><a href="course">Course</a></body></html>');
  fs.writeFileSync(path.join(scratch,'course.html'),'Course is deactivated');
  const result=spawnSync(process.execPath,[new URL('./inject.mjs',import.meta.url).pathname,scratch],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.existsSync(path.join(scratch,'course.html')),false);
  const assets=path.join(scratch,'assets','fragrance');
  assert.equal(fs.readdirSync(assets).length,17);
  assert.ok(fs.readFileSync(path.join(scratch,'fragrances.html'),'utf8').includes('id="fragrance-catalog"'));
  assert.ok(fs.readFileSync(path.join(scratch,'_redirects'),'utf8').includes('/fragrances /fragrances.html 200'));
 }finally{fs.rmSync(scratch,{recursive:true,force:true})}
});
