import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const report=await readFile(new URL('../admin/henry-finance-report.js',import.meta.url),'utf8');
const financeUI=await readFile(new URL('../admin/henry-finance.js',import.meta.url),'utf8');
const financeHTML=await readFile(new URL('../admin/henry-finance.html',import.meta.url),'utf8');
const financeAPI=await readFile(new URL('../functions/henry-finance.mjs',import.meta.url),'utf8');
const mainUI=await readFile(new URL('../admin/app.js',import.meta.url),'utf8');
const index=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');
const reminderHTML=await readFile(new URL('../admin/streaming-reminders.html',import.meta.url),'utf8');
const deploy=await readFile(new URL('../../deploy-henry-os/inject.mjs',import.meta.url),'utf8');
const env={};
new Function('globalThis',report)(env);
const summary=env.HenryFinanceReport.summarize;

test('Netflix due dates are expected, not cash received; paused services excluded',()=>{
 const result=summary({
  asOf:'2026-11-05',
  streaming:[
   {id:'1',amount:'5,000',dueDate:'2026-11-05',status:'active'},
   {id:'2',amount:'3500',dueDate:'2026-11-07',status:'active'},
   {id:'3',amount:'10000',dueDate:'2026-11-05',status:'paused'},
   {id:'4',amount:'',dueDate:'2026-11-06',status:'active'},
   {id:'5',amount:'2000',dueDate:'',status:'active'}
  ],receipts:[],legacyPayments:[],legacyMembers:[],memberships:[]});
 assert.equal(result.expectedToday,5000);
 assert.equal(result.expectedNext7,8500);
 assert.equal(result.expectedMonth,8500);
 assert.equal(result.receivedToday,0);
 assert.equal(result.missingStreamingAmounts,1);
 assert.equal(result.missingStreamingDates,1);
});
test('owner verified membership fees are recorded in collection period; historical stays separate',()=>{
 const result=summary({
  asOf:'2026-11-05',streaming:[],
  receipts:[
   {relatedType:'membership',amountGyd:'950',status:'verified',receivedDate:'2026-11-05'},
   {relatedType:'membership',amountGyd:'1900',status:'verified',receivedDate:'2026-10-05',historical:true},
   {relatedType:'streaming',amountGyd:'5000',status:'verified',receivedDate:'2026-11-05'},
   {relatedType:'unallocated',amountGyd:'2000',status:'verified',receivedDate:'2026-11-05'},
   {relatedType:'membership',amountGyd:'7500',status:'pending',receivedDate:'2026-11-05'},
   {relatedType:'membership',amountGyd:'1500',status:'rejected',receivedDate:'2026-11-05'}
  ],
  legacyPayments:[{amount:'15,000',status:'verified',paymentDate:'2026-10-30'}],
  legacyMembers:[{id:'legacy-leah'}],
  memberships:[{id:'new-member'}]});
 assert.equal(result.receivedToday,7950);
 assert.equal(result.receivedWeek,7950);
 assert.equal(result.receivedMonth,7950);
 assert.equal(result.memberReceivedToday,950);
 assert.equal(result.memberReceivedMonth,950);
 assert.equal(result.memberReceivedAll,950);
 assert.equal(result.streamingReceivedMonth,5000);
 assert.equal(result.unallocatedReceivedMonth,2000);
 assert.equal(result.historicalMemberVerified,1900);
 assert.equal(result.legacyVerifiedAmount,15000);
 assert.equal(result.legacyMemberCount,1);
});
test('month and calendar-week are based on actual date boundaries, not verification timestamps',()=>{
 const result=summary({asOf:'2026-11-05',
  streaming:[],
  receipts:[
   {status:'verified',amountGyd:'1000',receivedDate:'2026-11-02'},
   {status:'verified',amountGyd:'1200',receivedDate:'2026-11-01'},
   {status:'verified',amountGyd:'900',receivedDate:'2026-10-31'}
  ]});
 assert.equal(result.weekStart,'2026-11-02');
 assert.equal(result.weekEnd,'2026-11-08');
 assert.equal(result.receivedWeek,1000);
 assert.equal(result.receivedMonth,2200);
});
test('new Collections Overview, membership historical form and versioned reminder filters are deployed',()=>{
 assert.ok(financeHTML.includes('Collections Overview'));
 assert.ok(financeHTML.includes('henry-finance-report.js?v='));
 assert.ok(financeUI.includes("tab:'summary'"));
 assert.ok(financeUI.includes('historicalMonthlyFee'));
 assert.ok(financeUI.includes('data-record-member'));
 assert.ok(financeUI.includes("renderSummary()"));
 assert.ok(mainUI.includes('fillFinanceSnapshot()'));
 assert.ok(index.includes('henry-finance-report.js'));
 assert.ok(reminderHTML.includes('value="specific"'));
 assert.ok(reminderHTML.includes('value="multiple"'));
 assert.ok(reminderHTML.includes('/admin/streaming-reminders.js?v='));
 assert.ok(deploy.includes("'henry-finance-report.js'"));
});
test('legacy HENRY OS records are only read, and historical receipts are excluded from new cash',()=>{
 assert.ok(financeAPI.includes("load(legacyAMC,'payments/').catch(()=>[])"));
 assert.ok(financeAPI.includes('legacyPayments:'));
 assert.ok(financeAPI.includes('const historical=body.historical===true'));
 assert.ok(financeAPI.includes('historical,status:'));
 assert.ok(financeAPI.includes('originalPayments.some('));
 assert.ok(!financeAPI.includes("await legacyAMC.setJSON"));
});
test('finance and dashboard JavaScript parse',()=>{
 assert.doesNotThrow(()=>new Function(report));
 assert.doesNotThrow(()=>new Function(financeUI));
 assert.doesNotThrow(()=>new Function(mainUI));
 assert.doesNotThrow(()=>new Function(financeAPI.replace(/^import .*$/gm,'').replace('export default async','const handler=async')));
});
