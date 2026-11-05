import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isoDate,guyanaToday,toCents,fromCents,calculateMembership,nextExpectedBills,validLinkId} from '../functions/henry-finance-logic.mjs';

const src=await readFile(new URL('../functions/henry-finance.mjs',import.meta.url),'utf8');
const client=await readFile(new URL('../admin/henry-finance.js',import.meta.url),'utf8');
const reportSrc=await readFile(new URL('../admin/henry-finance-report.js',import.meta.url),'utf8');
const financePage=await readFile(new URL('../admin/henry-finance.html',import.meta.url),'utf8');
const ownerEmail='owner@test.invalid',secret='z'.repeat(40);
const stores=new Map();
const getStore=name=>{
  if(!stores.has(name))stores.set(name,new Map());
  const map=stores.get(name);
  return {
    list:async({prefix})=>({blobs:[...map.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key}))}),
    get:async(key)=>map.get(key)||null,
    setJSON:async(key,value)=>map.set(key,structuredClone(value))
  };
};
const backend=new Function('crypto','getStore','process','Response','URL',
 'isoDate','guyanaToday','toCents','fromCents','calculateMembership','nextExpectedBills','validLinkId',
 src.replace(/^import .*$/gm,'').replace('export default async','const handler=async')+
 '\nreturn handler;')(crypto,getStore,{env:{HENRY_ADMIN_EMAIL:ownerEmail,HENRY_SESSION_SECRET:secret}},
 Response,URL,isoDate,guyanaToday,toCents,fromCents,calculateMembership,nextExpectedBills,validLinkId);
const claims=Buffer.from(JSON.stringify({email:ownerEmail,exp:Date.now()+3600000})).toString('base64url');
const cookie=claims+'.'+crypto.createHmac('sha256',secret).update(claims).digest('base64url');
const call=async(action,method='GET',body={},preview='production',session=cookie)=>{
  const res=await backend(new Request('https://test.invalid/?action='+action,{
    method,headers:session?{cookie:'henry_session='+session}:{},
    ...(method==='POST'?{body:JSON.stringify(body)}:{})
  }),{deploy:{context:preview}});
  return {status:res.status,data:await res.json()};
};
const reportContext={};
new Function('globalThis',reportSrc)(reportContext);

test('one-step member receipt is owner-only and requires explicit verified funds',async()=>{
  const result=await call('record_verified_member_payment','POST',{membershipId:'missing'},'production','');
  assert.equal(result.status,401);
  const blocked=await call('record_verified_member_payment','POST',{membershipId:'missing'},'deploy-preview');
  assert.equal(blocked.status,403);
  const unconfirmed=await call('record_verified_member_payment','POST',{membershipId:'missing'});
  assert.equal(unconfirmed.status,400);
});
test('member profiles alone are not payments; two checked 15000 fees produce exactly 30000',async()=>{
  const a=await call('add_membership','POST',{customer:'Sample A',monthlyFee:'15000',mailboxCode:'ONE'});
  const b=await call('add_membership','POST',{customer:'Sample B',monthlyFee:'15000',mailboxCode:'TWO'});
  assert.equal(a.status,201);assert.equal(b.status,201);
  assert.equal((await call('bootstrap')).data.receipts.length,0);
  const on=guyanaToday();
  const data={membershipId:a.data.item.id,months:1,amountGyd:'15000',method:'MMG',
    receivedDate:on,reference:'MMG-REAL-001',confirmedReceived:true,notes:'MMG account checked'};
  const one=await call('record_verified_member_payment','POST',data);
  assert.equal(one.status,201);assert.equal(one.data.item.status,'verified');
  assert.equal((await call('record_verified_member_payment','POST',
    {...data,membershipId:b.data.item.id,reference:'mmg real 001'})).status,409);
  const second=await call('record_verified_member_payment','POST',{...data,membershipId:b.data.item.id,reference:'MMG-REAL-002'});
  assert.equal(second.status,201);
  const snap=(await call('bootstrap')).data;
  assert.deepEqual(snap.memberships.map(x=>x.verifiedPaymentCount),[1,1]);
  assert.equal(reportContext.HenryFinanceReport.monthlyCollected(snap).total,30000);
  assert.equal(stores.get('henry-memberships')?.size||0,0);
  assert.equal(stores.get('henry-amc')?.size||0,0);
});
test('existing pending receipt can be verified instead of entered twice',async()=>{
 const member=(await call('bootstrap')).data.memberships[0];
 const today=guyanaToday();
 const receipt=await call('add_receipt','POST',{relatedType:'membership',membershipId:member.id,
  amountGyd:'15000',months:1,method:'MMG',reference:'PENDING-MMG-003',receivedDate:today});
 assert.equal(receipt.status,201);assert.equal(receipt.data.item.status,'pending');
 assert.equal((await call('record_verified_member_payment','POST',{membershipId:member.id,
  amountGyd:'15000',months:1,method:'MMG',reference:'PENDING-MMG-003',
  receivedDate:today,confirmedReceived:true})).status,409);
 assert.equal((await call('decide_receipt','POST',{id:receipt.data.item.id,decision:'verified'})).status,200);
});
test('invalid amount, future date and generic reference cannot become verified cash',async()=>{
 const member=(await call('bootstrap')).data.memberships[0];
 const today=guyanaToday();
 const base={membershipId:member.id,amountGyd:'15000',months:1,method:'MMG',
  reference:'UNIQUE-REF-004',receivedDate:today,confirmedReceived:true};
 const future=new Date(today+'T12:00:00Z');future.setUTCDate(future.getUTCDate()+1);
 assert.equal((await call('record_verified_member_payment','POST',{...base,receivedDate:future.toISOString().slice(0,10)})).status,400);
 assert.equal((await call('record_verified_member_payment','POST',{...base,reference:'CASH'})).status,400);
 assert.equal((await call('record_verified_member_payment','POST',{...base,amountGyd:'950'})).status,400);
});
test('member payment UX keeps it on the same tab, clearly separates fee from collection',()=>{
 assert.ok(client.includes('function renderQuickMemberForm()'));
 assert.ok(client.includes('Confirm paid &amp; update dashboard'));
 assert.ok(client.includes('data-quick-verify'));
 assert.ok(client.includes('state.quickMemberId'));
 assert.ok(client.includes("quickmember:'record_verified_member_payment'"));
 assert.ok(financePage.includes('henry-finance.js?v=20261105f'));
 assert.doesNotThrow(()=>new Function(client));
 assert.doesNotThrow(()=>new Function(src.replace(/^import .*$/gm,'').replace('export default async','const handler=async')));
});
