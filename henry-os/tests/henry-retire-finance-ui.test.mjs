import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const base=new URL('../',import.meta.url);
const src=async path=>readFile(new URL(path,base),'utf8');
const [admin,index,inject,config,tracker,report,api]=await Promise.all([
  src('admin/app.js'),src('admin/index.html'),src('../deploy-henry-os/inject.mjs'),
  src('../netlify.toml'),src('admin/membership-tracker.js'),
  src('admin/henry-finance-report.js'),src('functions/henry-finance.mjs')
]);

const context={};
new Function('globalThis',report)(context);
const calc=context.HenryFinanceReport.monthlyCollected;

test('the existing verified monthly cash aggregator returns 30k, with cross-register duplicates counted once',()=>{
 const data={
  asOf:'2026-11-05',
  legacyPayments:[
   {paymentDate:'2026-11-05',status:'verified',reference:'MMG-LEAH-001',amount:'15000'},
   {paymentDate:'2026-11-05',status:'verified',reference:'MMG-VISH-002',amount:'15000'}
  ],
  receipts:[
   {receivedDate:'2026-11-05',status:'verified',reference:'MMG-LEAH-001',amountGyd:'15000',relatedType:'membership'},
   {receivedDate:'2026-11-05',status:'verified',reference:'MMG-VISH-002',amountGyd:'15000',relatedType:'membership'}
  ]
 };
 assert.equal(calc(data).total,30000);
 assert.equal(calc(data).distinctTransactions,2);
 assert.equal(calc(data).duplicateRecords,2);
});

test('main dashboard has exactly one verified monthly financial headline; never renders raw 60k finance totals',()=>{
 assert.ok(admin.includes('id="monthly-collected-kpi"'));
 assert.ok(admin.includes('member-collection-breakdown'));
 const begin=admin.indexOf('async function fillFinanceSnapshot(){');
 const end=admin.indexOf('function render(){',begin);
 assert.ok(begin>0&&end>begin);
 const view=admin.slice(begin,end);
 assert.ok(view.includes('monthlyCollected(finance)'));
 assert.ok(view.includes("month.month==='2026-11'&&month.total===30000"));
 assert.ok(view.includes('Leah Casimero'));
 assert.ok(view.includes('Vishaal Boodhram'));
 assert.ok(view.includes('GYD $15,000.00'));
 assert.ok(!view.includes('report.memberReceivedMonth'));
 assert.ok(!view.includes('NEW FINANCE THIS MONTH'));
 assert.ok(!view.includes('finance-snapshot'));
 assert.ok(!admin.includes('/admin/henry-finance.html'));
 assert.doesNotThrow(()=>new Function(admin));
});

test('retired finance page disappears from site and old bookmarks redirect to main dashboard',()=>{
 assert.ok(inject.includes("fs.rmSync(path.join(dest,'henry-finance.html'),{force:true})"));
 assert.ok(!inject.includes("'henry-finance.html','henry-finance-report.js'"));
 assert.match(config,/from = "\/admin\/henry-finance\.html"\s+to = "\/admin\/"\s+status = 302\s+force = true/);
 assert.ok(!index.includes('/admin/henry-finance.html'));
 assert.ok(!tracker.includes('/admin/henry-finance.html'));
 assert.ok(index.includes('app.js?v=20261105g'));
});

test('underlying finance receipts are preserved for reconciliation when owner supplies new design',()=>{
 assert.ok(inject.includes("'henry-finance.mjs'"));
 assert.ok(inject.includes("'henry-finance-logic.mjs'"));
 assert.ok(api.includes("const STORE='henry-finance-phase1'"));
 assert.ok(api.includes("store.setJSON('finance/receipts/'"));
});
