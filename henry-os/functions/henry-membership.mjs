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


const roundLb=v=>Math.round(num(v)*10000)/10000;
const monthValid=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));
const guyanaMonth=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guyana',year:'numeric',month:'2-digit'}).formatToParts(new Date());return ['year','month'].map(k=>parts.find(v=>v.type===k).value).join('-')};
const isMemberInvoice=i=>i.invoiceSnapshot?.customerType==='member'||/^MC\d+/i.test(String(i.invoiceNo||''))||/^Members Club Shipping Invoice/i.test(String(i.description||''));
const mailboxOf=i=>norm(i.invoiceSnapshot?.mailboxCode||i.mailboxCode||String(i.notes||'').match(/(?:Mailbox|Customer code):\s*(AMC\d+)/i)?.[1]);
const matchesMember=(i,m)=>{const box=mailboxOf(i),memberBox=norm(m.mailboxCode);if(box&&memberBox)return box===memberBox;const name=norm(i.customer);return name===norm(m.customer)||(memberBox==='amc203'&&['leah casimir','leah casimero'].includes(name));};
const LEAH_CREDIT={id:'missed-shipment-2026-11-amc203',memberId:'leah-casimero-amc203',mailboxCode:'AMC203',month:'2026-11',pounds:20,reason:'One-time allowance for missed shipment and subsequent double shipment',type:'missed_shipment',approvedByOwner:true};
const creditKey=c=>'allowance-credits/'+c.month+'/'+c.memberId+'/'+c.id;
async function ensureCredit(store,production){
 const key=creditKey(LEAH_CREDIT);
 const existing=await store.get(key,{type:'json'}).catch(()=>null);
 if(!existing&&production)await store.setJSON(key,{...LEAH_CREDIT,createdAt:new Date().toISOString()});
 return existing||LEAH_CREDIT;
}
function usageForMember(m,month,invoices,credits){
 const base=roundLb(num(m.allowanceLb)||PLANS[m.planId]?.allowanceLb||0);
 const applicable=credits.filter(c=>c.month===month&&c.memberId===m.id&&c.type==='missed_shipment'&&c.approvedByOwner===true);
 const adjustment=roundLb(applicable.reduce((a,c)=>a+num(c.pounds),0)),allowance=roundLb(base+adjustment);
 const ordered=invoices.filter(i=>!isCancelled(i)&&isMemberInvoice(i)&&invoiceDate(i).slice(0,7)===month&&matchesMember(i,m))
 .sort((a,b)=>invoiceDate(a).localeCompare(invoiceDate(b))||String(a.invoiceNo||'').localeCompare(String(b.invoiceNo||''),undefined,{numeric:true})||String(a.id||'').localeCompare(String(b.id||'')));
 const seen=new Set();let used=0;
 const rows=[];for(const i of ordered){const key=norm(i.invoiceNo)||i.id;if(seen.has(key))continue;seen.add(key);const before=used,weight=roundLb(invoiceWeight(i));used=roundLb(used+weight);rows.push({id:i.id,invoiceNo:i.invoiceNo||'',date:invoiceDate(i),weightLb:weight,usedBeforeLb:before,usedThroughLb:used,remainingLb:roundLb(Math.max(0,allowance-used)),overageLb:roundLb(Math.max(0,used-allowance)),status:i.status||''});}
 return {...m,month,baseAllowanceLb:base,adjustmentLb:adjustment,allowanceLb:allowance,credits:applicable.map(c=>({pounds:c.pounds,reason:c.reason,month:c.month})),usedLb:used,remainingLb:roundLb(Math.max(0,allowance-used)),overageLb:roundLb(Math.max(0,used-allowance)),percent:allowance?Math.round(used/allowance*1000)/10:0,invoiceCount:rows.length,invoices:rows};
}

async function ensureSeed(store){
  const key='members/leah-casimero-amc203';
  const existing=await store.get(key,{type:'json'}).catch(()=>null);
  if(existing)return;
  const now=new Date().toISOString();
  await store.setJSON(key,{id:'leah-casimero-amc203',customer:'Leah Casimero',mailboxCode:'AMC203',planId:'business_pro',planName:'Business Pro',monthlyFee:'15000',allowanceLb:'100',status:'active',notes:'Confirmed by owner: Leah Casimero is on the GYD $15,000 Business Pro Members Club plan.',createdAt:now,updatedAt:now});
}

