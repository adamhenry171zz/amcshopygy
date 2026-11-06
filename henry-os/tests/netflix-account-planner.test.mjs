import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';

const backend=await readFile(new URL('../functions/henry-streaming-reminders.mjs',import.meta.url),'utf8');
const client=await readFile(new URL('../admin/netflix-account-planner.js',import.meta.url),'utf8');
const html=await readFile(new URL('../admin/streaming-reminders.html',import.meta.url),'utf8');
const deploy=await readFile(new URL('../../deploy-henry-os/inject.mjs',import.meta.url),'utf8');

const guyanaToday=()=>{
 const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 return ['year','month','day'].map(k=>p.find(x=>x.type===k)?.value).join('-');
};
const plus=(value,days)=>{
 const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
};
const srcNoImports=backend.replace(/^import .*$/gm,'').replace('export default async','const handler=async');
const createHarness=()=>{
 const secret='X'.repeat(40),email='owner@example.invalid';
 const stores=new Map();
 const getStore=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const map=stores.get(name);
  return {
   list:async({prefix})=>({blobs:[...map.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}),
   get:async key=>map.get(key)||null,
   setJSON:async(key,value)=>map.set(key,structuredClone(value))
  };
 };
 const handler=new Function('getStore','crypto','process','Response','URL',
  srcNoImports+'\nreturn handler;')(getStore,crypto,{env:{HENRY_ADMIN_EMAIL:email,HENRY_SESSION_SECRET:secret}},Response,URL);
 const claims=Buffer.from(JSON.stringify({email,exp:Date.now()+3600000})).toString('base64url');
 const token=claims+'.'+crypto.createHmac('sha256',secret).update(claims).digest('base64url');
 const call=async(action,method='GET',data={},context='production',session=token)=>{
  const request=new Request('https://test.invalid/?action='+action,{
   method,headers:session?{cookie:'henry_session='+session}:{},
   ...(method==='POST'?{body:JSON.stringify(data)}:{})
  });
  const res=await handler(request,{deploy:{context}});
  return {status:res.status,data:await res.json()};
 };
 return {stores,getStore,call};
};
test('parses source and client JavaScript and stages planner assets',()=>{
 assert.doesNotThrow(()=>new Function(srcNoImports));
 assert.doesNotThrow(()=>new Function(client));
 assert.match(html,/id="accounts-mode"/);
 assert.match(html,/id="customer-mode"/);
 assert.match(html,/ACCOUNT PAYMENT DATE/);
 assert.match(html,/netflix-account-planner\.js/);
 assert.match(deploy,/'netflix-account-planner\.js'/);
});

test('owner-only overview recovers provider dates from the original Netflix import notes',async()=>{
 const {getStore,call}=createHarness(),today=guyanaToday();
 const accountDate=plus(today,3),customerDate=plus(today,14);
 const raw={id:'netflix-import123456789',customer:'Example Name',service:'Netflix',
  dueDate:customerDate,status:'active',plan:'PRIVATE',accountEmail:'secret@example.invalid',
  notes:'Imported from N/ACCOUNTS / Sheet1. Netflix provider-side account payment date: '+accountDate+' (not customer payment due).'};
 await getStore('henry-amc').setJSON('streaming/'+raw.id,raw);
 const blocked=await call('overview','GET',{},'production','');
 assert.equal(blocked.status,401);
 const response=await call('overview');
 assert.equal(response.status,200);
 const row=response.data.accountUpdates[0];
 assert.equal(row.accountDueDate,accountDate);
 assert.equal(row.customerDueDate,customerDate);
 assert.equal(row.importedAccountDate,accountDate);
 assert.equal(row.status,'payment_to_check');
 assert.equal(row.dateSource,'Original Netflix import');
 assert.equal(JSON.stringify(row).includes('secret@example.invalid'),false);
 assert.deepEqual(await getStore('henry-amc').get('streaming/'+raw.id),raw);
});

