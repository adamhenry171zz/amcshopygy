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
const stageFor=category=>category==='past_date'?'follow_up':category==='due_today'?'due_today':category==='due_soon'?'upcoming':'';
const safeId=value=>/^[A-Za-z0-9_-]{1,100}$/.test(String(value||''));
const readAll=async(store,prefix)=>{
  const {blobs}=await store.list({prefix});
  const records=await Promise.all(blobs.map(b=>store.get(b.key,{type:'json'}).catch(()=>null)));
  return records.filter(Boolean);
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
    const [subscriptions,logs,settings]=await Promise.all([
      readAll(source,'streaming/'),readAll(store,'logs/'),store.get('settings/templates',{type:'json'}).catch(()=>null)
    ]);
    const rows=subscriptions.map(s=>{
      const dueDate=isoDate(s.dueDate);
      const inactive=['cancelled','paused'].includes(String(s.status||'').toLowerCase());
      const category=inactive?'inactive':classify(dueDate,today);
      const stage=stageFor(category);
      return {id:s.id,customer:s.customer||'',whatsapp:s.whatsapp||'',service:s.service||'Netflix',
        plan:s.plan||'',amount:s.amount||'',dueDate,status:s.status||'',category,stage};
    }).sort((a,b)=>(a.category==='due_today'?-1:a.category==='due_soon'?0:a.category==='past_date'?1:a.category==='needs_date'?3:2)-(b.category==='due_today'?-1:b.category==='due_soon'?0:b.category==='past_date'?1:b.category==='needs_date'?3:2)||String(a.dueDate).localeCompare(String(b.dueDate)));
    return json({today,subscriptions:rows,logs:logs.map(l=>({id:l.id,subscriptionId:l.subscriptionId,dueDate:l.dueDate,stage:l.stage,sentAt:l.sentAt,marketingConsentConfirmed:!!l.marketingConsentConfirmed})),settings:{...settingsDefault,...(settings||{})}});
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
