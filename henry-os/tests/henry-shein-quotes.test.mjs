import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import * as rules from '../functions/henry-shein-quote-rules.mjs';
const item=(price=13,qty=1,weight=null)=>({name:'Test shirt',size:'M',color:'Black',price,qty,weight,link:'',sku:'',image:''});
test('AMC calculations, fees, upward rounding and reconciliation',()=>{
 const r=rules.quoteTotals([item()]);assert.deepEqual([r.overall,r.down,r.balance],[4700,3200,1500]);
 assert.equal(rules.quoteTotals([item(10,2,3)]).heavyShippingGyd,0);
 assert.equal(rules.quoteTotals([item(10,2,3.01)]).heavyShippingGyd,9030);
 const h=rules.quoteTotals([item(10,3,5)]);assert.deepEqual([h.overall,h.down,h.balance],[33300,7200,26100]);
 const f=rules.quoteTotals([item(10)],2,300);assert.deepEqual([f.overall,f.down,f.balance],[4700,2900,1800]);
 assert.equal(r.unknownWeights,1);
 const c=rules.quoteTotals([item(.01,3),item(13.99)]);assert.deepEqual([c.overall,c.down,c.balance],[5100,3400,1700]);
});
test('dates, cart export and URL validation',()=>{
 assert.deepEqual(rules.deliveryWindow(rules.nextTuesday('2026-11-26')),{orderTuesday:'2026-12-01',arrivalFrom:'2026-12-15',arrivalTo:'2026-12-22'});
 assert.throws(()=>rules.deliveryWindow('2026-12-02'));
 const [r]=rules.parseCartText('Name\tPrice\tSize\tColour\nShirt\t$9.99\tM\tBlack');assert.equal(r.qty,null);assert.equal(r.price,9.99);
 assert.throws(()=>rules.parseCartText('Name\tPrice\tCurrency\nShirt\t9.99\tEUR'));
 assert.throws(()=>rules.safeSheinLink('https://shein.com.evil.invalid/'));
 assert.throws(()=>rules.normalizeItems([{name:'Shirt',price:12,qty:null}],{complete:true}));
});
function fakeStore(){
 const data=new Map(),etags=new Map();let version=0;
 return {get:async k=>data.has(k)?structuredClone(data.get(k)):null,
 getWithMetadata:async k=>data.has(k)?{data:structuredClone(data.get(k)),etag:etags.get(k)}:null,
 setJSON:async(k,v,opts={})=>{if(opts.onlyIfNew&&data.has(k)||opts.onlyIfMatch&&etags.get(k)!==opts.onlyIfMatch)return {modified:false};data.set(k,structuredClone(v));etags.set(k,String(++version));return {modified:true,etag:etags.get(k)}},
 list:async({prefix})=>({blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})};
}
const src=await readFile(new URL('../functions/henry-shein-quotes.mjs',import.meta.url),'utf8');
const stripped=src.replace(/^import .*;$/gm,'').replace('export default async(req,context)=>','const handler=async(req,context)=>');
test('owner-only approval, preview isolation, screenshot retrieval, payment checks',async()=>{
 const production=fakeStore(),preview=fakeStore(),secret='x'.repeat(40),email='owner@example.invalid';
 const ownerPayload=Buffer.from(JSON.stringify({email,exp:Date.now()+600000})).toString('base64url');
 const cookie='henry_session='+ownerPayload+'.'+crypto.createHmac('sha256',secret).update(ownerPayload).digest('base64url');
 const handler=new Function('crypto','getStore','getDeployStore','text','safeSheinLink','normalizeItems','quoteTotals','deliveryWindow','parseCartText','validateScreenshot','process','Response','URL','Buffer',stripped+'\nreturn handler;')(crypto,()=>production,()=>preview,rules.text,rules.safeSheinLink,rules.normalizeItems,rules.quoteTotals,rules.deliveryWindow,rules.parseCartText,rules.validateScreenshot,{env:{HENRY_SESSION_SECRET:secret,HENRY_ADMIN_EMAIL:email}},Response,URL,Buffer);
 const ctx={deploy:{context:'deploy-preview'}},live={deploy:{context:'production'}};
 async function call(action,body=null,auth=false,context=ctx,id=''){
  const r=await handler(new Request('https://preview.invalid/.netlify/functions/henry-shein-quotes?action='+action+(id?'&id='+id:''),{method:body===null?'GET':'POST',headers:{...(auth?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body===null?undefined:JSON.stringify(body)}),context);
  return {status:r.status,data:await r.json()};
 }
 assert.equal((await call('admin_list')).status,401);
 const submitted=await call('submit',{name:'Test Customer',whatsapp:'+592 6000000',usConfirmed:true,cartLink:'https://onelink.shein.com/example',items:[item()],screenshots:[{mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII='}]});
 assert.equal(submitted.status,201);
 const queue=await call('admin_list',null,true);assert.equal(queue.data.quotes.length,1);assert.equal(queue.data.quotes[0].screenshotCount,1);assert.equal(queue.data.quotes[0].screenshots,undefined);
 assert.equal((await call('admin_list',null,true,live)).data.quotes.length,0);
 const id=queue.data.quotes[0].id;
 const detail=await call('admin_get',null,true,ctx,id);assert.equal(detail.data.quote.screenshots.length,1);
 const draft={id,version:1,items:[item()],feesUsd:0,extraGyd:0,orderTuesday:'2026-12-01',payments:[],weightsAcknowledged:true,followUp:'2026-12-02',status:'approved'};
 assert.equal((await call('admin_save',draft,true)).status,400); // cannot skip review
 const review=await call('admin_save',{...draft,status:'review'},true);assert.equal(review.status,200);
 assert.equal((await call('admin_save',{...draft,version:2,weightsAcknowledged:false},true)).status,400);
 const approved=await call('admin_save',{...draft,version:2},true);assert.equal(approved.status,200);assert.equal(approved.data.quote.totals.overall,4700);
 assert.equal((await call('admin_save',{...draft,version:2},true)).status,409);
 const sent=await call('admin_save',{...draft,version:3,status:'sent',items:[item(1)]},true);assert.equal(sent.status,200);assert.equal(sent.data.quote.totals.overall,4700); // approved price locked
 assert.equal((await call('admin_save',{...draft,version:4,status:'deposit_paid',payments:[{amount:100,date:'2026-12-01',reference:'MMG-test'}]},true)).status,400);
 const paid=await call('admin_save',{...draft,version:4,status:'deposit_paid',payments:[{amount:3200,date:'2026-12-01',reference:'MMG-test'}]},true);assert.equal(paid.status,200);
 assert.equal(paid.data.quote.payments.length,1);
});
