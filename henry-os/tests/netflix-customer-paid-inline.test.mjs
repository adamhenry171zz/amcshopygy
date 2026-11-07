import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';

const apiSource=await readFile(new URL('../functions/henry-streaming-reminders.mjs',import.meta.url),'utf8');
const browser=await readFile(new URL('../admin/streaming-reminders.js',import.meta.url),'utf8');
const html=await readFile(new URL('../admin/streaming-reminders.html',import.meta.url),'utf8');
const report=await readFile(new URL('../admin/henry-finance-report.js',import.meta.url),'utf8');
const server=apiSource.replace(/^import .*$/gm,'').replace('export default async','const handler=async')+'\nreturn handler;';
const today=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return ['year','month','day'].map(x=>p.find(z=>z.type===x).value).join('-');
};
const offset=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const account=()=>{const t=today();return {id:'netflix-test123456',customer:'Natalie',service:'Netflix',
 amount:'3500.00',dueDate:offset(t,5),status:'active',plan:'Private',
 notes:'Netflix provider-side account payment date: '+offset(t,8)+' (not customer payment due).'}};
const harness=()=>{
 const email='owner@example.invalid',secret='s'.repeat(40);
 const stores=new Map();
 const getStore=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const m=stores.get(name);
  return {list:async({prefix})=>({blobs:[...m.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}),
   get:async k=>m.get(k)||null,setJSON:async(k,v)=>m.set(k,structuredClone(v))};
 };
 const fn=new Function('getStore','crypto','process','Response','URL',server)(
  getStore,crypto,{env:{HENRY_ADMIN_EMAIL:email,HENRY_SESSION_SECRET:secret}},Response,URL);
 const blob=Buffer.from(JSON.stringify({email,exp:Date.now()+3600000})).toString('base64url');
 const cookie=blob+'.'+crypto.createHmac('sha256',secret).update(blob).digest('base64url');
 const call=async(action='overview',body=null,context='production',authenticated=true)=>{
  const response=await fn(new Request('https://test.invalid/?action='+action,{
   method:body?'POST':'GET',headers:authenticated?{cookie:'henry_session='+cookie}:{},
   ...(body?{body:JSON.stringify(body)}:{})
  }),{deploy:{context}});
  return {status:response.status,data:await response.json()};
 };
 return {getStore,stores,call};
};
const verifiedPayment=(a,opts={})=>({
 subscriptionId:a.id,previousDueDate:a.dueDate,nextDueDate:offset(a.dueDate,30),
 receivedDate:today(),amountGyd:'3500.00',method:'MMG',reference:'MMG-NATALIE-123',
 confirmedReceived:true,...opts
});