export default async (req,context)=>{
  const adminEmail=clean(process.env.HENRY_ADMIN_EMAIL,180).toLowerCase();
  const sessionSecret=String(process.env.HENRY_SESSION_SECRET||'');
  if(!adminEmail||sessionSecret.length<32)return json({error:'Henry OS is not configured'},503);
  if(!authenticated(req,sessionSecret,adminEmail))return json({error:'Unauthorized'},401);
  const url=new URL(req.url);const action=url.searchParams.get('action')||'summary';
  const membershipStore=getStore('henry-memberships');
  const amcStore=getStore('henry-amc');
  const production=context?.deploy?.context==='production';
  if(req.method==='POST'&&!production)return json({error:'Deployment previews are read-only.'},403);
  if(production)await ensureSeed(membershipStore);
  const ownerCredit=await ensureCredit(membershipStore,production);
  const creditsFor=async month=>{const rows=await readAll(membershipStore,'allowance-credits/'+month+'/');if(month===ownerCredit.month&&!rows.some(c=>c.id===ownerCredit.id&&c.memberId===ownerCredit.memberId))rows.push(ownerCredit);return rows;};

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


  if(action==='grant_missed_shipment'&&req.method==='POST'){
    let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
    const memberId=clean(body.memberId,120),month=clean(body.month,20),reason=clean(body.reason,400),ref=clean(body.reference,100).toLowerCase().replace(/[^a-z0-9_-]+/g,'-');
    const pounds=Number(body.pounds);
    if(body.confirmed!==true||!monthValid(month)||!reason||!ref||!Number.isFinite(pounds)||pounds<=0||pounds>1000)return json({error:'Confirm the missed shipment, month, pounds, reason and unique shipment reference.'},400);
    const member=await membershipStore.get('members/'+memberId,{type:'json'}).catch(()=>null);
    if(!member)return json({error:'Member not found'},404);
    const record={id:ref,memberId,month,pounds:roundLb(pounds),reason,type:'missed_shipment',approvedByOwner:true,createdAt:new Date().toISOString()};
    const key=creditKey(record),prior=await membershipStore.get(key,{type:'json'}).catch(()=>null);
    if(prior)return json({error:'This missed-shipment reference already has an allowance credit for this member and month.'},409);
    await membershipStore.setJSON(key,record);return json({item:record},201);
  }
  if(action==='summary'&&req.method==='GET'){
    const requested=url.searchParams.get('month'),month=monthValid(requested)?requested:guyanaMonth();
    const [members,invoices,credits]=await Promise.all([readAll(membershipStore,'members/'),readAll(amcStore,'invoices/'),creditsFor(month)]);
    const items=members.filter(m=>String(m.status||'active')!=='inactive').map(m=>usageForMember(m,month,invoices,credits)).sort((a,b)=>a.customer.localeCompare(b.customer));
    return json({month,plans:Object.values(PLANS),items,policy:'No automatic rollover. Only owner-approved missed or delayed shipment credits apply to the specified month.',totals:{members:items.length,allowanceLb:items.reduce((s,x)=>s+num(x.allowanceLb),0),usedLb:roundLb(items.reduce((s,x)=>s+x.usedLb,0))}});
  }
  if(action==='invoice_usage'&&req.method==='GET'){
    const id=clean(url.searchParams.get('id'),220);
    if(!id||!/^[a-zA-Z0-9_-]+$/.test(id))return json({error:'Invalid invoice ID'},400);
    const invoice=await amcStore.get('invoices/'+id,{type:'json'}).catch(()=>null);
    if(!invoice||!isMemberInvoice(invoice)||isCancelled(invoice))return json({error:'No active member invoice found'},404);
    const month=invoiceDate(invoice).slice(0,7);
    if(!monthValid(month))return json({error:'Invoice date is missing'},409);
    const [members,invoices,credits]=await Promise.all([readAll(membershipStore,'members/'),readAll(amcStore,'invoices/'),creditsFor(month)]);
    const matching=members.filter(m=>matchesMember(invoice,m));
    if(matching.length!==1)return json({error:'Link this invoice to exactly one Members Club record (mailbox code or customer name) before downloading the member invoice.'},409);
    const u=usageForMember(matching[0],month,invoices,credits),row=u.invoices.find(i=>i.id===id)||u.invoices.find(i=>i.invoiceNo===invoice.invoiceNo);
    if(!row||!(row.weightLb>0))return json({error:'Member shipment weight could not be verified. Correct the invoice record before sending.'},409);
    return json({usage:{month,planName:u.planName,baseAllowanceLb:u.baseAllowanceLb,adjustmentLb:u.adjustmentLb,allowanceLb:u.allowanceLb,credits:u.credits,shipmentLb:row.weightLb,usedBeforeLb:row.usedBeforeLb,usedThroughLb:row.usedThroughLb,remainingLb:row.remainingLb,overageLb:row.overageLb,invoiceCount:u.invoiceCount,policy:'No automatic rollover. Additional pounds only by AMC approval for missed or delayed shipments.'}});
  }

  return json({error:'Not found'},404);
};
