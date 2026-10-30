import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const TYPES = new Set(['customers','packages','deliveries','invoices','payments','streaming','inquiries','tasks','announcements','expenses']);
const FIELDS = {
  customers:['name','whatsapp','email','mailboxCode','address','status','source','notes'],
  packages:['customer','whatsapp','tracking','carrier','weight','packageCount','status','arrivalDate','amountDue','notes'],
  deliveries:['reference','requestType','customer','whatsapp','packageRef','weight','address','landmark','mapLink','preferredDate','preferredTime','status','quote','paymentStatus','source','notes'],
  invoices:['invoiceNo','customer','whatsapp','amount','balance','status','dueDate','description','notes'],
  payments:['customer','whatsapp','amount','method','reference','status','paymentDate','relatedType','relatedId','notes'],
  streaming:['customer','whatsapp','service','plan','amount','dueDate','status','accountEmail','notes'],
  inquiries:['customer','whatsapp','email','subject','channel','status','message','followUpDate','notes'],
  tasks:['title','dueDate','priority','status','module','customer','notes'],
  announcements:['title','body','status','publishDate','notes'],
  expenses:['vendor','category','amount','date','status','notes']
};

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const digest=v=>crypto.createHash('sha256').update(String(v||'')).digest();
const safeEq=(a,b)=>crypto.timingSafeEqual(digest(a),digest(b));
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');
const parseCookies=s=>Object.fromEntries(String(s||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));
const authenticated=(req,secret,email)=>{const token=parseCookies(req.headers.get('cookie')).henry_session;if(!token)return false;const [payload,sig]=token.split('.');if(!payload||!sig||!safeEq(sign(payload,secret),sig))return false;try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return data.email===email&&Number(data.exp)>Date.now()}catch{return false}};
const clean=(v,max=1200)=>String(v??'').trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,max);
const cleanRecord=(type,input={})=>{const out={};for(const field of FIELDS[type]||[])out[field]=clean(input[field],field==='notes'||field==='message'||field==='body'?4000:800);return out};
const readType=async(store,type)=>{const {blobs}=await store.list({prefix:`${type}/`});const rows=await Promise.all(blobs.map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));return rows.filter(Boolean).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')))};
const readMailboxes=async()=>{const store=getStore('amc-mailboxes');const {blobs}=await store.list({prefix:'mailboxes/'});const rows=await Promise.all(blobs.map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));return rows.filter(Boolean).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))};

export default async(req)=>{
  const adminEmail=clean(process.env.HENRY_ADMIN_EMAIL,180).toLowerCase();
  const sessionSecret=String(process.env.HENRY_SESSION_SECRET||'');
  if(!adminEmail||sessionSecret.length<32)return json({error:'Henry OS is not configured'},503);
  if(!authenticated(req,sessionSecret,adminEmail))return json({error:'Unauthorized'},401);
  const url=new URL(req.url);const action=url.searchParams.get('action')||'bootstrap';
  const store=getStore('henry-amc');

  if(action==='bootstrap'&&req.method==='GET'){
    const data={};
    await Promise.all([...TYPES].map(async type=>{data[type]=await readType(store,type)}));
    data.mailboxes=await readMailboxes();
    data.generatedAt=new Date().toISOString();
    return json(data);
  }

  if(action==='list'&&req.method==='GET'){
    const type=url.searchParams.get('type')||'';if(!TYPES.has(type))return json({error:'Invalid type'},400);
    return json({items:await readType(store,type)});
  }

  if(action==='save'&&req.method==='POST'){
    let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const type=clean(body.type,40);if(!TYPES.has(type))return json({error:'Invalid type'},400);
    const now=new Date().toISOString();const id=clean(body.id,80)||crypto.randomUUID();
    const existing=await store.get(`${type}/${id}`,{type:'json'}).catch(()=>null);
    const cleaned=cleanRecord(type,body.record);
    if(type==='deliveries'&&existing?.reference&&!cleaned.reference)cleaned.reference=existing.reference;
    const record={id,type,...cleaned,createdAt:existing?.createdAt||now,updatedAt:now};
    await store.setJSON(`${type}/${id}`,record);
    return json({item:record});
  }

  if(action==='delete'&&req.method==='POST'){
    let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const type=clean(body.type,40),id=clean(body.id,80);if(!TYPES.has(type)||!id)return json({error:'Invalid request'},400);
    await store.delete(`${type}/${id}`);return json({ok:true});
  }

  return json({error:'Not found'},404);
};
