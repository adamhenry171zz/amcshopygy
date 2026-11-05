import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isoDate,guyanaToday,toCents,fromCents,addMonthsClamped,calculateMembership,nextExpectedBills} from '../functions/henry-finance-logic.mjs';

test('rejects impossible dates and unsupported money amounts',()=>{
  assert.equal(isoDate('2026-02-29'),'');
  assert.equal(isoDate('2028-02-29'),'2028-02-29');
  assert.throws(()=>toCents('12.345'));
  assert.throws(()=>toCents('-20'));
  assert.equal(toCents('950.25'),95025);
  assert.equal(fromCents(95025),'950.25');
  assert.equal(guyanaToday(new Date('2026-11-05T02:00:00Z')),'2026-11-04');
});
test('early renewal extends paid coverage, not payment day',()=>{
  const member={id:'m1',customer:'Test'};
  const receipts=[
    {id:'a',status:'verified',relatedType:'membership',membershipId:'m1',receivedDate:'2026-11-20',months:1},
    {id:'b',status:'verified',relatedType:'membership',membershipId:'m1',receivedDate:'2026-12-15',months:1}
  ];
  assert.equal(calculateMembership(member,receipts,'2026-11-25').paidThrough,'2027-01-20');
  receipts.push({id:'pending',status:'pending',relatedType:'membership',membershipId:'m1',receivedDate:'2027-01-15',months:4});
  assert.equal(calculateMembership(member,receipts,'2026-11-25').paidThrough,'2027-01-20');
});
test('late renewal starts a fresh period without debt',()=>{
  const member={id:'m2'};
  const receipts=[
    {id:'a',status:'verified',relatedType:'membership',membershipId:'m2',receivedDate:'2026-10-20',months:1},
    {id:'b',status:'verified',relatedType:'membership',membershipId:'m2',receivedDate:'2026-11-25',months:1}
  ];
  assert.equal(calculateMembership(member,receipts,'2026-11-24').paidThrough,'2026-12-25');
  assert.equal(calculateMembership(member,receipts,'2026-12-26').status,'expired');
});
test('monthly anniversary survives short February and preserves whole term',()=>{
  assert.equal(addMonthsClamped('2027-01-31',1),'2027-02-28');
  assert.equal(addMonthsClamped('2027-01-31',2),'2027-03-31');
  assert.equal(calculateMembership({id:'m3'},[
    {id:'a',status:'verified',relatedType:'membership',membershipId:'m3',receivedDate:'2027-01-31',months:1},
    {id:'b',status:'verified',relatedType:'membership',membershipId:'m3',receivedDate:'2027-02-20',months:1}
  ],'2027-02-21').paidThrough,'2027-03-31');
});
test('supplier schedules are virtual and never mark charges paid',()=>{
  const profile={status:'active',firstDueDate:'2026-10-31',recurrence:'monthly'};
  assert.deepEqual(nextExpectedBills(profile,'2026-11-05',3),['2026-11-30','2026-12-31','2027-01-31']);
  assert.deepEqual(nextExpectedBills({...profile,status:'paused'},'2026-11-05'),[]);
});
test('phase1 API preserves all legacy collections and gates preview writes',async()=>{
  const server=await readFile(new URL('../functions/henry-finance.mjs',import.meta.url),'utf8');
  const build=await readFile(new URL('../../deploy-henry-os/inject.mjs',import.meta.url),'utf8');
  const original=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');
  assert.ok(server.includes("const STORE='henry-finance-phase1'"));
  assert.ok(server.includes("context?.deploy?.context!=='production'"));
  assert.ok(!server.includes("setJSON('streaming/"));
  assert.ok(!server.includes("setJSON('invoices/"));
  assert.ok(server.includes("if(old.status!=='pending')"));
  assert.ok(server.includes("A receipt with this payment method and reference already exists."));
  assert.ok(build.includes("'henry-finance.mjs'"));
  assert.ok(original.includes('href="/admin/henry-finance.html"'));
});
