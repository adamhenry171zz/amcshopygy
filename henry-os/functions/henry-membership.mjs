import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const PLANS={
  starter:{id:'starter',name:'Starter',fee:5000,allowanceLb:20},
  small_business:{id:'small_business',name:'Small Business',fee:10000,allowanceLb:50},
  business_pro:{id:'business_pro',name:'Business Pro',fee:15000,allowanceLb:100},
  enterprise:{id:'enterprise',name:'Enterprise',fee:30000,allowanceLb:220}
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const digest=v=>crypto.createHash('sha256').update(String(v||'')).digest();
const safeEq=(a,b)=>crypto.timingSafeEqual(digest(a),digest(b));
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');
const parseCookies=s=>Object.fromEntries(String(s||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));
const authenticated=(req,secret,email)=>{const token=parseCookies(req.headers.get('cookie')).henry_session;if(!token)return false;const [payload,sig]=token.split('.');if(!payload||!sig||!safeEq(sign(payload,secret),sig))return false;try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return data.email===email&&Number(data.exp)>Date.now()}catch{return false}};
const clean=(v,max=800)=>String(v??'').trim().replace(/[\u0000-\u001F]/g,'').slice(0,max);
const num=v=>Number(String(v??'').replace(/,/g,''))||0;
const norm=v=>clean(v,240).toLowerCase().replace(/\s+/g,' ');
const readAll=async(store,prefix)=>{const {blobs}=await store.list({prefix});const rows=await Promise.all(blobs.map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));return rows.filter(Boolean)};
const invoiceDate=i=>{const explicit=clean(i.invoiceDate,20);if(/^\d{4}-\d{2}-\d{2}$/.test(explicit))return explicit;const note=String(i.notes||'').match(/Invoice date:\s*(\d{4}-\d{2}-\d{2})/i);if(note)return note[1];const d=String(i.createdAt||i.updatedAt||'');return /^\d{4}-\d{2}-\d{2}/.test(d)?d.slice(0,10):''};
const invoiceWeight=i=>{const direct=num(i.shipmentWeight);if(direct>0)return direct;const d=String(i.description||'').match(/([\d.]+)\s*lb\b/i);if(d)return num(d[1]);const n=String(i.notes||'').match(/Combined weight:\s*([\d.]+)\s*lb\b/i);return n?num(n[1]):0};
const isCancelled=i=>String(i.status||'').toLowerCase()==='cancelled';

async function ensureSeed(store){
  const key='members/leah-casimero-amc203';
  const existing=await store.get(key,{type:'json'}).catch(()=>null);
  if(existing)return;
  const now=new Date().toISOString();
  await store.setJSON(key,{id:'leah-casimero-amc203',customer:'Leah Casimero',mailboxCode:'AMC203',planId:'business_pro',planName:'Business Pro',monthlyFee:'15000',allowanceLb:'100',status:'active',notes:'Confirmed by owner: Leah Casimero is on the GYD $15,000 Business Pro Members Club plan.',createdAt:now,updatedAt:now});
}

export default async req=>{
  const adminEmail=clean(process.env.HENRY_ADMIN_EMAIL,180).toLowerCase();
  const sessionSecret=String(process.env.HENRY_SESSION_SECRET||'');
  if(!adminEmail||sessionSecret.length<32)return json({error:'Henry OS is not configured'},503);
  if(!authenticated(req,sessionSecret,adminEmail))return json({error:'Unauthorized'},401);
  const url=new URL(req.url);const action=url.searchParams.get('action')||'summary';
  const membershipStore=getStore('henry-memberships');
  const amcStore=getStore('henry-amc');
  await ensureSeed(membershipStore);

  if(action==='plans'&&req.method==='GET')return json({plans:Object.values(PLANS)});

  if(action==='save'&&req.method==='POST'){
    let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const customer=clean(body.customer,200),mailboxCode=clean(body.mailboxCode,80),planId=clean(body.planId,40);
    if(!customer)return json({error:'Customer name is required'},400);
    const plan=PLANS[planId];if(!plan)return json({error:'Invalid membership plan'},400);
    const id=clean(body.id,120)||`${norm(mailboxCode||customer).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`;
    const key=`members/${id}`;const existing=await membershipStore.get(key,{type:'json'}).catch(()=>null);const now=new Date().toISOString();
    const item={id,customer,mailboxCode,planId:plan.id,planName:plan.name,monthlyFee:String(plan.fee),allowanceLb:String(plan.allowanceLb),status:clean(body.status,30)||'active',notes:clean(body.notes,1600),createdAt:existing?.createdAt||now,updatedAt:now};
    await membershipStore.setJSON(key,item);return json({item});
  }

  if(action==='summary'&&req.method==='GET'){
    const month=/^\d{4}-\d{2}$/.test(url.searchParams.get('month')||'')?url.searchParams.get('month'):new Date().toISOString().slice(0,7);
    const [members,invoices]=await Promise.all([readAll(membershipStore,'members/'),readAll(amcStore,'invoices/')]);
    const items=members.filter(m=>String(m.status||'active')!=='inactive').map(m=>{
      const usedInvoices=invoices.filter(i=>!isCancelled(i)&&invoiceDate(i).slice(0,7)===month&&norm(i.customer)===norm(m.customer));
      const usedLb=Math.round(usedInvoices.reduce((s,i)=>s+invoiceWeight(i),0)*10000)/10000;
      const allowance=num(m.allowanceLb)||PLANS[m.planId]?.allowanceLb||0;
      const remainingLb=Math.round(Math.max(0,allowance-usedLb)*10000)/10000;
      const overageLb=Math.round(Math.max(0,usedLb-allowance)*10000)/10000;
      const percent=allowance?Math.round((usedLb/allowance)*1000)/10:0;
      return {...m,usedLb,remainingLb,overageLb,percent,invoiceCount:usedInvoices.length,invoices:usedInvoices.map(i=>({invoiceNo:i.invoiceNo||'',date:invoiceDate(i),weightLb:invoiceWeight(i),status:i.status||''}))};
    }).sort((a,b)=>a.customer.localeCompare(b.customer));
    return json({month,plans:Object.values(PLANS),items,totals:{members:items.length,allowanceLb:items.reduce((s,x)=>s+num(x.allowanceLb),0),usedLb:Math.round(items.reduce((s,x)=>s+x.usedLb,0)*10000)/10000}});
  }

  return json({error:'Not found'},404);
};
