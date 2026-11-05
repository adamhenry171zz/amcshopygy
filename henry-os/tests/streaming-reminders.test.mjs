import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';

const backend=await readFile(new URL('../functions/henry-streaming-reminders.mjs',import.meta.url),'utf8');
const frontend=await readFile(new URL('../admin/streaming-reminders.js',import.meta.url),'utf8');
const page=await readFile(new URL('../admin/streaming-reminders.html',import.meta.url),'utf8');
const deploy=await readFile(new URL('../../deploy-henry-os/inject.mjs',import.meta.url),'utf8');
const index=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');

const pure=backend.slice(backend.indexOf('const isoDate='),backend.indexOf('export default async'));
const helpers=new Function('const clean=(v,max=2000)=>String(v??"").trim().slice(0,max);'+pure+
  '; return {isoDate,classify,stageFor};')();

function browserSuite(records,logs=[],today='2026-11-05'){
 const cutoff=frontend.indexOf("$('reload').addEventListener");
 assert.ok(cutoff>0,'browser startup anchor must exist');
 const h=new Function('location',frontend.slice(0,cutoff)+
  ';return {state,filteredRows,canPrepare,matchDate,matchStatus,dedupeRecipients,validateQueueMessage,phone,plusDays};')({hostname:'amcshopping.com'});
 h.state.data={
  today,subscriptions:records,logs,
  settings:{friendlyTemplate:'Hi {{firstName}}, renew {{service}} on {{dueDate}}.',
   dayTemplate:'Hi {{firstName}}, due today.',
   followupTemplate:'Hi {{firstName}}, please confirm renewal.',
   recommendedUpdate:'Ask AMC about Prime Video.'}
 };
 return h;
}
const s=(id,date,overrides={})=>({
 id,customer:'Customer '+id,whatsapp:'5926123000',service:'Netflix',plan:'Premium',
 dueDate:date,amount:'5000',status:'active',category:date<'2026-11-05'?'past_date':
 date==='2026-11-05'?'due_today':'upcoming',
 stage:date<'2026-11-05'?'follow_up':date==='2026-11-05'?'due_today':'upcoming',...overrides
});

test('client/server JavaScript parse',()=>{
 assert.doesNotThrow(()=>new Function(frontend));
 assert.doesNotThrow(()=>new Function(backend.replace(/^import .*$/gm,'').replace('export default async','const handler=async')));
});

test('due-date categories and arbitrary future due dates are eligible for manual drafting',()=>{
 assert.equal(helpers.isoDate('2026-11-05'),'2026-11-05');
 assert.equal(helpers.isoDate('2026-02-30'),'');
 assert.equal(helpers.classify('','2026-11-05'),'needs_date');
 assert.equal(helpers.classify('2026-11-04','2026-11-05'),'past_date');
 assert.equal(helpers.classify('2026-11-05','2026-11-05'),'due_today');
 assert.equal(helpers.classify('2026-11-12','2026-11-05'),'due_soon');
 assert.equal(helpers.classify('2026-12-20','2026-11-05'),'upcoming');
 assert.equal(helpers.stageFor('past_date'),'follow_up');
 assert.equal(helpers.stageFor('due_today'),'due_today');
 assert.equal(helpers.stageFor('upcoming'),'upcoming');
 assert.equal(helpers.stageFor('needs_date'),'');
});

test('all date filters: today, tomorrow, next 3, next 7, overdue, exact, inclusive range, multiple, all',()=>{
 const rows=[s('a','2026-11-05'),s('b','2026-11-06'),s('c','2026-11-07'),
  s('d','2026-11-11'),s('e','2026-11-12'),s('f','2026-11-04')];
 const h=browserSuite(rows);
 const match=(filter)=>{h.state.dateFilter=filter;return h.filteredRows().map(x=>x.id).sort().join(',')};
 assert.equal(match('today'),'a');
 assert.equal(match('tomorrow'),'b');
 assert.equal(match('days3'),'a,b,c');
 assert.equal(match('days7'),'a,b,c,d');
 assert.equal(match('overdue'),'f');
 h.state.specific='2026-11-12';assert.equal(match('specific'),'e');
 h.state.from='2026-11-06';h.state.to='2026-11-11';assert.equal(match('range'),'b,c,d');
 h.state.from='2026-11-11';h.state.to='2026-11-06';assert.equal(match('range'),'');
 h.state.dates=new Set(['2026-11-05','2026-11-12']);
 assert.equal(match('multiple'),'a,e');
 assert.equal(match('all'),'a,b,c,d,e,f');
});

test('status and phone safeguards exclude prior reminders, missing numbers and inactive accounts',()=>{
 const rows=[s('a','2026-11-05'),s('b','2026-11-05',{whatsapp:''}),
  s('c','2026-11-05',{status:'paused',category:'inactive',stage:''}),
  s('d','2026-11-05')];
 const logs=[{subscriptionId:'d',dueDate:'2026-11-05',stage:'due_today',sentAt:'2026-11-05T10:00:00Z'}];
 const h=browserSuite(rows,logs);
 assert.deepEqual(h.filteredRows().map(x=>x.id),['a']);
 h.state.statusFilter='attention';assert.deepEqual(h.filteredRows().map(x=>x.id),['b','c']);
 h.state.statusFilter='sent';assert.deepEqual(h.filteredRows().map(x=>x.id),['d']);
 h.state.statusFilter='all';assert.equal(h.filteredRows().length,4);
 assert.equal(h.canPrepare(rows[0]),true);
 assert.equal(h.canPrepare(rows[1]),false);
 assert.equal(h.canPrepare(rows[2]),false);
 assert.equal(h.canPrepare(rows[3]),false);
});

