import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const reportSource=await readFile(new URL('../admin/henry-finance-report.js',import.meta.url),'utf8');
const admin=await readFile(new URL('../admin/app.js',import.meta.url),'utf8');
const finance=await readFile(new URL('../admin/henry-finance.js',import.meta.url),'utf8');
const mainPage=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');
const financePage=await readFile(new URL('../admin/henry-finance.html',import.meta.url),'utf8');
const api=await readFile(new URL('../functions/henry-finance.mjs',import.meta.url),'utf8');
const bound={};
new Function('globalThis',reportSource)(bound);
const {monthlyCollected}=bound.HenryFinanceReport;

const base=()=>({asOf:'2026-11-05',legacyPayments:[],receipts:[],streaming:[]});
const legacy=(reference,amount,date='2026-11-05',status='verified')=>({reference,amount,paymentDate:date,status,method:'MMG'});
const financeRecord=(reference,amount,date='2026-11-05',status='verified',historical=false)=>({reference,amountGyd:amount,receivedDate:date,status,historical,method:'MMG'});

test('two verified 15000 member receipts produce 30000, never infer receipts from membership status',()=>{
 const data=base();
 data.legacyMembers=[{customer:'A',monthlyFee:'15000',status:'active'}, {customer:'B',monthlyFee:'15000',status:'active'}];
 data.streaming=[{customer:'Netflix Customer',amount:'5000',dueDate:'2026-11-05',status:'active'}];
 data.receipts=[financeRecord('MEMBER-111','15000'),financeRecord('MEMBER-222','15000')];
 assert.equal(monthlyCollected(data).total,30000);
 data.receipts=[financeRecord('MEMBER-111','15000','2026-11-05','pending'),financeRecord('MEMBER-222','15000','2026-11-05','rejected')];
 assert.equal(monthlyCollected(data).total,0);
});

test('cross-register duplicate payment reference is counted once',()=>{
 const data=base();
 data.legacyPayments=[legacy('MMG-REF-15','15000')];
 data.receipts=[financeRecord('mmg ref 15','15000')];
 const result=monthlyCollected(data);
 assert.equal(result.total,15000);
 assert.equal(result.legacyOnly,0);
 assert.equal(result.financeOnly,0);
 assert.equal(result.duplicatesAcrossRegisters,15000);
 assert.equal(result.duplicateRecords,1);
});

test('conflicting amounts or conflicting payment dates are excluded and flagged for reconciliation',()=>{
 const data=base();
 data.legacyPayments=[legacy('MMG-CONFLICT-1','15000'),legacy('MMG-CONFLICT-2','5000','2026-11-04')];
 data.receipts=[financeRecord('MMG-CONFLICT-1','14000'),financeRecord('MMG-CONFLICT-2','5000','2026-11-05')];
 const result=monthlyCollected(data);
 assert.equal(result.total,0);
 assert.equal(result.conflictingReferences,2);
 assert.equal(result.needsReview,4);
});

test('month-to-date counts actual received dates, not future-dated or October records',()=>{
 const data=base();
 data.legacyPayments=[
  legacy('MMG-OCT-1','5000','2026-10-31'),
  legacy('MMG-NOV-1','5000','2026-11-01'),
  legacy('MMG-FUTURE','9000','2026-11-07'),
  legacy('MMG-PENDING','3000','2026-11-05','pending')
 ];
 data.receipts=[financeRecord('MMG-HIST-1','6000','2026-11-02','verified',true)];
 const result=monthlyCollected(data);
 assert.equal(result.total,11000);
 assert.equal(result.historicalIncluded,11000);
 assert.equal(result.excludedFuture,1);
});

test('verified receipts missing unique references are excluded with an alert, not double-counted',()=>{
 const data=base();
 data.legacyPayments=[legacy('',15000),legacy('CASH',3000),legacy('MMG-OK-111',8000)];
 const result=monthlyCollected(data);
 assert.equal(result.total,8000);
 assert.equal(result.needsReview,2);
 assert.equal(result.excludedNoReference,2);
 assert.equal(result.completeFromRecordedSources,false);
});

test('older invalid references do not inflate this month review flags',()=>{
 const data=base();
 data.legacyPayments=[legacy('',9000,'2026-10-01'),legacy('MMG-OLD-123',9000,'2026-10-01')];
 const result=monthlyCollected(data);
 assert.equal(result.total,0);
 assert.equal(result.needsReview,0);
});

test('different verified cash sources are added once without turning revenue forecasts into deposits',()=>{
 const data=base();
 data.streaming=[{dueDate:'2026-11-05',amount:'50000'}];
 data.legacyPayments=[legacy('OLD-PAY-123','12000')];
 data.receipts=[financeRecord('NEW-PAY-456','4000')];
 const result=monthlyCollected(data);
 assert.equal(result.total,16000);
 assert.equal(result.legacyOnly,12000);
 assert.equal(result.financeOnly,4000);
});

test('front-end displays a unified monthly KPI, visible finance detail and cache-safe assets',()=>{
 assert.ok(admin.includes('id="monthly-collected-kpi"'));
 assert.ok(admin.includes('monthlyCollected(finance)'));
 assert.ok(admin.includes('TOTAL COLLECTED THIS MONTH'));
 assert.ok(finance.includes('Total Verified Collected This Month'));
 assert.ok(finance.includes('monthlyCollected(d)'));
 assert.ok(mainPage.includes('app.js?v=20261105e'));
 assert.ok(mainPage.includes('henry-finance-report.js?v=20261105e'));
 assert.ok(financePage.includes('henry-finance.js?v=20261105e'));
 assert.ok(api.includes("legacyPayments:oldPayments.map"));
});

test('no payment status is written or changed during rollup',()=>{
 assert.ok(!reportSource.includes('fetch('));
 assert.ok(!reportSource.includes('setJSON('));
 assert.doesNotThrow(()=>new Function(admin));
 assert.doesNotThrow(()=>new Function(finance));
 assert.doesNotThrow(()=>new Function(reportSource));
});
