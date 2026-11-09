import crypto from 'node:crypto';
import {getStore} from '@netlify/blobs';

// Read existing HENRY OS Streaming records; never rewrite them.
// Private reminders are WhatsApp drafts only. Sending is always owner-initiated.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(v,max=2000)=>String(v??'').trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'').slice(0,max);
const digest=v=>crypto.createHash('sha256').update(String(v||'')).digest();
const safeEq=(a,b)=>crypto.timingSafeEqual(digest(a),digest(b));
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');
const cookies=s=>Object.fromEntries(String(s||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));
const authenticated=(req,secret,email)=>{
  let token;try{token=cookies(req.headers.get('cookie')).henry_session}catch{return false}
  if(!token)return false;
  const [payload,sig]=token.split('.');
  if(!payload||!sig||!safeEq(sign(payload,secret),sig))return false;
  try{const session=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return session.email===email&&Number(session.exp)>Date.now()}catch{return false}
};
const isoDate=v=>{
  const s=clean(v,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const d=new Date(s+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
};
const day=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k)?.value).join('-')};
const classify=(dueDate,today)=>{
  if(!isoDate(dueDate))return 'needs_date';
  const days=Math.round((Date.parse(dueDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
  return days<0?'past_date':days===0?'due_today':days<=7?'due_soon':'upcoming';
};
const stageFor=category=>category==='past_date'?'follow_up':category==='due_today'?'due_today':['due_soon','upcoming'].includes(category)?'upcoming':'';
const safeId=value=>/^[A-Za-z0-9_-]{1,100}$/.test(String(value||''));
const readAll=async(store,prefix)=>{
  const {blobs}=await store.list({prefix});
  const records=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'}).catch(()=>null)));
  return records.filter(Boolean);
};
// Imported N/ACCOUNTS uses DATE for the customer's renewal date. During the
// original import, ACCOUNT PAYMENT DATE was preserved in private notes only.
// Do not infer that either date is evidence of payment received.
const importedProviderDate=s=>{
  const direct=isoDate(s.accountPaymentDate||'');
  if(direct)return direct;
  const match=/Netflix provider-side account payment date:\s*(\d{4}-\d{2}-\d{2})\b/i.exec(String(s.notes||''));
  return isoDate(match?.[1]);
};
const providerState=(subscription,overlay)=>{
  const imported=importedProviderDate(subscription);
  const date=isoDate(overlay?.currentDueDate)||imported;
  const inactive=['cancelled','paused'].includes(String(subscription.status||'').toLowerCase());
  return {subscriptionId:subscription.id,customer:clean(subscription.customer,160),
    service:clean(subscription.service||'Netflix',90),plan:clean(subscription.plan,120),
    customerDueDate:isoDate(subscription.dueDate),
    accountDueDate:date,importedAccountDate:imported,
    dateSource:overlay?.sourceType==='manual'?'Owner-updated':'Original Netflix import',
    paidAt:overlay?.paidAt||'',serviceUpdatedAt:overlay?.serviceUpdatedAt||'',
    lastUpdatedAt:overlay?.lastUpdatedAt||'',lastCompletedDate:overlay?.lastCompletedDate||'',
    historyCount:Array.isArray(overlay?.history)?overlay.history.length:0,
    status:inactive?'inactive':!date?'needs_date':overlay?.paidAt?'update_required':'payment_to_check',
    category:inactive?'inactive':classify(date,day())};
};
// Cash receipts are separate from reminders and Netflix supplier-account tasks.
// This matches the original Finance Phase 1 verified-cash register so the
// main HENRY OS monthly total reflects the payment exactly once.
const normalRef=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const validatedMoney=value=>{
  const v=clean(value,40).replace(/,/g,'');
  if(!/^\d+(?:\.\d{1,2})?$/.test(v))return '';
  const n=Number(v);
  return Number.isFinite(n)&&n>0&&n<=10000000?n.toFixed(2):'';
};
const readStrict=async(store,prefix)=>{
  const {blobs}=await store.list({prefix});
  return Promise.all(blobs.map(b=>store.get(b.key,{type:'json'})));
};
const candidatePayment=(p,s)=>{
  return p&&p.relatedType==='streaming'&&p.streamingId===s.id&&
    p.status==='verified'&&p.source==='reminder_inline_customer_paid'&&p.applied===true;
};
const settingsDefault={friendlyTemplate:'Hi {{firstName}} 👋, this is AMC Shopping. A quick reminder that your {{service}} subscription is scheduled to renew on {{dueDate}}. {{amountLine}}If you have already renewed, please let us know so we can update your record. Thank you for choosing AMC Shopping!','dayTemplate':'Hi {{firstName}}, your {{service}} subscription has its renewal date today ({{dueDate}}). {{amountLine}}Please let us know if you have already renewed. Thank you for shopping with AMC!','followupTemplate':'Hi {{firstName}}, we are following up on your {{service}} subscription. The renewal date we have on file is {{dueDate}}. If you already renewed, please tell us so we can correct our record. Thank you!','recommendedUpdate':''};

export default async (req,context)=>{
  const email=clean(process.env.HENRY_ADMIN_EMAIL,180).toLowerCase();
  const secret=String(process.env.HENRY_SESSION_SECRET||'');
  if(!email||secret.length<32)return json({error:'HENRY OS owner login is not configured'},503);
  if(!authenticated(req,secret,email))return json({error:'Unauthorized'},401);
  const action=new URL(req.url).searchParams.get('action')||'overview';
  const isWrite=req.method==='POST';
  if(isWrite&&context?.deploy?.context!=='production')return json({error:'Deployment previews are read-only. No reminder data was modified.'},403);
  const source=getStore('henry-amc'),store=getStore('henry-streaming-reminders');
  const today=day();
  if(action==='overview'&&req.method==='GET'){
    const [subscriptions,logs,settings,accountStates,financeReceipts]=await Promise.all([
      readAll(source,'streaming/'),readAll(store,'logs/'),store.get('settings/templates',{type:'json'}).catch(()=>null),readAll(store,'account-updates/'),readAll(getStore('henry-finance-phase1'),'finance/receipts/').catch(()=>[])
    ]);
    const paidBySub=new Map();
    for(const payment of financeReceipts){
      if(!payment||payment.status!=='verified'||payment.relatedType!=='streaming'||payment.applied!==true||!payment.streamingId)continue;
      const prior=paidBySub.get(payment.streamingId);
      if(!prior||String(payment.decidedAt||payment.createdAt)>String(prior.decidedAt||prior.createdAt))paidBySub.set(payment.streamingId,payment);
    }
    const rows=subscriptions.map(s=>{
      const dueDate=isoDate(s.dueDate);
      const inactive=['cancelled','paused'].includes(String(s.status||'').toLowerCase());
      const category=inactive?'inactive':classify(dueDate,today);
      const stage=stageFor(category);
      return {id:s.id,customer:s.customer||'',whatsapp:s.whatsapp||'',service:s.service||'Netflix',
        plan:s.plan||'',amount:s.amount||'',dueDate,status:s.status||'',category,stage,
        revision:s.updatedAt||s.createdAt||'',
        lastPayment:(paidBySub.get(s.id)?.source==='reminder_inline_customer_paid')?{
          paidOn:paidBySub.get(s.id).receivedDate,amount:paidBySub.get(s.id).amountGyd,
          previousDueDate:paidBySub.get(s.id).previousDueDate,
          nextDueDate:paidBySub.get(s.id).nextDueDate}:null};
    }).sort((a,b)=>(a.category==='due_today'?-1:a.category==='due_soon'?0:a.category==='past_date'?1:a.category==='needs_date'?3:2)-(b.category==='due_today'?-1:b.category==='due_soon'?0:b.category==='past_date'?1:b.category==='needs_date'?3:2)||String(a.dueDate).localeCompare(String(b.dueDate)));
    const accountsById=new Map(accountStates.map(x=>[x.subscriptionId,x]));
    const accountUpdates=subscriptions
      .filter(s=>String(s.service||'Netflix').toLowerCase()==='netflix'&&safeId(s.id))
      .map(s=>providerState(s,accountsById.get(s.id)))
      .sort((a,b)=>String(a.accountDueDate||'9999').localeCompare(String(b.accountDueDate||'9999'))||a.customer.localeCompare(b.customer));
    return json({today,subscriptions:rows,accountUpdates,logs:logs.map(l=>({id:l.id,subscriptionId:l.subscriptionId,dueDate:l.dueDate,stage:l.stage,sentAt:l.sentAt,marketingConsentConfirmed:!!l.marketingConsentConfirmed})),settings:{...settingsDefault,...(settings||{})}});
  }
  // Change customer details in place, without claiming a payment was made.
  // The source subscription ID, imported Netflix provider date and old receipts
  // remain unchanged. Require an expected date/version to prevent stale edits.
  if(action==='edit_customer'&&req.method==='POST'){
    let input;try{input=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const id=clean(input.subscriptionId,100),expected=isoDate(input.expectedDueDate);
    if(!safeId(id)||(input.expectedDueDate&&!expected))
      return json({error:'Invalid customer or current renewal date.'},400);
    const current=await source.get('streaming/'+id,{type:'json'}).catch(()=>null);
    if(!current)return json({error:'Customer subscription not found. Refresh the list.'},404);
    if(isoDate(current.dueDate)!==expected||
      String(current.updatedAt||current.createdAt||'')!==String(input.revision||''))
      return json({error:'This customer was changed elsewhere. Refresh before saving.'},409);
    const customer=clean(input.customer,160);
    const plan=clean(input.plan,120),whatsapp=clean(input.whatsapp,40);
    const amount=validatedMoney(input.amount);
    const dueDate=isoDate(input.dueDate);
    if(!customer)return json({error:'Customer name cannot be blank.'},400);
    if(!plan)return json({error:'Enter the customer service plan.'},400);
    if(input.dueDate&&!dueDate)
      return json({error:'Choose a valid renewal date.'},400);
    if(expected&&!dueDate)
      return json({error:'A recorded due date cannot be cleared accidentally. Choose a replacement date.'},400);
    if(input.amount&&!amount)
      return json({error:'Enter a valid GYD monthly amount.'},400);
    // Keep the original WhatsApp if blank was never entered; owner may fix a missing number.
    if(whatsapp&&!/^\+?[\d\s()\-]{7,24}$/.test(whatsapp))
      return json({error:'Enter a valid contact number or leave it empty.'},400);
    const now=new Date().toISOString();
    const changed={...current,customer,plan,whatsapp,amount:amount||'',
      dueDate:dueDate||'',updatedAt:now};
    const changeFields=['customer','plan','whatsapp','amount','dueDate']
      .filter(k=>String(current[k]||'')!==String(changed[k]||''));
    if(!changeFields.length)return json({changed:false,subscriptionId:id},200);
    await source.setJSON('streaming/'+id,changed);
    return json({changed:true,subscriptionId:id,changedFields:changeFields},200);
  }
  // Mark a customer renewal paid in-place, independently of "reminder sent".
  // Two-step durable write: receipt first, then original subscription due date.
  // If a source write fails, resubmitting the SAME reference safely resumes
  // without creating a second cash receipt. No provider renewal is affected.
  if(action==='record_customer_paid'&&req.method==='POST'){
    let input;try{input=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    if(input.confirmedReceived!==true)return json({error:'Confirm that AMC actually received this payment.'},400);
    const subscriptionId=clean(input.subscriptionId,100);
    const previousDueDate=isoDate(input.previousDueDate);
    const nextDueDate=isoDate(input.nextDueDate);
    const receivedDate=isoDate(input.receivedDate);
    const method=clean(input.method,40);
    const reference=clean(input.reference,120),canon=normalRef(reference);
    const historical=input.historical===true,notes=clean(input.notes,700);
    const amt=validatedMoney(input.amountGyd);
    if(!safeId(subscriptionId)||(input.previousDueDate&&!previousDueDate))return json({error:'Choose a valid subscription and existing due date, if known.'},400);
    if(!receivedDate||receivedDate>today)return json({error:'Choose the actual date the money was received, not a future date.'},400);
    if(!nextDueDate||nextDueDate<=previousDueDate||nextDueDate<=today)
      return json({error:'Enter the correct next customer payment date after the existing due date. Do not guess a month.'},400);
    if(!['MMG','Bank transfer','Cash','Other'].includes(method))
      return json({error:'Select a payment method.'},400);
    if(canon.length<4||['CASH','NONE','UNKNOWN','NORECEIPT','NOREF','NA','MMG','BANK'].includes(canon))
      return json({error:'Enter the actual unique MMG, bank or cash receipt number (not a generic description).'},400);
    if(!amt)return json({error:'Enter a valid GYD payment amount.'},400);
    if(historical&&notes.length<8)return json({error:'Add a brief verification note for a pre-go-live payment.'},400);
    const streamKey='streaming/'+subscriptionId;
    const s=await source.get(streamKey,{type:'json'}).catch(()=>null);
    if(!s||['paused','cancelled'].includes(String(s.status||'').toLowerCase()))
      return json({error:'This subscription is missing or inactive. Refresh first.'},409);
    const finance=getStore('henry-finance-phase1');
    // Never silently undercount/duplicate if the two registers can't be read.
    let existingFinance,existingOld;
    try{
      [existingFinance,existingOld]=await Promise.all([
        readStrict(finance,'finance/receipts/'),readStrict(source,'payments/')
      ]);
    }catch{return json({error:'Cannot verify existing payment references. Try again without recording a duplicate.'},503)}
    const identical=p=>!!p&&normalRef(p.reference)===canon;
    const matches=existingFinance.filter(identical);
    const oldMatches=existingOld.filter(identical);
    const receiptKey='finance/receipts/streaming-'+crypto.createHash('sha256').update(canon).digest('hex').slice(0,40);
    const resumable=matches.length===1&&matches[0].source==='reminder_inline_customer_paid'&&
      matches[0].streamingId===subscriptionId&&matches[0].previousDueDate===previousDueDate&&
      matches[0].nextDueDate===nextDueDate&&matches[0].receivedDate===receivedDate&&
      Number(matches[0].amountGyd)===Number(amt)&&matches[0].method===method&&
      matches[0].status==='verified'&&!matches[0].applied;
    if(oldMatches.length||matches.length&&!resumable)
      return json({error:'This payment reference already exists in HENRY OS. Check the existing verified record; it was not counted again.'},409);
    const currentDue=isoDate(s.dueDate);
    if(currentDue!==previousDueDate&&!(resumable&&currentDue===nextDueDate))
      return json({error:'This customer’s renewal date has changed. Refresh before confirming payment.'},409);
    const storedAmount=validatedMoney(s.amount);
    if(storedAmount&&Number(storedAmount)!==Number(amt))
      return json({error:'The payment does not match the subscription amount on file. Review the amount in Streaming before marking a renewal fully paid.'},409);
    const now=new Date().toISOString();
    const receipt=resumable?matches[0]:{
      id:receiptKey.split('/').at(-1),source:'reminder_inline_customer_paid',relatedType:'streaming',
      streamingId:subscriptionId,customer:clean(s.customer,160),amountGyd:amt,
      receivedDate,method,reference,previousDueDate,nextDueDate,
      historical,status:'verified',applied:false,notes,
      confirmedBy:email,decidedBy:email,decidedAt:now,verifiedAt:now,createdAt:now,updatedAt:now
    };
    if(!resumable)await finance.setJSON(receiptKey,receipt);
    // Preserve all unrelated imported fields including provider date in notes.
    // Record the future customer due date only; provider account date is separate.
    if(currentDue===previousDueDate)
      await source.setJSON(streamKey,{...s,dueDate:nextDueDate,updatedAt:now});
    await finance.setJSON(receiptKey,{...receipt,applied:true,appliedAt:now,updatedAt:now});
    return json({success:true,subscriptionId,previousDueDate,nextDueDate,receivedDate,amountGyd:amt},201);
  }
  // Owner-only AMC operational checklist. This never charges Netflix, sends a
  // message, updates customer billing, or creates accounting/supplier transactions.
  if(['account_payment','account_updated','set_account_date'].includes(action)&&req.method==='POST'){
    let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const subscriptionId=clean(body.subscriptionId,100);
    const expected=isoDate(body.accountDueDate);
    if(!safeId(subscriptionId)||(action!=='set_account_date'&&!expected))return json({error:'Choose a Netflix account with a valid update date.'},400);
    const sub=await source.get('streaming/'+subscriptionId,{type:'json'}).catch(()=>null);
    if(!sub||String(sub.service||'Netflix').toLowerCase()!=='netflix'
      ||['paused','cancelled'].includes(String(sub.status||'').toLowerCase()))
      return json({error:'The Netflix account is missing or inactive. Refresh and review.'},409);
    const key='account-updates/'+subscriptionId;
    const prev=await store.get(key,{type:'json'}).catch(()=>null);
    const current=providerState(sub,prev);
    if(current.accountDueDate!==expected)return json({error:'The provider date changed. Refresh before recording an action.'},409);
    const now=new Date().toISOString();
    const note=clean(body.note,600);
    let item;
    if(action==='set_account_date'){
      if(body.confirmedReview!==true) return json({error:'Confirm you checked the actual provider renewal date.'},400);
      if(prev?.paidAt) return json({error:'Provider payment was already confirmed for this cycle. Complete that update before changing the next date.'},409);
      if(note.length<8)return json({error:'Add a short reason or source for correcting this date.'},400);
      const corrected=isoDate(body.newAccountDueDate);
      if(!corrected||corrected===expected)return json({error:'Choose a valid, different account payment date.'},400);
      item={...prev,subscriptionId,currentDueDate:corrected,sourceType:'manual',paidAt:'',
        history:[...(Array.isArray(prev?.history)?prev.history:[]),{
          type:'date_correction',previousDate:expected,nextDate:corrected,
          note,updatedAt:now,confirmedBy:email}].slice(-24),
        updatedAt:now,updatedBy:email};
    }else if(action==='account_payment'){
      if(body.confirmedPaid!==true)return json({error:'Confirm you actually paid the provider before marking it paid.'},400);
      if(prev?.paidAt)return json({error:'Provider payment is already recorded for this account date.'},409);
      item={...prev,subscriptionId,currentDueDate:expected,sourceType:prev?.sourceType||'imported',
        paidAt:now,paymentNote:note,updatedAt:now,updatedBy:email,
        history:Array.isArray(prev?.history)?prev.history.slice(-24):[]};
    }else{
      if(body.confirmedUpdated!==true)return json({error:'Confirm the Netflix account was actually updated.'},400);
      if(!prev?.paidAt)return json({error:'Confirm the provider payment for this cycle before closing the update task.'},409);
      const nextDate=isoDate(body.nextAccountDueDate);
      if(!nextDate||nextDate<=expected||nextDate<=today)
        return json({error:'Enter the real next provider payment date after the current date. Do not assume a monthly extension.'},400);
      const history=[...(Array.isArray(prev?.history)?prev.history:[]),
        {date:expected,nextDate,providerPaidAt:prev.paidAt,accountUpdatedAt:now,
         note,confirmedBy:email}].slice(-24);
      item={subscriptionId,currentDueDate:nextDate,sourceType:'manual',
        paidAt:'',paymentNote:'',serviceUpdatedAt:now,lastUpdatedAt:now,
        lastCompletedDate:expected,history,updatedAt:now,updatedBy:email};
    }
    await store.setJSON(key,item);
    return json({account:providerState(sub,item),action},200);
  }
  if(action==='save_settings'&&req.method==='POST'){
    let input;try{input=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const settings={};
    for(const key of Object.keys(settingsDefault)){
      if(typeof input[key]!=='string'||input[key].length>2000)return json({error:'Invalid message template'},400);
      settings[key]=clean(input[key],2000);
    }
    if(!settings.friendlyTemplate||!settings.dayTemplate||!settings.followupTemplate)return json({error:'Please complete all three reminder templates'},400);
    await store.setJSON('settings/templates',{...settings,updatedAt:new Date().toISOString(),updatedBy:email});
    return json({settings});
  }
  if(action==='mark_sent'&&req.method==='POST'){
    let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const subscriptionId=clean(body.subscriptionId,100);
    const stage=clean(body.stage,20);
    const dueDate=isoDate(body.dueDate);
    if(!safeId(subscriptionId)||!['upcoming','due_today','follow_up'].includes(stage)||!dueDate)return json({error:'Invalid reminder details'},400);
    if(body.confirmedSent!==true)return json({error:'Confirm that you actually sent the WhatsApp message first'},400);
    const s=await source.get('streaming/'+subscriptionId,{type:'json'}).catch(()=>null);
    if(!s||isoDate(s.dueDate)!==dueDate||['paused','cancelled'].includes(String(s.status||'').toLowerCase()))return json({error:'This renewal has changed. Refresh before recording a reminder.'},409);
    if(stageFor(classify(dueDate,today))!==stage)return json({error:'Reminder stage has changed. Refresh and review the current due date.'},409);
    const message=clean(body.message,2300);
    if(message.length<10)return json({error:'Provide the message sent to the customer.'},400);
    // One deterministic record per subscription, renewal date and reminder stage; no duplicate mark-as-sent.
    const key='logs/'+subscriptionId+'/'+dueDate+'/'+stage;
    const existing=await store.get(key,{type:'json'}).catch(()=>null);
    if(existing)return json({error:'This reminder stage was already recorded as sent. It was not duplicated.'},409);
    if(body.includedRecommendation===true&&body.marketingConsentConfirmed!==true)return json({error:'Customer marketing consent must be confirmed before recording a promotional update.'},400);
    const item={id:crypto.randomUUID(),subscriptionId,customer:clean(s.customer,160),service:clean(s.service,80),dueDate,stage,message,
      includedRecommendation:body.includedRecommendation===true,marketingConsentConfirmed:body.marketingConsentConfirmed===true,
      sentAt:new Date().toISOString(),recordedBy:email};
    await store.setJSON(key,item);
    return json({item},201);
  }
  return json({error:'Not found'},404);
};
