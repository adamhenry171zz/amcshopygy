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
 delete:async k=>{data.delete(k);etags.delete(k)},
 list:async({prefix})=>({blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})};
}
const src=await readFile(new URL('../functions/henry-shein-quotes.mjs',import.meta.url),'utf8');
const stripped=src.replace(/^import .*;$/gm,'').replace('export default async(req,context)=>','const handler=async(req,context)=>');
test('owner-only approval, preview isolation, screenshot retrieval, payment checks',async()=>{
 const production=fakeStore(),preview=fakeStore(),secret='x'.repeat(40),email='owner@example.invalid';
 const ownerPayload=Buffer.from(JSON.stringify({email,exp:Date.now()+600000})).toString('base64url');
 const cookie='henry_session='+ownerPayload+'.'+crypto.createHmac('sha256',secret).update(ownerPayload).digest('base64url');
 const calls=[];const mockExtract=async(images,retailer)=>{calls.push(images.length);return {items:[item(10)],evidence:['mock screenshot'],warnings:[],checkoutNotes:'',inputTokens:100,outputTokens:20,estimatedUsd:.001}};
 const handler=new Function('crypto','getStore','getDeployStore','text','safeSheinLink','normalizeItems','quoteTotals','deliveryWindow','parseCartText','validateScreenshot','safeRetailLink','retailer','extractImages','reserveAttempt','renderQuotePdf','RATES','normalizeRates','publicEstimate','process','Response','URL','Buffer',stripped+'\nreturn handler;')(crypto,()=>production,()=>preview,rules.text,rules.safeSheinLink,rules.normalizeItems,rules.quoteTotals,rules.deliveryWindow,rules.parseCartText,rules.validateScreenshot,rules.safeRetailLink,rules.retailer,mockExtract,reserveAttempt,renderQuotePdf,rules.RATES,rules.normalizeRates,rules.publicEstimate,{env:{HENRY_SESSION_SECRET:secret,HENRY_ADMIN_EMAIL:email,AMC_SMART_SHEIN_ENABLE_PRODUCTION:'true',OPENAI_API_KEY:'mock-only'}},Response,URL,Buffer);
 const ctx={deploy:{context:'deploy-preview'}},live={deploy:{context:'production'}};
 async function call(action,body=null,auth=false,context=ctx,id=''){
  const r=await handler(new Request('https://preview.invalid/.netlify/functions/henry-shein-quotes?action='+action+(id?'&id='+id:''),{method:body===null?'GET':'POST',headers:{...(auth?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body===null?undefined:JSON.stringify(body)}),context);
  return {status:r.status,data:await r.json()};
 }
 assert.equal((await call('admin_list')).status,401);
 assert.equal((await call('admin_ai_usage')).status,401);
 const initialUsage=await call('admin_ai_usage',null,true);assert.equal(initialUsage.data.dailyRemaining,20);assert.equal(initialUsage.data.monthlyRemaining,100);
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
 // New customer: the dedicated approval action works without saving as review first.
 const direct=await call('submit',{name:'Direct Test',whatsapp:'+592 6000001',retailer:'Amazon',usConfirmed:true,items:[item()]});
 assert.equal(direct.status,201);
 const directId=(await call('admin_list',null,true)).data.quotes.find(q=>q.reference===direct.data.reference).id;
 const directBody={...draft,id:directId,version:1,retailer:'Amazon',approve:true};
 const blocked=await call('admin_save',directBody,true);assert.equal(blocked.status,400);assert.match(blocked.data.error,/freight review/);
 const ready=await call('admin_save',{...directBody,freightAcknowledged:true},true);
 assert.equal(ready.status,200);assert.equal(ready.data.quote.status,'approved');assert.equal(ready.data.quote.totals.overall,4700);assert.equal(ready.data.quote.delivery.arrivalFrom,'2026-12-08');
 const settings=await call('admin_pricing',null,true);assert.deepEqual(settings.data.rates,{overall:360,down:240});
 assert.equal((await call('admin_pricing_save',{rates:{overall:320,down:250},version:0})).status,401);
 assert.equal((await call('admin_pricing_save',{rates:{overall:200,down:250},version:0},true)).status,400);
 const changed=await call('admin_pricing_save',{rates:{overall:320,down:250},version:0},true);assert.equal(changed.status,200);
 const estimate=await call('estimate',{items:[{price:100,weight:0}]});assert.equal(estimate.data.overall,32000);assert.equal(estimate.data.down,25000);assert.equal(estimate.data.rates,undefined);
 assert.equal((await call('admin_pricing_save',{rates:{overall:350,down:240},version:0},true)).status,409);
 assert.equal((await call('admin_pricing',null,true,live)).data.rates.overall,360);
 const fresh=await call('submit',{name:'Custom Rate Test',whatsapp:'+592 6000002',retailer:'Amazon',usConfirmed:true,items:[item(100)]});assert.equal(fresh.status,201);
 const freshId=(await call('admin_list',null,true)).data.quotes.find(q=>q.reference===fresh.data.reference).id;
 assert.deepEqual((await call('admin_get',null,true,ctx,freshId)).data.quote.rates,{overall:320,down:250});
 const custom=await call('admin_save',{...directBody,id:freshId,items:[item(100)],freightAcknowledged:true,rates:{overall:340,down:245}},true);assert.equal(custom.status,200);assert.equal(custom.data.quote.totals.overall,34000);assert.equal(custom.data.quote.totals.down,24500);
 const locked=await call('admin_save',{...directBody,id:freshId,version:2,status:'sent',freightAcknowledged:true,rates:{overall:999,down:100}},true);assert.equal(locked.status,200);assert.equal(locked.data.quote.totals.overall,34000);assert.deepEqual(locked.data.quote.rates,{overall:340,down:245});
 assert.equal((await call('admin_get',null,true,ctx,directId)).data.quote.totals.overall,4700);
 const png={mime:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII='};
 assert.equal((await call('admin_upload_create',{kind:'owner'})).status,401);
 const code=await call('admin_upload_create',{kind:'reseller',name:'Test reseller',limit:5,hours:24,maxUses:1},true);assert.equal(code.status,201);
 const accessCode=code.data.code;assert.equal((await call('upload_check',{accessCode})).data.limit,5);
 assert.equal((await call('upload_check',{accessCode},false,live)).status,400);
 assert.equal((await call('upload_start',{accessCode,count:6})).status,400);
 const opened=await call('upload_start',{accessCode,count:5});assert.equal(opened.status,200);const sessionId=opened.data.sessionId;
 assert.equal((await call('upload_start',{accessCode,count:5})).status,400);
 assert.equal((await call('upload_image',{sessionId,accessCode,index:5,screenshot:png})).status,400);
 assert.equal((await call('upload_image',{sessionId,accessCode:'AMC-'+'x'.repeat(32),index:0,screenshot:png})).status,400);
 const extended={sessionId,accessCode,name:'Large Cart',whatsapp:'+592 6000003',retailer:'Amazon',usConfirmed:true,aiConsent:true};
 assert.equal((await call('submit',extended)).status,400);
 for(let i=0;i<5;i++)assert.equal((await call('upload_image',{sessionId,accessCode,index:i,screenshot:png})).status,200);
 assert.equal((await call('submit',extended)).status,201);
 const ext=await call('admin_get',null,true,ctx,sessionId);assert.equal(ext.data.quote.screenshotCount,5);assert.equal(ext.data.quote.screenshots.length,0);assert.deepEqual(ext.data.quote.extendedScreenshots,[0,1,2,3,4]);
 const evidenceUrl='https://preview.invalid/.netlify/functions/henry-shein-quotes?action=admin_evidence&id='+sessionId+'&index=4';
 assert.equal((await handler(new Request(evidenceUrl),ctx)).status,401);
 assert.equal((await handler(new Request(evidenceUrl,{headers:{cookie}}),ctx)).headers.get('content-type'),'image/png');
 assert.equal((await call('admin_upload_codes',null,true)).data.codes[0].code,undefined);
 assert.equal((await call('admin_ai',{id:sessionId,version:1})).status,401);
 const batch1=await call('admin_ai',{id:sessionId,version:1},true);assert.equal(batch1.data.ai.state,'partial');assert.equal(batch1.data.ai.nextIndex,3);
 const batch2=await call('admin_ai',{id:sessionId,version:1},true);assert.equal(batch2.data.ai.state,'ready');assert.equal(batch2.data.ai.nextIndex,5);assert.deepEqual(calls,[1]);assert.ok(batch2.data.ai.warnings.some(w=>w.includes('Duplicate screenshot')));
 const cached=await call('admin_ai',{id:sessionId,version:1},true);assert.equal(cached.data.cached,true);assert.deepEqual(calls,[1]);
 const usage=await call('admin_ai_usage',null,true);assert.equal(usage.data.today,1);assert.equal(usage.data.dailyRemaining,19);assert.equal(usage.data.monthlyRemaining,99);
 assert.equal((await call('admin_upload_cleanup',{},true)).data.removed,0);
 assert.equal((await handler(new Request(evidenceUrl,{headers:{cookie}}),ctx)).status,200);
 assert.equal((await call('admin_upload_revoke',{id:code.data.access.id},true)).status,200);
 assert.equal((await call('upload_image',{sessionId,accessCode,index:0,screenshot:png})).status,400);
 const ownerCode=await call('admin_upload_create',{kind:'owner'},true);assert.equal(ownerCode.data.access.limit,30);assert.equal(ownerCode.data.access.expiresAt,null);
 assert.equal((await call('submit',{...extended,sessionId:undefined,screenshots:[png,png,png,png]})).status,400);
 const pdfUrl='https://preview.invalid/.netlify/functions/henry-shein-quotes?action=admin_pdf&id='+directId;
 const unauthorized=await handler(new Request(pdfUrl),ctx);assert.equal(unauthorized.status,401);
 const pdf=await handler(new Request(pdfUrl,{headers:{cookie}}),ctx);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('content-type'),'application/pdf');assert.ok(Buffer.from(await pdf.arrayBuffer()).toString('latin1').startsWith('%PDF-1.4'));

});

test('retailer rules keep SHEIN freight separate and Amazon arrival shorter',()=>{
 assert.equal(rules.quoteTotals([item(10,2,5)],0,0,'Amazon').heavyShippingGyd,0);
 assert.equal(rules.deliveryWindow('2026-12-01','Amazon').arrivalFrom,'2026-12-08');
 assert.equal(rules.safeRetailLink('https://www.amazon.com/dp/test','Amazon'),'https://www.amazon.com/dp/test');
 assert.throws(()=>rules.safeRetailLink('https://amazon.com.evil.invalid','Amazon'));
});
test('AI output is conservative and budget increments atomically',async()=>{
 const result=cleanResult({items:[{name:'Shirt',size:'M',color:'Black',price:10,qty:null,weight:null,currency:'EUR',sku:'',evidence:'uncertain'}],warnings:[],checkoutNotes:'verify'},'Amazon');
 assert.equal(result.items[0].price,null);assert.equal(result.items[0].qty,1);assert.ok(result.warnings.some(w=>w.includes('quantity defaulted to 1')));assert.ok(result.warnings.length);
 const sized=cleanResult({items:[{name:'Bag',size:'',color:'Black',price:10,qty:null,weight:null,currency:'USD',sku:'',evidence:''},{name:'Sneakers',size:'US 9',color:'Blue',price:12,qty:2,weight:null,currency:'USD',sku:'',evidence:''},{name:'Dress',size:'N/A',color:'Red',price:12,qty:1,weight:null,currency:'USD',sku:'',evidence:''}],warnings:[],checkoutNotes:''},'Amazon');
 assert.deepEqual(sized.items.map(x=>x.size),['One Size','US 9','One Size']);assert.ok(sized.warnings.some(x=>x.includes('Product 1: size defaulted')));assert.ok(sized.warnings.some(x=>x.includes('Product 3: size defaulted')));assert.ok(!sized.warnings.some(x=>x.includes('Product 2: size defaulted')));
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
 assert.ok(result.includes('data-card-service-estimator'));assert.ok(result.includes('data-shein-item-calculator'));assert.ok(result.includes('smart-quote-estimates.js'));assert.ok(!result.includes('USD × GYD $360'));
 assert.ok(result.indexOf('id="smart-shein-quote"')<result.indexOf('id="payment-estimator"'));
 assert.ok(result.indexOf('id="payment-estimator"')<result.indexOf('id="shein-calculator"'));
 assert.equal((result.match(/name="sq-retailer"/g)||[]).length,9);
 assert.equal((result.match(/id="quote-form"/g)||[]).length,1);
 assert.ok(!result.includes('name="amc-quotation-request"'));
 assert.ok(!result.includes('class="quote-how"'));
 assert.ok(!result.includes('src="assets/shein-calculator.js"'));
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

test('approval UI reports exact missing fields and freight conditions',async()=>{
 const js=await readFile(new URL('../admin/smart-shein-admin.js',import.meta.url),'utf8');
 const start=js.indexOf(' function approvalProblems('),end=js.indexOf(' async function save(',start);
 assert.ok(start>=0&&end>start);
 const check=new Function(js.slice(start,end)+'\nreturn approvalProblems;')();
 const opts={retailer:'Amazon',orderTuesday:'2026-12-01',feesUsd:'0',extraGyd:'0',feeNote:'',weightsAcknowledged:true,freightAcknowledged:true};
 const valid={name:'Test',price:'13.00',qty:'1',size:'N/A',color:'Black',weight:''};
 assert.deepEqual(check([valid],opts),[]);
 assert.ok(check([] ,opts).some(x=>x.includes('at least one')));
 assert.ok(check([{...valid,size:'',qty:''}],opts).some(x=>x.includes('size')&&x.includes('quantity')));
 assert.ok(check([valid],{...opts,freightAcknowledged:false}).some(x=>x.includes('freight')));
 assert.ok(check([valid],{...opts,weightsAcknowledged:false}).some(x=>x.includes('unknown-weight')));
 assert.ok(check([valid],{...opts,extraGyd:'500'}).some(x=>x.includes('Describe')));
});

test('custom rates reconcile, retain heavy freight, and do not expose rates in estimates',()=>{
 const t=rules.quoteTotals([item(100,1,4)],0,0,'SHEIN',{overall:320,down:250});assert.deepEqual([t.overall,t.down,t.balance],[38000,25000,13000]);
 assert.throws(()=>rules.normalizeRates({overall:200,down:240}));
 const e=rules.publicEstimate([{price:100,weight:0}],{overall:320,down:250});assert.deepEqual([e.overall,e.down,e.balance],[32000,25000,7000]);assert.equal(e.rates,undefined);
 const q={name:'Test',whatsapp:'0000000',reference:'SQ-RATE',retailer:'Amazon',status:'approved',items:[item(100)],rates:{overall:320,down:250},totals:rules.quoteTotals([item(100)],0,0,'Amazon',{overall:320,down:250}),delivery:rules.deliveryWindow('2026-12-01','Amazon'),approvedAt:'2026-11-26'};
 const pdf=renderQuotePdf(q).toString('latin1');assert.ok(pdf.includes('$32,000'));assert.ok(pdf.includes('$25,000'));assert.ok(pdf.includes('$7,000'));assert.ok(!pdf.includes('x GYD $240'));
});

test('numbered products and WhatsApp messages use saved totals and references, not rates',async()=>{
 const js=await readFile(new URL('../admin/smart-shein-admin.js',import.meta.url),'utf8');
 const start=js.indexOf(' function waPhone('),end=js.indexOf(' function refreshWhatsApp(',start);
 const {waPhone,quotationMessage}=new Function(js.slice(start,end)+'\nreturn {waPhone,quotationMessage};')();
 assert.equal(waPhone('600-0000'),'5926000000');assert.equal(waPhone('+592 600-0000'),'5926000000');assert.equal(waPhone('123'),'');
 const q={name:'Test Person',retailer:'Amazon',reference:'SQ-TEST',totals:{overall:36000,down:24000,balance:12000},rates:{overall:360,down:240},delivery:{arrivalFrom:'2026-12-08',arrivalTo:'2026-12-15'}};
 const message=quotationMessage(q);assert.ok(message.includes('SQ-TEST'));assert.ok(message.includes('GYD $36,000'));assert.ok(message.includes('GYD $24,000'));assert.ok(message.includes('GYD $12,000'));assert.ok(message.includes('estimated, not guaranteed'));assert.ok(!message.includes('multiplier'));assert.ok(quotationMessage(q,true).includes('shop with us again'));
 assert.ok(js.includes("textContent='Product '+(i+1)"));assert.ok(js.includes('field.remove();renumberProducts()'));
 const publicJs=await readFile(new URL('../public/smart-shein-quote.js',import.meta.url),'utf8');
 const s=publicJs.indexOf(' function notifyMessage('),e=publicJs.indexOf(' function showConfirmation(',s);
 const notify=new Function(publicJs.slice(s,e)+'\nreturn notifyMessage;')();
 assert.match(notify('Test','SHEIN','SQ-TEST'),/Reference:\* SQ-TEST/);assert.ok(publicJs.includes('https://wa.me/5926042826?text='));
});