test('deduplicates same WhatsApp recipient, service and due-date within batch',()=>{
 const h=browserSuite([]);
 const x=s('a','2026-11-05',{whatsapp:'601 0001'});
 const y=s('b','2026-11-05',{whatsapp:'+592 6010001'});
 const z=s('c','2026-11-06',{whatsapp:'6010001'});
 const q=s('d','2026-11-05',{whatsapp:'6010001',service:'Disney+'});
 const {unique,duplicates}=h.dedupeRecipients([x,y,z,q]);
 assert.equal(duplicates,1);
 assert.deepEqual(unique.map(x=>x.id),['a','c','d']);
 assert.equal(h.phone('6010001'),'5926010001');
});

test('prior cycle message requires explicitly-approved follow-up before next-stage draft',()=>{
 const a=s('a','2026-11-05');
 const logs=[{subscriptionId:'a',dueDate:'2026-11-05',stage:'upcoming',sentAt:'2026-11-01T10:00:00Z'}];
 const h=browserSuite([a],logs);
 assert.equal(h.filteredRows().length,0);
 h.state.statusFilter='sent';assert.equal(h.filteredRows().length,1);
 assert.throws(()=>h.validateQueueMessage(a),/intentional follow-up/);
 h.state.followups.add('a');assert.match(h.validateQueueMessage(a),/Hi a/);
 h.state.includeUpdate.add('a');
 assert.throws(()=>h.validateQueueMessage(a),/opted in/);
 h.state.consents.add('a');assert.match(h.validateQueueMessage(a),/Prime Video/);
});

test('admin deployment preserves prior customer records and does not automatically send WhatsApp',()=>{
 assert.ok(backend.includes("getStore('henry-amc')"));
 assert.ok(backend.includes("readAll(source,'streaming/')"));
 assert.ok(!backend.includes('source.setJSON('));
 assert.ok(!backend.includes('source.delete('));
 assert.ok(backend.includes("getStore('henry-streaming-reminders')"));
 assert.ok(backend.includes("context?.deploy?.context!=='production'"));
 assert.ok(backend.includes('body.confirmedSent!==true'));
 assert.ok(backend.includes('body.includedRecommendation===true&&body.marketingConsentConfirmed!==true'));
 assert.ok(!backend.includes('fetch('));
 assert.ok(frontend.includes('https://wa.me/'));
 assert.ok(frontend.includes('window.open('));
 assert.ok(frontend.includes('actually-sent'));
 assert.ok(frontend.includes('customer opted in to promotional updates'));
 assert.ok(page.includes('Date range'));
 assert.ok(page.includes('Multiple chosen dates'));
 assert.ok(page.includes('select-visible'));
 assert.ok(index.includes('href="/admin/streaming-reminders.html"'));
 for(const filename of ['streaming-reminders.html','streaming-reminders.js','streaming-reminders.css','henry-streaming-reminders.mjs'])
  assert.ok(deploy.includes("'"+filename+"'"));
});

test('server requires owner and signed session, rejects duplicate same-stage sent log',async()=>{
 const secret='S'.repeat(40),owner='owner@example.invalid';
 const payload=Buffer.from(JSON.stringify({email:owner,exp:Date.now()+3600000})).toString('base64url');
 const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 const cookie='henry_session='+payload+'.'+sig;
 const stores=new Map();
 const getStore=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const m=stores.get(name);
  return {
   list:async({prefix})=>({blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}),
   get:async key=>m.get(key)||null,
   setJSON:async(key,value)=>m.set(key,structuredClone(value))
  };
 };
 const handler=new Function('crypto','getStore','process','Response','URL','Buffer',
  backend.replace(/^import .*$/gm,'').replace('export default async','const handler=async')+
  ';return handler;')(crypto,getStore,{env:{HENRY_ADMIN_EMAIL:owner,HENRY_SESSION_SECRET:secret}},Response,URL,Buffer);
 const localToday=(()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(k=>p.find(x=>x.type===k)?.value).join('-')})();
 const future=new Date(localToday+'T12:00:00Z');future.setUTCDate(future.getUTCDate()+20);
 const dueDate=future.toISOString().slice(0,10);
 const original={id:'n1',customer:'Test Subscriber',whatsapp:'5926010001',service:'Netflix',dueDate,status:'active',amount:'5000'};
 await getStore('henry-amc').setJSON('streaming/n1',original);
 const call=async(action,method='GET',body={},cookieValue=cookie,context='production')=>{
  const headers=new Headers(cookieValue?{cookie:cookieValue}:{});
  const r=await handler(new Request('https://test.invalid/?action='+action,{method,headers,
   ...(method==='POST'?{body:JSON.stringify(body)}:{})}),{deploy:{context}});
  return {status:r.status,data:await r.json()};
 };
 assert.equal((await call('overview','GET',{},'')).status,401);
 const overview=await call('overview');
 assert.equal(overview.data.subscriptions[0].stage,'upcoming');
 assert.equal((await call('mark_sent','POST',{subscriptionId:'n1',dueDate,stage:'upcoming',message:'Hi, please renew'} ,cookie,'deploy-preview')).status,403);
 const body={subscriptionId:'n1',dueDate,stage:'upcoming',message:'Hi, please renew your Netflix subscription',confirmedSent:true,includedRecommendation:false};
 assert.equal((await call('mark_sent','POST',{...body,confirmedSent:false})).status,400);
 assert.equal((await call('mark_sent','POST',{...body,includedRecommendation:true})).status,400);
 assert.equal((await call('mark_sent','POST',body)).status,201);
 assert.equal((await call('mark_sent','POST',body)).status,409);
 assert.equal((await call('overview')).data.logs.length,1);
 assert.deepEqual(await getStore('henry-amc').get('streaming/n1'),original);
});