test('an authenticated owner can mark early payment and update ONLY customer dueDate',async()=>{
 const h=harness(),a=account();await h.getStore('henry-amc').setJSON('streaming/'+a.id,a);
 await h.getStore('henry-streaming-reminders').setJSON('logs/'+a.id+'/'+a.dueDate+'/upcoming',{
  subscriptionId:a.id,dueDate:a.dueDate,stage:'upcoming',sentAt:new Date().toISOString()});
 const pay=verifiedPayment(a);
 assert.equal((await h.call('record_customer_paid',{...pay,confirmedReceived:false})).status,400);
 assert.equal((await h.call('record_customer_paid',pay,'deploy-preview')).status,403);
 assert.equal((await h.call('record_customer_paid',pay,'production',false)).status,401);
 const success=await h.call('record_customer_paid',pay);
 assert.equal(success.status,201);
 const updated=await h.getStore('henry-amc').get('streaming/'+a.id);
 assert.equal(updated.dueDate,pay.nextDueDate);
 assert.equal(updated.notes,a.notes);
 assert.equal(updated.amount,a.amount);
 assert.equal(updated.accountEmail,a.accountEmail);
 const fin=[...h.stores.get('henry-finance-phase1').values()];
 assert.equal(fin.length,1);
 assert.equal(fin[0].status,'verified');
 assert.equal(fin[0].relatedType,'streaming');
 assert.equal(fin[0].streamingId,a.id);
 assert.equal(fin[0].applied,true);
 assert.equal(fin[0].receivedDate,pay.receivedDate);
 const state=await h.call();
 assert.equal(state.status,200);
 assert.equal(state.data.subscriptions[0].lastPayment.paidOn,pay.receivedDate);
 assert.equal(state.data.subscriptions[0].dueDate,pay.nextDueDate);
 assert.equal(state.data.accountUpdates[0].accountDueDate,offset(today(),8));
 assert.equal(state.data.logs.length,1);
 const mod={};new Function('globalThis',report)(mod);
 const ledger=mod.HenryFinanceReport.monthlyCollected({asOf:today(),legacyPayments:[],receipts:fin});
 assert.equal(ledger.total,3500);
});
test('duplicate references, amount mistakes and stale due dates are blocked',async()=>{
 const h=harness(),a=account();await h.getStore('henry-amc').setJSON('streaming/'+a.id,a);
 const good=verifiedPayment(a);
 assert.equal((await h.call('record_customer_paid',{...good,receivedDate:offset(today(),1)})).status,400);
 assert.equal((await h.call('record_customer_paid',{...good,nextDueDate:a.dueDate})).status,400);
 assert.equal((await h.call('record_customer_paid',{...good,reference:'CASH'})).status,400);
 assert.equal((await h.call('record_customer_paid',{...good,amountGyd:'950.00'})).status,409);
 await h.getStore('henry-amc').setJSON('payments/legacy-test',{status:'verified',reference:'OLD-EXISTS-555'});
 assert.equal((await h.call('record_customer_paid',{...good,reference:'old exists 555'})).status,409);
 const pass=await h.call('record_customer_paid',good);
 assert.equal(pass.status,201);
 assert.equal((await h.call('record_customer_paid',good)).status,409);
 assert.equal(h.stores.get('henry-finance-phase1').size,1);
});
test('persisted but unapplied receipt can resume with the same reference without double count',async()=>{
 const h=harness(),a=account(),old=h.getStore('henry-amc');
 await old.setJSON('streaming/'+a.id,a);
 // Simulate an actual receipt stored before the source-date update could finish.
 const pay=verifiedPayment(a);
 const normalized=pay.reference.toUpperCase().replace(/[^A-Z0-9]/g,'');
 const receiptId='streaming-'+crypto.createHash('sha256').update(normalized).digest('hex').slice(0,40);
 await h.getStore('henry-finance-phase1').setJSON('finance/receipts/'+receiptId,{
  id:receiptId,relatedType:'streaming',source:'reminder_inline_customer_paid',streamingId:a.id,
  previousDueDate:a.dueDate,nextDueDate:pay.nextDueDate,amountGyd:pay.amountGyd,
  receivedDate:pay.receivedDate,method:'MMG',reference:pay.reference,status:'verified',applied:false
 });
 const result=await h.call('record_customer_paid',pay);
 assert.equal(result.status,201);
 assert.equal(h.stores.get('henry-finance-phase1').size,1);
 assert.equal((await h.getStore('henry-finance-phase1').get('finance/receipts/'+receiptId)).applied,true);
 assert.equal((await old.get('streaming/'+a.id)).dueDate,pay.nextDueDate);
});
test('sent reminder is not treated as payment; row always offers Record Paid',()=>{
 assert.match(browser,/data-record-paid/);
 assert.match(browser,/Record Paid/);
 assert.match(browser,/function renderPaymentEditor/);
 assert.match(browser,/record_customer_paid/);
 assert.match(browser,/lastPayment/);
 assert.match(browser,/recently_paid/);
 assert.match(html,/id="customer-payment-panel"/);
 assert.match(html,/Paid recently \(30 days\)/);
 assert.doesNotThrow(()=>new Function(browser));
 assert.doesNotThrow(()=>new Function(apiSource.replace(/^import .*$/gm,'').replace('export default async','const handler=async')));
});
