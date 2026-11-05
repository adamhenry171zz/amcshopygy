import crypto from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {isoDate,guyanaToday,toCents,fromCents,calculateMembership,nextExpectedBills,validLinkId} from './henry-finance-logic.mjs';

// HENRY OS 2.0 Phase 1. New, isolated store: no rewrites of legacy invoices,
// Netflix customer rows, old membership plans, or legacy payment transactions.
const STORE='henry-finance-phase1';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(v,max=240)=>String(v??'').trim().replace(/[\u0000-\u001F\u007F]/g,'').slice(0,max);
const digest=v=>crypto.createHash('sha256').update(String(v??'')).digest();
const eq=(a,b)=>crypto.timingSafeEqual(digest(a),digest(b));
const sign=(payload,key)=>crypto.createHmac('sha256',key).update(payload).digest('base64url');
const cookies=s=>Object.fromEntries(String(s||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const n=x.indexOf('=');return n<0?[x,'']:[x.slice(0,n),decodeURIComponent(x.slice(n+1))]}));
const authenticated=(req,key,email)=>{
  let token='';try{token=cookies(req.headers.get('cookie')).henry_session||''}catch{return false}
  const [payload,signature]=token.split('.');
  if(!payload||!signature||!eq(sign(payload,key),signature))return false;
  try{const p=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return p.email===email&&p.exp>Date.now()}catch{return false}
};
const load=async(store,prefix)=>{
  const list=await store.list({prefix});
  const rows=await Promise.all((list.blobs||[]).map(async x=>store.get(x.key,{type:'json'}).catch(()=>null)));
  return rows.filter(Boolean);
};
const read=async(store,kind)=>load(store,'finance/'+kind+'/');
const id=()=>crypto.randomUUID();
const safeDate=d=>{const v=isoDate(d);if(!v)throw new Error('Enter a valid calendar date.');return v};
const positiveMoney=v=>{const n=toCents(v);if(n<=0)throw new Error('Amount must be greater than zero.');return fromCents(n)};
const rate=v=>{const n=Number(String(v??'').trim());if(!Number.isFinite(n)||n<=0||n>10000)throw new Error('A valid GYD per USD rate is required.');return n};
const conversion=(currency,amount,exchangeRate)=>{
  const original=positiveMoney(amount);
  const originalCents=toCents(original);
  if(currency==='GYD')return {currency,originalAmount:original,exchangeRate:'1',gydAmount:original};
  if(currency!=='USD')throw new Error('Only USD and GYD are supported in Phase 1.');
  const r=rate(exchangeRate);
  return {currency,originalAmount:original,exchangeRate:String(r),gydAmount:fromCents(Math.round(originalCents*r))};
};
const supplierResponse=(s,asOf)=>({...s,nextExpectedBillDates:nextExpectedBills(s,asOf)});
const billResponse=b=>({...b,paidGyd:fromCents((b.payments||[]).reduce((n,p)=>n+toCents(p.amountGyd),0)),balanceGyd:fromCents(Math.max(0,toCents(b.actualGyd)-(b.payments||[]).reduce((n,p)=>n+toCents(p.amountGyd),0)))});
const normalRef=v=>clean(v,120).toLowerCase().replace(/\s+/g,' ');
const duplicateRef=(items,method,reference)=>items.some(x=>String(x.method||'').toLowerCase()===String(method||'').toLowerCase()&&normalRef(x.reference)===normalRef(reference));
const method=v=>{const x=clean(v,40);if(!['MMG','Bank transfer','Cash','Other'].includes(x))throw new Error('Select a recognized payment method.');return x};
const validateReference=v=>{const x=clean(v,120);if(x.length<3)throw new Error('Enter a payment reference or cash receipt number (3+ characters).');return x};
const withError=async fn=>{try{return await fn()}catch(err){return json({error:err instanceof Error?err.message:'Unable to complete the request.'},400)}};

