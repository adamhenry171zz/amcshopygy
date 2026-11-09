import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../functions/henry-streaming-reminders.mjs',import.meta.url),'utf8');
const browser=await readFile(new URL('../admin/streaming-reminders.js',import.meta.url),'utf8');
const page=await readFile(new URL('../admin/streaming-reminders.html',import.meta.url),'utf8');
const report=await readFile(new URL('../admin/henry-finance-report.js',import.meta.url),'utf8');
const server=api.replace(/^import .*$/gm,'').replace('export default async','const handler=async');
const today=()=>{
 const t=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return ['year','month','day'].map(k=>t.find(p=>p.type===k).value).join('-');
};
const days=n=>{const t=new Date(today()+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
const fixture=id=>({
 id,customer:'Healey',service:'Netflix',status:'active',plan:'PRIVATE',amount:'3500.00',
 whatsapp:'5926012323',dueDate:'',notes:'Netflix provider-side account payment date: '+days(10)+' (not customer payment due)',
 createdAt:'2026-11-01T08:00:00Z'
});
function harness(){
 const email='owner@example.invalid',secret='s'.repeat(40);
 const stores=new Map();
 const getStore=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const m=stores.get(name);
  return {list:async({prefix})=>({blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}),
   get:async k=>m.get(k)||null,setJSON:async(k,v)=>m.set(k,structuredClone(v))};
 };
 const handler=new Function('crypto','getStore','process','Response','URL',
  server+'\nreturn handler;')(crypto,getStore,{env:{HENRY_ADMIN_EMAIL:email,HENRY_SESSION_SECRET:secret}},Response,URL);
 const claims=Buffer.from(JSON.stringify({email,exp:Date.now()+3600000})).toString('base64url');
 const cookie=claims+'.'+crypto.createHmac('sha256',secret).update(claims).digest('base64url');
 const call=async(action,body={},deployment='production',authorized=true)=>{
  const res=await handler(new Request('https://test.invalid/?action='+action,{
   method:'POST',headers:authorized?{cookie:'henry_session='+cookie}:{},
   body:JSON.stringify(body)
  }),{deploy:{context:deployment}});
  return {status:res.status,data:await res.json()};
 };
 return {getStore,stores,call};
}

test('customer with missing due date can be edited in place without adding cash',async()=>{
 const h=harness(),old=fixture('netflix-healey-missing');
 await h.getStore('henry-amc').setJSON('streaming/'+old.id,old);
 const data={subscriptionId:old.id,expectedDueDate:'',revision:old.createdAt,
  customer:'Healey',plan:'PRIVATE',whatsapp:old.whatsapp,
  amount:'3500',dueDate:days(20)};
 assert.equal((await h.call('edit_customer',data,'production',false)).status,401);
 assert.equal((await h.call('edit_customer',data,'deploy-preview')).status,403);
 assert.equal((await h.call('edit_customer',data)).status,200);
 const next=await h.getStore('henry-amc').get('streaming/'+old.id);
 assert.equal(next.dueDate,data.dueDate);
 assert.equal(next.notes,old.notes);
 assert.equal(next.id,old.id);
 assert.equal(next.service,'Netflix');
 assert.equal(h.stores.get('henry-finance-phase1')?.size||0,0);
 assert.equal((await h.call('edit_customer',data)).status,409);
});

test('owner can record verified early cash even when prior customer due date is missing',async()=>{
 const h=harness(),old=fixture('netflix-no-original-date');
 await h.getStore('henry-amc').setJSON('streaming/'+old.id,old);
 const paid={subscriptionId:old.id,previousDueDate:'',nextDueDate:days(30),
  amountGyd:'3500',receivedDate:today(),method:'MMG',reference:'MMG-HEALEY-999',
  confirmedReceived:true};
 assert.equal((await h.call('record_customer_paid',{...paid,confirmedReceived:false})).status,400);
 assert.equal((await h.call('record_customer_paid',paid)).status,201);
 const updated=await h.getStore('henry-amc').get('streaming/'+old.id);
 assert.equal(updated.dueDate,paid.nextDueDate);
 assert.equal(updated.notes,old.notes);
 assert.equal((await h.call('record_customer_paid',paid)).status,409);
 const receipts=[...h.stores.get('henry-finance-phase1').values()];
 assert.equal(receipts.length,1);
 assert.equal(receipts[0].status,'verified');
 assert.equal(receipts[0].applied,true);
 const ctx={};new Function('globalThis',report)(ctx);
 assert.equal(ctx.HenryFinanceReport.monthlyCollected({
  asOf:today(),legacyPayments:[],receipts}).total,3500);
});

test('date corrections cannot fabricate payment and a missing date never disables edit or paid actions',()=>{
 assert.ok(browser.includes('data-edit-customer'));
 assert.ok(browser.includes('function renderCustomerDetailsEditor(s)'));
 assert.ok(browser.includes("const canRecord=s.category!=='inactive'"));
 assert.ok(browser.includes('Confirm Paid &amp; Update Renewal'));
 assert.ok(page.indexOf('id="customer-list"')<page.indexOf('id="customer-payment-panel"'));
 assert.ok(page.indexOf('id="customer-payment-panel"')<page.indexOf('id="queue-title"'));
 assert.ok(page.includes('streaming-reminders.js?v=20261109k'));
 assert.ok(!browser.includes('if(!s||!isDate(s.dueDate)||'));
 assert.doesNotThrow(()=>new Function(browser));
 assert.doesNotThrow(()=>new Function(server));
});
