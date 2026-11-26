import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {cleanResult,extractImages,reserveAttempt} from '../functions/henry-smart-quote-ai.mjs';
import {renderQuotePdf} from '../functions/henry-smart-quote-pdf.mjs';
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
 const handler=new Function('crypto','getStore','getDeployStore','text','safeSheinLink','normalizeItems','quoteTotals','deliveryWindow','parseCartText','validateScreenshot','safeRetailLink','retailer','extractImages','reserveAttempt','renderQuotePdf','process','Response','URL','Buffer',stripped+'\nreturn handler;')(crypto,()=>production,()=>preview,rules.text,rules.safeSheinLink,rules.normalizeItems,rules.quoteTotals,rules.deliveryWindow,rules.parseCartText,rules.validateScreenshot,rules.safeRetailLink,rules.retailer,extractImages,reserveAttempt,renderQuotePdf,{env:{HENRY_SESSION_SECRET:secret,HENRY_ADMIN_EMAIL:email,AMC_SMART_SHEIN_ENABLE_PRODUCTION:'true'}},Response,URL,Buffer);
 const ctx={deploy:{context:'deploy-preview'}},live={deploy:{context:'production'}};
 async function call(action,body=null,auth=false,context=ctx,id=''){
  const r=await handler(new Request('https://preview.invalid/.netlify/functions/henry-shein-quotes?action='+action+(id?'&id='+id:''),{method:body===null?'GET':'POST',headers:{...(auth?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body===null?undefined:JSON.stringify(body)}),context);
  return {status:r.status,data:await r.json()};
 }
 assert.equal((await call('admin_list')).status,401);
 const submitted=await call('submit',{name:'Test Customer',whatsapp:'+592 6000000',usConfirmed:true,aiConsent:true,cartLink:'https://onelink.shein.com/example',items:[item()],screenshots:[{mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII='}]});
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

test('retailer rules keep SHEIN freight separate and Amazon arrival shorter',()=>{
 assert.equal(rules.quoteTotals([item(10,2,5)],0,0,'Amazon').heavyShippingGyd,0);
 assert.equal(rules.deliveryWindow('2026-12-01','Amazon').arrivalFrom,'2026-12-08');
 assert.equal(rules.safeRetailLink('https://www.amazon.com/dp/test','Amazon'),'https://www.amazon.com/dp/test');
 assert.throws(()=>rules.safeRetailLink('https://amazon.com.evil.invalid','Amazon'));
});
test('AI output is conservative and budget increments atomically',async()=>{
 const result=cleanResult({items:[{name:'Shirt',size:'M',color:'Black',price:10,qty:null,weight:null,currency:'EUR',sku:'',evidence:'uncertain'}],warnings:[],checkoutNotes:'verify'},'Amazon');
 assert.equal(result.items[0].price,null);assert.equal(result.items[0].qty,null);assert.ok(result.warnings.length);
 const store=fakeStore();for(let i=0;i<20;i++)await reserveAttempt(store,'2026-11-26T00:00:00Z');
 await assert.rejects(()=>reserveAttempt(store,'2026-11-26T00:00:00Z'));
});
test('mock vision request: response normalized, duplicates removed',async()=>{
 const img={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII='};
 const r=await extractImages([img,img],'Amazon',{apiKey:'test-only',fetcher:async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);assert.equal(payload.store,false);
  assert.equal(payload.input[1].content.filter(x=>x.type==='input_image').length,1);
  return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({items:[{name:'Test',size:'N/A',color:'Black',price:12,qty:2,weight:null,currency:'USD',sku:'',evidence:'$12 x 2'}],warnings:[],checkoutNotes:''})}]}],usage:{input_tokens:1000,output_tokens:100}}));
 }});
 assert.equal(r.items[0].qty,2);assert.equal(r.imageCount,1);assert.ok(r.estimatedUsd>0);
});

test('customer layout keeps both original calculators unchanged and removes competing request',async()=>{
 const {redesignQuotePage}=await import('../../deploy-smart-shein/quote-layout.mjs');
 const original=await readFile(new URL('../../quote.html',import.meta.url),'utf8');
 const v55=await readFile(new URL('../../deploy-v55/inject.mjs',import.meta.url),'utf8');
 const estimator=v55.match(/const estimator = `([\s\S]*?)`;/)?.[1];
 assert.ok(estimator);
 const seeded=original.replace('<main>',()=>'<main>'+estimator).replace('</main>',()=>'<section class="quote-how"><p>Old instructions</p></section></main>');
 const shein=seeded.match(/<section id="shein-calculator"[^>]*>[\s\S]*?<\/section>/)[0];
 const result=redesignQuotePage(seeded);
 assert.ok(result.includes(estimator));assert.ok(result.includes(shein));
 assert.ok(result.indexOf('id="smart-shein-quote"')<result.indexOf('id="payment-estimator"'));
 assert.ok(result.indexOf('id="payment-estimator"')<result.indexOf('id="shein-calculator"'));
 assert.equal((result.match(/name="sq-retailer"/g)||[]).length,9);
 assert.equal((result.match(/id="quote-form"/g)||[]).length,1);
 assert.ok(!result.includes('name="amc-quotation-request"'));
 assert.ok(!result.includes('class="quote-how"'));
 assert.ok(result.includes('assets/shein-calculator.js'));
 assert.ok(!result.includes('src="assets/quote.js"'));
 assert.ok(result.includes('id="sq-consent"'));assert.ok(result.includes('id="sq-us"'));
 assert.equal(redesignQuotePage(result),result);
 assert.throws(()=>redesignQuotePage(original));
});

test('Premium Blue PDF uses approved totals and supports multiple pages',()=>{
 const items=Array.from({length:30},(_,i)=>({...item(13,1),name:'Product '+(i+1)+' with long selected variation and descriptive name'}));
 const q={name:'Fictional Test',whatsapp:'+592 6000000',reference:'SQ-TEST',retailer:'Amazon',items,status:'approved',approvedAt:'2026-11-26T10:00:00Z',totals:rules.quoteTotals(items,0,0,'Amazon'),delivery:rules.deliveryWindow('2026-12-01','Amazon')};
 const pdf=renderQuotePdf(q),s=pdf.toString('latin1');
 assert.ok(s.startsWith('%PDF-1.4'));assert.ok(s.includes('BALANCE ON ARRIVAL'));assert.ok(s.includes('AMOUNT DUE ON ARRIVAL'));assert.ok(s.includes('GYD $'+q.totals.balance.toLocaleString('en-US')));assert.ok(s.includes('/Logo Do'));assert.ok(Number(s.match(/\/Count (\d+)/)[1])>1);
 assert.throws(()=>renderQuotePdf({...q,status:'review'}));
});