export default async (req,context)=>{
  const adminEmail=clean(process.env.HENRY_ADMIN_EMAIL,180).toLowerCase();
  const sessionSecret=String(process.env.HENRY_SESSION_SECRET||'');
  if(!adminEmail||sessionSecret.length<32)return json({error:'Owner login not configured'},503);
  if(!authenticated(req,sessionSecret,adminEmail))return json({error:'Unauthorized'},401);
  const action=new URL(req.url).searchParams.get('action')||'bootstrap';
  if(req.method==='POST'&&context?.deploy?.context!=='production')return json({error:'This deployment is read-only. Use the approved production HENRY OS.'},403);
  const store=getStore(STORE);
  const asOf=guyanaToday();

  if(action==='bootstrap'&&req.method==='GET')return withError(async()=>{
    const legacyMembership=getStore('henry-memberships'),legacyAMC=getStore('henry-amc');
    const [suppliers,memberships,receipts,bills,oldMembers,oldSubscriptions,oldPayments]=await Promise.all([
      read(store,'suppliers'),read(store,'memberships'),read(store,'receipts'),read(store,'bills'),
      load(legacyMembership,'members/').catch(()=>[]),load(legacyAMC,'streaming/').catch(()=>[]),load(legacyAMC,'payments/').catch(()=>[])
    ]);
    return json({asOf,
      suppliers:suppliers.map(s=>supplierResponse(s,asOf)),
      memberships:memberships.map(m=>calculateMembership(m,receipts,asOf)),
      receipts:receipts.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),
      bills:bills.map(billResponse),
      legacyMembers:oldMembers.map(m=>({id:m.id,customer:m.customer,mailboxCode:m.mailboxCode,planName:m.planName,monthlyFee:m.monthlyFee,allowanceLb:m.allowanceLb,status:m.status})),
      streaming:oldSubscriptions.map(s=>({id:s.id,customer:s.customer,service:s.service,plan:s.plan,dueDate:s.dueDate,amount:s.amount,status:s.status||''})),
      legacyPayments:oldPayments.map(p=>({id:p.id,customer:p.customer,amount:p.amount,method:p.method,reference:p.reference,status:p.status,paymentDate:p.paymentDate,relatedType:p.relatedType,relatedId:p.relatedId}))
    });
  });
  if(req.method!=='POST')return json({error:'Not found'},404);
  const length=Number(req.headers.get('content-length')||0);
  if(length>24000)return json({error:'Request too large'},413);
  let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
  const now=new Date().toISOString();

  if(action==='add_supplier')return withError(async()=>{
    const name=clean(body.name,120),service=clean(body.service,80),accountLabel=clean(body.accountLabel,120);
    if(!name||!service||!accountLabel)throw new Error('Supplier, service and account label are required.');
    if(/password|passcode|pin|secret/i.test(accountLabel))throw new Error('Do not enter account credentials.');
    const firstDueDate=safeDate(body.firstDueDate),recurrence=clean(body.recurrence,20);
    if(!['monthly','one_time'].includes(recurrence))throw new Error('Invalid billing recurrence.');
    const estimate=conversion(clean(body.currency,8),body.estimatedAmount,body.exchangeRate);
    const incoming=Array.isArray(body.linkedSubscriptionIds)?body.linkedSubscriptionIds:[];
    const linkedSubscriptionIds=[...new Set(incoming.map(x=>clean(x,100)))].filter(Boolean);
    if(linkedSubscriptionIds.length>100||linkedSubscriptionIds.some(x=>!validLinkId(x)))throw new Error('Invalid subscription links.');
    const amcStore=getStore('henry-amc');
    for(const ref of linkedSubscriptionIds){if(!await amcStore.get('streaming/'+ref,{type:'json'}).catch(()=>null))throw new Error('One or more linked subscriptions do not exist.');}
    const item={id:id(),name,service,accountLabel,firstDueDate,recurrence,status:'active',
      estimate,linkedSubscriptionIds,notes:clean(body.notes,800),createdAt:now,updatedAt:now};
    await store.setJSON('finance/suppliers/'+item.id,item);
    return json({item:supplierResponse(item,asOf)},201);
  });

  if(action==='update_supplier_schedule')return withError(async()=>{
    const supplierId=clean(body.id,100);
    if(!validLinkId(supplierId))throw new Error('Choose a supplier account.');
    const old=await store.get('finance/suppliers/'+supplierId,{type:'json'}).catch(()=>null);
    if(!old)throw new Error('Supplier account not found.');
    const firstDueDate=safeDate(body.firstDueDate),recurrence=clean(body.recurrence,20);
    if(!['monthly','one_time'].includes(recurrence))throw new Error('Invalid billing recurrence.');
    const estimate=conversion(old.estimate.currency,body.estimatedAmount,body.exchangeRate||old.estimate.exchangeRate);
    const history=[...(old.scheduleHistory||[]),{
      estimate:old.estimate,firstDueDate:old.firstDueDate,recurrence:old.recurrence,
      changedBy:adminEmail,changedAt:now
    }];
    const item={...old,estimate,firstDueDate,recurrence,scheduleHistory:history,updatedAt:now};
    await store.setJSON('finance/suppliers/'+supplierId,item);
    return json({item:supplierResponse(item,asOf)});
  });

  if(action==='pause_supplier')return withError(async()=>{
    const ref=clean(body.id,100),status=clean(body.status,20);
    if(!validLinkId(ref)||!['active','paused'].includes(status))throw new Error('Invalid account or status.');
    const old=await store.get('finance/suppliers/'+ref,{type:'json'}).catch(()=>null);
    if(!old)throw new Error('Supplier account not found.');
    const item={...old,status,updatedAt:now};await store.setJSON('finance/suppliers/'+ref,item);
    return json({item:supplierResponse(item,asOf)});
  });

  if(action==='add_bill')return withError(async()=>{
    const supplierId=clean(body.supplierId,100),dueDate=safeDate(body.dueDate);
    if(!validLinkId(supplierId))throw new Error('Choose a supplier account.');
    const supplier=await store.get('finance/suppliers/'+supplierId,{type:'json'}).catch(()=>null);
    if(!supplier)throw new Error('Supplier account not found.');
    const existing=await read(store,'bills');
    if(existing.some(b=>b.supplierId===supplierId&&b.dueDate===dueDate))return json({error:'A confirmed bill already exists for that account and date.'},409);
    const amount=conversion(supplier.estimate.currency,body.actualAmount,body.exchangeRate||supplier.estimate.exchangeRate);
    const item={id:id(),supplierId,dueDate,service:supplier.service,supplier:supplier.name,accountLabel:supplier.accountLabel,
      actual:amount,actualGyd:amount.gydAmount,expectedGyd:supplier.estimate.gydAmount,payments:[],
      status:'unpaid',notes:clean(body.notes,800),confirmedBy:adminEmail,createdAt:now,updatedAt:now};
    await store.setJSON('finance/bills/'+item.id,item);
    return json({item:billResponse(item)},201);
  });

  if(action==='pay_bill')return withError(async()=>{
    const billId=clean(body.billId,100),paidDate=safeDate(body.paidDate);
    if(!validLinkId(billId))throw new Error('Choose a bill.');
    const bill=await store.get('finance/bills/'+billId,{type:'json'}).catch(()=>null);
    if(!bill)throw new Error('Supplier bill not found.');
    const amountGyd=positiveMoney(body.amountGyd),paymentMethod=method(body.method),reference=validateReference(body.reference);
    const bills=await read(store,'bills');
    if(bills.flatMap(b=>b.payments||[]).some(p=>p.method.toLowerCase()===paymentMethod.toLowerCase()&&normalRef(p.reference)===normalRef(reference)))
      return json({error:'This supplier payment reference has already been recorded.'},409);
    const paid=(bill.payments||[]).reduce((n,p)=>n+toCents(p.amountGyd),0);
    if(toCents(amountGyd)>toCents(bill.actualGyd)-paid)throw new Error('Supplier payment exceeds the remaining bill balance.');
    const payment={id:id(),amountGyd,paidDate,method:paymentMethod,reference,verifiedBy:adminEmail,verifiedAt:now};
    const payments=[...(bill.payments||[]),payment];
    const complete=payments.reduce((n,p)=>n+toCents(p.amountGyd),0)===toCents(bill.actualGyd);
    const item={...bill,payments,status:complete?'paid':'part_paid',updatedAt:now};
    await store.setJSON('finance/bills/'+billId,item);return json({item:billResponse(item)});
  });

  if(action==='add_membership')return withError(async()=>{
    const customer=clean(body.customer,160),whatsapp=clean(body.whatsapp,40),mailboxCode=clean(body.mailboxCode,60).toUpperCase();
    if(!customer)throw new Error('Member name is required.');
    const monthlyFee=positiveMoney(body.monthlyFee||'950');
    const existing=await read(store,'memberships');
    if(existing.some(m=>mailboxCode&&String(m.mailboxCode||'').toUpperCase()===mailboxCode))
      return json({error:'That mailbox code already has a finance membership profile.'},409);
    if(existing.some(m=>!mailboxCode&&!m.mailboxCode&&m.customer.toLowerCase()===customer.toLowerCase()))
      return json({error:'A membership with that name already exists. Check before adding a duplicate.'},409);
    const item={id:id(),customer,whatsapp,mailboxCode,monthlyFee,notes:clean(body.notes,800),createdAt:now,updatedAt:now};
    await store.setJSON('finance/memberships/'+item.id,item);
    return json({item:calculateMembership(item,[],asOf)},201);
  });

  if(action==='update_member_fee')return withError(async()=>{
    const memberId=clean(body.id,100);
    if(!validLinkId(memberId))throw new Error('Choose a membership.');
    const member=await store.get('finance/memberships/'+memberId,{type:'json'}).catch(()=>null);
    if(!member)throw new Error('Member not found.');
    const nextFee=positiveMoney(body.monthlyFee);
    if(nextFee===member.monthlyFee)return json({item:member});
    const prior=[...(member.feeHistory||[])];
    prior.push({oldFee:member.monthlyFee,newFee:nextFee,changedBy:adminEmail,changedAt:now});
    const item={...member,monthlyFee:nextFee,feeHistory:prior,updatedAt:now};
    await store.setJSON('finance/memberships/'+memberId,item);
    return json({item:calculateMembership(item,await read(store,'receipts'),asOf)});
  });

  if(action==='add_receipt')return withError(async()=>{
    const relatedType=clean(body.relatedType,30),paymentMethod=method(body.method),reference=validateReference(body.reference);
    if(!['membership','streaming','unallocated'].includes(relatedType))throw new Error('Invalid payment category.');
    const amountGyd=positiveMoney(body.amountGyd),receivedDate=safeDate(body.receivedDate);
    const historical=body.historical===true;
    const receiptNote=clean(body.notes,1000);
    if(historical&&receiptNote.length<8)throw new Error('Describe how this pre-launch payment was verified. It will be excluded from new cash collections.');
    const existing=await read(store,'receipts');
    if(duplicateRef(existing,paymentMethod,reference))return json({error:'A receipt with this payment method and reference already exists.'},409);
    // Prevent an old HENRY OS payment being re-imported into the new cash register.
    const originalPayments=await load(getStore('henry-amc'),'payments/').catch(()=>[]);
    if(originalPayments.some(p=>clean(p.method,40).toLowerCase()===paymentMethod.toLowerCase()&&normalRef(p.reference)===normalRef(reference)))
      return json({error:'This reference already exists in the previous HENRY OS payments. Review the original instead of counting it twice.'},409);
    let customer=clean(body.customer,160),membershipId='',streamingId='',months=0,agreedFee='';
    if(relatedType==='membership'){
      membershipId=clean(body.membershipId,100);
      if(!validLinkId(membershipId))throw new Error('Select a member.');
      const member=await store.get('finance/memberships/'+membershipId,{type:'json'}).catch(()=>null);
      if(!member)throw new Error('Membership not found.');
      months=Number(body.months);
      if(!Number.isInteger(months)||months<1||months>24)throw new Error('Months must be between 1 and 24.');
      agreedFee=historical&&body.historicalMonthlyFee?positiveMoney(body.historicalMonthlyFee):member.monthlyFee;
      if(toCents(amountGyd)!==toCents(agreedFee)*months)throw new Error('Phase 1 membership receipts must equal fee × months. Hold mixed or overpayments for the future allocation feature.');
      customer=member.customer;
    }else if(relatedType==='streaming'){
      streamingId=clean(body.streamingId,100);
      if(!validLinkId(streamingId))throw new Error('Select an existing streaming subscription.');
      const subscription=await getStore('henry-amc').get('streaming/'+streamingId,{type:'json'}).catch(()=>null);
      if(!subscription)throw new Error('Streaming subscription not found.');
      customer=subscription.customer||customer;
    }else if(!customer)throw new Error('Enter the payer name.');
    const item={id:id(),relatedType,customer,amountGyd,receivedDate,method:paymentMethod,reference,
      membershipId,streamingId,months,agreedFee,historical,status:'pending',notes:receiptNote,
      createdAt:now,updatedAt:now};
    await store.setJSON('finance/receipts/'+item.id,item);return json({item},201);
  });

  if(action==='decide_receipt')return withError(async()=>{
    const receiptId=clean(body.id,100),decision=clean(body.decision,20),reason=clean(body.reason,500);
    if(!validLinkId(receiptId)||!['verified','rejected'].includes(decision))throw new Error('Invalid receipt decision.');
    const old=await store.get('finance/receipts/'+receiptId,{type:'json'}).catch(()=>null);
    if(!old)throw new Error('Receipt not found.');
    if(old.status!=='pending')return json({error:'This receipt was already decided. Financial history is preserved.'},409);
    if(decision==='rejected'&&reason.length<4)throw new Error('Enter a reason for rejecting the receipt.');
    if(decision==='verified'&&old.relatedType==='membership'){
      // Membership payment is a single exact allocation. Coverage is derived from verified events.
      if(toCents(old.amountGyd)!==toCents(old.agreedFee)*Number(old.months))throw new Error('Membership amount no longer matches its recorded allocation.');
      if(!await store.get('finance/memberships/'+old.membershipId,{type:'json'}).catch(()=>null))throw new Error('Linked membership no longer exists.');
    }
    const item={...old,status:decision,decisionReason:reason,decidedBy:adminEmail,decidedAt:now,updatedAt:now};
    await store.setJSON('finance/receipts/'+receiptId,item);return json({item});
  });
  return json({error:'Not found'},404);
};
