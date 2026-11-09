import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';

const backend=await readFile(new URL('../functions/henry-streaming-reminders.mjs',import.meta.url),'utf8');
const customerUI=await readFile(new URL('../admin/streaming-reminders.js',import.meta.url),'utf8');
const accountUI=await readFile(new URL('../admin/netflix-account-planner.js',import.meta.url),'utf8');
const page=await readFile(new URL('../admin/streaming-reminders.html',import.meta.url),'utf8');
const script=backend.replace(/^import .*$/gm,'').replace('export default async','const handler=async')+'\nreturn handler;';
const day=()=>{
 const t=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return ['year','month','day'].map(k=>t.find(x=>x.type===k)?.value).join('-');
};
const plus=n=>{const d=new Date(day()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const sample=(id,date=plus(18))=>({
 id,customer:'Test Subscriber',service:'Netflix',status:'active',
 dueDate:date,plan:'PRIVATE',amount:'3500.00',
 notes:'Netflix provider-side account payment date: '+plus(5)+' (not customer payment due).',
 createdAt:'2026-10-01T12:00:00Z'
});
function harness(){
 const email='owner@example.invalid',secret='x'.repeat(40);
 const db=new Map();
 const getStore=name=>{
  if(!db.has(name))db.set(name,new Map());
  const m=db.get(name);
  return {
   list:async({prefix})=>({blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}),
   get:async key=>m.get(key)||null,
   setJSON:async(key,value)=>m.set(key,structuredClone(value))
  };
 };
 const handler=new Function('crypto','getStore','process','Response','URL',script+'\nreturn handler;')(
  crypto,getStore,{env:{HENRY_ADMIN_EMAIL:email,HENRY_SESSION_SECRET:secret}},Response,URL);
 const token=Buffer.from(JSON.stringify({email,exp:Date.now()+3600000})).toString('base64url');
 const cookie=token+'.'+crypto.createHmac('sha256',secret).update(token).digest('base64url');
 const call=async(action='overview',body=null,context='production',authorized=true)=>{
  const request=new Request('https://test.invalid/?action='+action,{
   method:body?'POST':'GET',
   headers:authorized?{cookie:'henry_session='+cookie}:{},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  const res=await handler(request,{deploy:{context}});
  return {status:res.status,data:await res.json()};
 };
 return {db,getStore,call};
}
test('inactive requires owner confirmation and warns when a future renewal date exists',async()=>{
 const h=harness(),s=sample('netflix-lifecycle-001');
 await h.getStore('henry-amc').setJSON('streaming/'+s.id,s);
 const input={subscriptionId:s.id,revision:s.createdAt,command:'inactive',confirmed:true,reason:'Customer stopped service'};
 assert.equal((await h.call('set_customer_status',input,'production',false)).status,401);
 assert.equal((await h.call('set_customer_status',{...input,acknowledgedPaidThrough:true},'deploy-preview')).status,403);
 assert.equal((await h.call('set_customer_status',input)).status,400);
 const change=await h.call('set_customer_status',{...input,acknowledgedPaidThrough:true});
 assert.equal(change.status,200);
 assert.equal(change.data.lifecycle.customerStatus,'inactive');
 assert.equal(change.data.lifecycle.inactiveSince,day());
 const saved=await h.getStore('henry-amc').get('streaming/'+s.id);
 assert.equal(saved.dueDate,s.dueDate);
 assert.equal(saved.notes,s.notes);
 assert.equal(saved.statusHistory.length,1);
 const view=await h.call('overview');
 const row=view.data.subscriptions.find(x=>x.id===s.id);
 assert.equal(row.category,'inactive');
 assert.equal(row.customerStatus,'inactive');
 assert.equal(row.archiveSuggested,false);
 assert.equal((await h.call('set_customer_status',{
  subscriptionId:s.id,revision:saved.updatedAt,command:'archive',confirmed:true,acknowledgedPaidThrough:true
 })).status,409);
 assert.equal(h.db.get('henry-finance-phase1')?.size||0,0);
});
test('60-day archive suggestion never archives automatically and requires owner approval',async()=>{
 const h=harness(),s={...sample('netflix-lifecycle-002'),status:'inactive',inactiveSince:plus(-61),updatedAt:'2026-08-01T00:00:00Z'};
 await h.getStore('henry-amc').setJSON('streaming/'+s.id,s);
 const before=await h.call('overview');
 assert.equal(before.data.subscriptions[0].archiveSuggested,true);
 assert.equal((await h.getStore('henry-amc').get('streaming/'+s.id)).status,'inactive');
 const action={subscriptionId:s.id,revision:s.updatedAt,command:'archive',acknowledgedPaidThrough:true};
 assert.equal((await h.call('set_customer_status',action)).status,400);
 const archived=await h.call('set_customer_status',{...action,confirmed:true,reason:'Owner approved'});
 assert.equal(archived.status,200);
 assert.equal(archived.data.lifecycle.customerStatus,'archived');
 const saved=await h.getStore('henry-amc').get('streaming/'+s.id);
 assert.equal(saved.notes,s.notes);
 assert.ok(saved.archivedAt);
 assert.equal(saved.statusHistory.at(-1).to,'archived');
 assert.equal((await h.call('overview')).data.subscriptions[0].customerStatus,'archived');
 const restored=await h.call('set_customer_status',{
  subscriptionId:s.id,revision:saved.updatedAt,command:'reactivate',confirmed:true,reason:'Customer returned'});
 assert.equal(restored.status,200);
 assert.equal(restored.data.lifecycle.customerStatus,'active');
 assert.equal(restored.data.lifecycle.inactiveSince,'');
 const restoredRecord=await h.getStore('henry-amc').get('streaming/'+s.id);
 assert.equal(restoredRecord.statusHistory.length,2);
 assert.equal(restoredRecord.notes,s.notes);
 assert.equal(restoredRecord.id,s.id);
 assert.equal(h.db.get('henry-finance-phase1')?.size||0,0);
});
test('provider-side original import and owner-updated dates remain separate from customer inactivity',async()=>{
 const h=harness(),a=sample('netflix-source-original'),b=sample('netflix-owner-current');
 const c={...sample('netflix-conflicting-source'),accountPaymentDate:plus(6)};
 const d={...sample('netflix-source-missing'),notes:'No provider date was supplied'};
 const e={...sample('netflix-source-invalid'),notes:'Netflix provider-side account payment date: bad-date'};
 for(const s of [a,b,c,d,e])await h.getStore('henry-amc').setJSON('streaming/'+s.id,s);
 await h.getStore('henry-streaming-reminders').setJSON('account-updates/'+b.id,{
  subscriptionId:b.id,currentDueDate:plus(38),sourceType:'manual'});
 const response=await h.call('overview'),rows=response.data.accountUpdates;
 assert.equal(response.status,200);
 assert.equal(rows.find(r=>r.subscriptionId===a.id).dateIntegrity,'ok');
 assert.equal(rows.find(r=>r.subscriptionId===b.id).dateIntegrity,'owner_updated');
 assert.equal(rows.find(r=>r.subscriptionId===b.id).accountDueDate,plus(38));
 assert.equal(rows.find(r=>r.subscriptionId===c.id).dateIntegrity,'conflict');
 assert.equal(rows.find(r=>r.subscriptionId===d.id).dateIntegrity,'missing');
 assert.equal(rows.find(r=>r.subscriptionId===e.id).dateIntegrity,'invalid');
 assert.equal(response.data.dateAudit.needsReview,3);
 const change=await h.call('set_customer_status',{
  subscriptionId:a.id,revision:a.createdAt,command:'inactive',confirmed:true,
  acknowledgedPaidThrough:true,reason:'Inactive customer'});
 assert.equal(change.status,200);
 const after=await h.call('overview');
 assert.equal(after.data.accountUpdates.find(r=>r.subscriptionId===a.id).accountDueDate,plus(5));
 assert.equal(after.data.accountUpdates.find(r=>r.subscriptionId===a.id).customerStatus,'inactive');
 assert.equal(after.data.dateAudit.needsReview,3);
 assert.deepEqual(await h.getStore('henry-streaming-reminders').get('account-updates/'+b.id),
  {subscriptionId:b.id,currentDueDate:plus(38),sourceType:'manual'});
});
test('legacy paused customer can start an explicit inactivity clock without making payments',async()=>{
 const h=harness(),s={...sample('netflix-legacy-paused'),status:'paused'};
 await h.getStore('henry-amc').setJSON('streaming/'+s.id,s);
 const existing=(await h.call('overview')).data.subscriptions[0];
 assert.equal(existing.customerStatus,'inactive');
 assert.equal(existing.inactiveSince,'');
 assert.equal(existing.archiveSuggested,false);
 const action=await h.call('set_customer_status',{
  subscriptionId:s.id,revision:s.createdAt,command:'inactive',
  confirmed:true,acknowledgedPaidThrough:true,reason:'Begin 60-day review'});
 assert.equal(action.status,200);
 assert.equal(action.data.lifecycle.inactiveSince,day());
});
test('customer status filters and provider integrity tools are displayed; assets are versioned',()=>{
 assert.ok(page.includes('id="lifecycle-filter"'));
 assert.ok(page.includes('value="archive_review"'));
 assert.ok(page.includes('id="archive-review-notice"'));
 assert.ok(page.includes('id="provider-date-audit"'));
 assert.ok(page.includes('value="date_review"'));
 assert.ok(page.includes('streaming-reminders.js?v=20261109n'));
 assert.ok(customerUI.includes("action==='set_customer_status'")===false);
 assert.ok(customerUI.includes("api('set_customer_status','POST'"));
 assert.ok(accountUI.includes("modeState.statusFilter==='date_review'"));
 assert.ok(accountUI.includes("data.dateAudit"));
 assert.doesNotThrow(()=>new Function(customerUI));
 assert.doesNotThrow(()=>new Function(accountUI));
 assert.doesNotThrow(()=>new Function(script));
});
