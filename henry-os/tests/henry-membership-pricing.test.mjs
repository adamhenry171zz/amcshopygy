import test from 'node:test';
import assert from 'node:assert/strict';
import {applyQuota,regularPerLb,usageBefore,approvedCreditLb,memberForCustomer} from '../functions/henry-membership-pricing.mjs';
const member={id:'member-one',customer:'Customer One',mailboxCode:'AMC12345',planId:'starter',allowanceLb:'20',status:'active'};
const base=(weight,adjustment=0)=>({weight,adjustment,standardEquivalent:weight*1500});
const prior=(id,weight,status='sent')=>({id,invoiceNo:'MC'+id,invoiceDate:'2026-11-04',customer:'Customer One',status,description:'Members Club Shipping Invoice · '+weight+' lb',invoiceSnapshot:{customerType:'member',mailboxCode:'AMC12345',calculation:{weight}}});
test('member weight within allowance stays at member rate',()=>{
 const v=applyQuota(base(5),member,10,0);assert.equal(v.memberLb,5);assert.equal(v.excessLb,0);assert.equal(v.total,4750);
});
test('monthly quota crossing splits member and normal-rate excess',()=>{
 const v=applyQuota(base(5),member,18,0);assert.equal(v.memberLb,2);assert.equal(v.excessLb,3);assert.equal(v.memberCharge,1900);assert.equal(v.overageCharge,4500);assert.equal(v.total,6400);
});
test('quota already exhausted charges all shipment pounds at regular rate',()=>{
 const v=applyQuota(base(8),member,25,0);assert.equal(v.memberLb,0);assert.equal(v.excessLb,8);assert.equal(v.total,12000);
});
test('approved missed-shipment pounds increase only applicable allowance',()=>{
 const credits=[{memberId:'member-one',month:'2026-11',type:'missed_shipment',approvedByOwner:true,pounds:20},{memberId:'member-one',month:'2026-12',type:'missed_shipment',approvedByOwner:true,pounds:99},{memberId:'member-one',month:'2026-11',type:'manual',approvedByOwner:true,pounds:20}];
 const bonus=approvedCreditLb(credits,member,'2026-11');assert.equal(bonus,20);const v=applyQuota(base(8),member,34,bonus);assert.equal(v.memberLb,6);assert.equal(v.excessLb,2);
});
test('monthly usage counts member invoices once, excludes cancelled and other customers',()=>{
 const invoices=[prior('0001',12),prior('0002',7),prior('0002',7),prior('0003',5,'cancelled'),{...prior('0004',40),customer:'Other Person',invoiceSnapshot:{customerType:'member',mailboxCode:'AMC99999'}}];
 assert.equal(usageBefore(invoices,member,'2026-11'),19);
 assert.equal(usageBefore(invoices,member,'2026-11',new Set(['0002'])),12);
 assert.equal(usageBefore(invoices,member,'2026-12'),0);
});
test('regular overage rate follows combined shipment regular rate tiers',()=>{
 assert.equal(regularPerLb(5),1500);assert.equal(regularPerLb(12),1300);assert.equal(regularPerLb(30),1200);assert.equal(regularPerLb(60),1100);assert.equal(regularPerLb(100),1050);
});
test('ambiguous member identities are not selected for billing',()=>{
 const same=[member,{...member,id:'different'}];assert.equal(memberForCustomer({name:'Customer One',mailboxCode:'AMC12345'},same),null);
});