test('provider payment then completed service update advances only next provider date',async()=>{
 const {getStore,call,stores}=createHarness(),today=guyanaToday();
 const current=plus(today,3),next=plus(today,35),customer=plus(today,12);
 const sub={id:'netflix-cycle1234567',customer:'Subscriber',service:'Netflix',status:'active',
  dueDate:customer,notes:'Netflix provider-side account payment date: '+current+' (not customer payment due).'};
 await getStore('henry-amc').setJSON('streaming/'+sub.id,sub);
 const base={subscriptionId:sub.id,accountDueDate:current,note:'Provider billing reviewed'};
 assert.equal((await call('account_payment','POST',{...base,confirmedPaid:false})).status,400);
 assert.equal((await call('account_payment','POST',{...base,confirmedPaid:true},'deploy-preview')).status,403);
 const paid=await call('account_payment','POST',{...base,confirmedPaid:true});
 assert.equal(paid.status,200);
 assert.equal(paid.data.account.status,'update_required');
 assert.equal(paid.data.account.dateSource,'Original Netflix import');
 assert.equal((await call('account_payment','POST',{...base,confirmedPaid:true})).status,409);
 assert.equal((await call('account_updated','POST',{...base,confirmedUpdated:true,nextAccountDueDate:current})).status,400);
 const updated=await call('account_updated','POST',{...base,confirmedUpdated:true,nextAccountDueDate:next});
 assert.equal(updated.status,200);
 assert.equal(updated.data.account.accountDueDate,next);
 assert.equal(updated.data.account.customerDueDate,customer);
 assert.equal(updated.data.account.status,'payment_to_check');
 assert.equal(updated.data.account.historyCount,1);
 assert.equal(updated.data.account.dateSource,'Owner-updated');
 assert.equal((await call('account_payment','POST',{...base,confirmedPaid:true})).status,409);
 assert.deepEqual(await getStore('henry-amc').get('streaming/'+sub.id),sub);
 assert.ok(stores.get('henry-streaming-reminders').has('account-updates/'+sub.id));
 assert.ok(!stores.has('henry-finance-phase1'));
 assert.ok(!stores.has('henry-finance'));
});

test('missing and invalid account dates are review-only until manually corrected',async()=>{
 const {getStore,call}=createHarness(),today=guyanaToday(),next=plus(today,9);
 const sub={id:'netflix-missing1234',customer:'Customer',service:'Netflix',status:'active',dueDate:today,notes:'Imported; no provider date.'};
 await getStore('henry-amc').setJSON('streaming/'+sub.id,sub);
 const start=await call('overview');
 assert.equal(start.data.accountUpdates[0].status,'needs_date');
 const base={subscriptionId:sub.id,accountDueDate:'',newAccountDueDate:next,confirmedReview:true};
 assert.equal((await call('set_account_date','POST',{...base,note:'bad'})).status,400);
 assert.equal((await call('set_account_date','POST',{...base,note:'Checked provider account renewal date'})).status,200);
 const reloaded=await call('overview');
 assert.equal(reloaded.data.accountUpdates[0].accountDueDate,next);
 assert.deepEqual(await getStore('henry-amc').get('streaming/'+sub.id),sub);
});
test('customer due and provider due filters stay separate, includes recently updated filter',()=>{
 const cut=client.lastIndexOf('bindAccountPlanner();');
 assert.ok(cut>0);
 const h=new Function('document',client.slice(0,cut)+'\nreturn {modeState,filteredAccounts};')({});
 const today='2026-11-05';
 const item=(id,date,extra={})=>({
  subscriptionId:id,customer:id,service:'Netflix',plan:'PRIVATE',status:'payment_to_check',
  accountDueDate:date,customerDueDate:'2026-11-30',...extra
 });
 h.modeState.today=today;
 h.modeState.rows=[item('a','2026-11-05'),item('b','2026-11-06'),
  item('c','2026-11-11'),item('d','2026-11-12'),item('old','2026-11-04'),
  item('missing','',{status:'needs_date'})];
 h.modeState.dateFilter='days7';
 assert.deepEqual(h.filteredAccounts().map(x=>x.subscriptionId),['a','b','c']);
 h.modeState.dateFilter='overdue';
 assert.deepEqual(h.filteredAccounts().map(x=>x.subscriptionId),['old']);
 h.modeState.dateFilter='specific';h.modeState.specific='2026-11-12';
 assert.deepEqual(h.filteredAccounts().map(x=>x.subscriptionId),['d']);
 h.modeState.dateFilter='range';h.modeState.from='2026-11-06';h.modeState.to='2026-11-11';
 assert.deepEqual(h.filteredAccounts().map(x=>x.subscriptionId),['b','c']);
 h.modeState.dateFilter='all';h.modeState.statusFilter='needs_date';
 assert.deepEqual(h.filteredAccounts().map(x=>x.subscriptionId),['missing']);
});
