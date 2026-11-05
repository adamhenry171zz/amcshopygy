import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const admin=await readFile(new URL('../admin/app.js',import.meta.url),'utf8');
const finance=await readFile(new URL('../admin/henry-finance.js',import.meta.url),'utf8');
const backend=await readFile(new URL('../functions/henry-finance.mjs',import.meta.url),'utf8');
const reportSource=await readFile(new URL('../admin/henry-finance-report.js',import.meta.url),'utf8');
const tracker=await readFile(new URL('../admin/membership-tracker.js',import.meta.url),'utf8');
const index=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');

test('new Finance receipts can link directly to existing Members Club members',()=>{
 assert.ok(backend.includes("selection.startsWith('legacy:')"));
 assert.ok(backend.includes("getStore('henry-memberships').get('members/'+legacyMembershipId"));
 assert.ok(backend.includes('legacyMembershipId,streamingId,months,agreedFee,historical'));
 assert.ok(finance.includes('Existing Members Club'));
 assert.ok(finance.includes('data-record-member="legacy:'));
 assert.ok(tracker.includes('member=legacy:'));
 assert.ok(finance.includes("new URLSearchParams(location.search).get('member')"));
 assert.ok(!backend.includes("setJSON('members/"));
});

test('verified member payments totaling GYD 30000 appear as cash, pending and historical do not',()=>{
 const ctx={};
 new Function('globalThis',reportSource)(ctx);
 const result=ctx.HenryFinanceReport.summarize({
  asOf:'2026-11-05',streaming:[],legacyMembers:[{id:'a'},{id:'b'}],
  receipts:[
   {relatedType:'membership',legacyMembershipId:'a',amountGyd:'15000',status:'verified',receivedDate:'2026-11-05',historical:false},
   {relatedType:'membership',legacyMembershipId:'b',amountGyd:'15000',status:'verified',receivedDate:'2026-11-05',historical:false},
   {relatedType:'membership',amountGyd:'9000',status:'pending',receivedDate:'2026-11-05'},
   {relatedType:'membership',amountGyd:'5000',status:'verified',receivedDate:'2026-10-31',historical:true},
  ]
 });
 assert.equal(result.receivedToday,30000);
 assert.equal(result.receivedMonth,30000);
 assert.equal(result.memberReceivedMonth,30000);
 assert.equal(result.historicalMemberVerified,5000);
});

test('service catalog lists actual Netflix subscribers without inventing catalog status',()=>{
 const start=admin.indexOf('function renderServiceCatalog(){');
 const end=admin.indexOf('function renderMailboxes(){',start);
 assert.ok(start>0&&end>start);
 const render=new Function('list','esc',admin.slice(start,end)+'return renderServiceCatalog;')(
  type=>type==='streaming_services'?[]:type==='streaming'?[
   {service:'Netflix',status:'active'},
   {service:'Netflix',status:'active'},
   {service:'Disney+',status:'paused'}
  ]:[],x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;')
 );
 const html=render();
 assert.match(html,/Netflix/);
 assert.match(html,/2 active \/ 2 total/);
 assert.match(html,/Disney\+/);
 assert.match(html,/0 active \/ 1 total/);
 assert.match(html,/Detected from existing customer subscriptions/);
 assert.match(html,/Optional template — no customers assumed/);
 assert.match(html,/Not configured/);
});

test('catalog changes are manual, no subscriber record is overwritten',()=>{
 const section=admin.slice(admin.indexOf('function renderServiceCatalog(){'),admin.indexOf('function renderMailboxes(){'));
 assert.ok(!section.includes("amcApi('save'"));
 assert.ok(admin.includes('data-catalog-setup'));
 assert.ok(admin.includes("openModal('streaming_services',null,"));
 assert.ok(!backend.includes("await legacyAMC.setJSON"));
});

test('owner-only verification remains required with duplicate and fee safeguards',()=>{
 assert.ok(backend.includes('duplicateRef(existing,paymentMethod,reference)'));
 assert.ok(backend.includes("originalPayments.some("));
 assert.ok(backend.includes("status:'pending'"));
 assert.ok(backend.includes("old.status!=='pending'"));
 assert.ok(backend.includes('toCents(agreedFee)*months'));
 assert.ok(backend.includes("context?.deploy?.context!=='production'"));
});

test('versioned assets prevent old member and catalog scripts from persisting in cache',()=>{
 assert.ok(index.includes('app.js?v=20261105d'));
 assert.ok(index.includes('membership-tracker.js?v=20261105d'));
 assert.ok(index.includes('henry-finance-report.js?v=20261105d'));
 assert.ok(finance.includes('legacyMembershipId'));
});

test('browser and finance server source syntax remains valid',()=>{
 assert.doesNotThrow(()=>new Function(admin));
 assert.doesNotThrow(()=>new Function(finance));
 assert.doesNotThrow(()=>new Function(tracker));
 assert.doesNotThrow(()=>new Function(backend.replace(/^import .*$/gm,'').replace('export default async','const handler=async')));
});
