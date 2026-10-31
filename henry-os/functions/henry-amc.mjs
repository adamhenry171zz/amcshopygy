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

const OCT30_INVOICES = [
  {
    invoiceNo:'INV0299',customer:'Daviana Dass',amount:'14820.41',balance:'0',status:'paid',dueDate:'',
    description:'Shipping Invoice · 5 packages · 9.8803 lb',
    notes:'Invoice date: 2026-10-30. Customer code: AMC21095. Regular customer. Billing: GYD $1,500/lb. Package fee: none. Tracking: SWX805020000208030527; GFUS01078149934979; GFUS01078181396225; GFUS01078373692804; SPXBPA013642610140112757. User confirmed this invoice was paid via MMG.'
  },
  {
    invoiceNo:'MC0036',customer:'Leah Casimero',amount:'21407.17',balance:'21407.17',status:'sent',dueDate:'',
    description:'Members Club Shipping Invoice · 18 packages · 22.5339 lb',
    notes:'Invoice date: 2026-10-30. Mailbox: AMC203. AMC Member. Package fees waived. Member total GYD $21,407.17; regular customer total GYD $29,294.03; estimated savings GYD $7,886.86. Tracking: SWX696890000213763394; GFUS01079558479745; GFUS01077957990031; 9300120842400032101035; 9300120842400031935457; GFUS01079003684608; GFUS01078961106560; GFUS01079562686342; GFUS01078643488128; GFUS01079032981384; GFUS010786886441346; SPXBPA015562610170002606; SWX048770000216492860; SPXBPA013642610160015096; GFUS01078289303041; GFUS01077249928704; GFUS01077769365122; SWX505930000213858670.'
  },
  {
    invoiceNo:'INV0301',customer:'Orlistyne Paul',amount:'12585.00',balance:'12585.00',status:'sent',dueDate:'',
    description:'Shipping Invoice · 2 packages · 8.3900 lb',
    notes:'Invoice date: 2026-10-30. Customer code: AMC39. Regular customer. Billing: GYD $1,500/lb. Package fee: none. Tracking: TBA335790050942; TBA335797558454.'
  },
  {
    invoiceNo:'INV0300',customer:'Raymond Marques',amount:'2800.00',balance:'2800.00',status:'sent',dueDate:'',
    description:'Shipping Invoice · 1 package · 1.4400 lb',
    notes:'Invoice date: 2026-10-30. Customer code: AMC113. Regular customer. Billing: GYD $2,800 flat 1–2 lb special. Package fee: none. Tracking: GFUS01078372279682.'
  },
  {
    invoiceNo:'INV0302',customer:'Ruth Britton',amount:'2800.00',balance:'2800.00',status:'sent',dueDate:'',
    description:'Shipping Invoice · 1 package · 0.7000 lb',
    notes:'Invoice date: 2026-10-30. Customer code: AMC251. Regular customer. Billing: GYD $2,800 flat 1–2 lb special. Package fee: none. Tracking: TBA335792632870.'
  },
  {
    invoiceNo:'INV0303',customer:'Shawnna Althea Richards',amount:'4060.50',balance:'4060.50',status:'sent',dueDate:'',
    description:'Shipping Invoice · 1 package · 2.7070 lb',
    notes:'Invoice date: 2026-10-30. Customer code not provided. Regular customer. Billing: GYD $1,500/lb. Package fee: none. Tracking: GFUS01078103576065.'
  }
];

async function applyOct30InvoiceMigration(store){
  const markerKey='migrations/2026-10-30-invoices-0299-0303-mc0036-v1';
  const already=await store.get(markerKey,{type:'json'}).catch(()=>null);
  if(already?.done)return;
  const now=new Date().toISOString();
  const invoices=await readType(store,'invoices');
  for(const source of OCT30_INVOICES){
    const existing=invoices.find(x=>String(x.invoiceNo||'').toUpperCase()===source.invoiceNo);
    if(existing){
      const merged={...source,...existing,invoiceNo:source.invoiceNo,customer:source.customer,updatedAt:now};
      if(source.invoiceNo==='INV0299')Object.assign(merged,{amount:'14820.41',balance:'0',status:'paid',notes:source.notes});
      await store.setJSON(`invoices/${existing.id}`,merged);
    }else{
      const id=`import-${source.invoiceNo.toLowerCase()}`;
      await store.setJSON(`invoices/${id}`,{id,type:'invoices',...source,createdAt:now,updatedAt:now});
    }
  }
  const payments=await readType(store,'payments');
  let payment=payments.find(x=>String(x.relatedId||'').toUpperCase()==='INV0299'&&String(x.customer||'').toLowerCase()==='daviana dass');
  const paymentRecord={customer:'Daviana Dass',whatsapp:'',amount:'14820.41',method:'MMG',reference:'INV0299-MMG-2026-10-30',status:'verified',paymentDate:'2026-10-30',relatedType:'invoice',relatedId:'INV0299',notes:'Daviana Dass paid shipping invoice INV0299 in full via MMG. Payment status confirmed by the owner.'};
  if(payment){
    payment={...payment,...paymentRecord,updatedAt:now};
    await store.setJSON(`payments/${payment.id}`,payment);
  }else{
    const id='payment-inv0299-mmg-20261030';
    await store.setJSON(`payments/${id}`,{id,type:'payments',...paymentRecord,createdAt:now,updatedAt:now});
  }
  await store.setJSON(markerKey,{done:true,completedAt:now,invoices:OCT30_INVOICES.map(x=>x.invoiceNo),payment:'INV0299 via MMG'});
}

export default async(req)=>{
  const adminEmail=clean(process.env.HENRY_ADMIN_EMAIL,180).toLowerCase();
  const sessionSecret=String(process.env.HENRY_SESSION_SECRET||'');
  if(!adminEmail||sessionSecret.length<32)return json({error:'Henry OS is not configured'},503);
  if(!authenticated(req,sessionSecret,adminEmail))return json({error:'Unauthorized'},401);
  const url=new URL(req.url);const action=url.searchParams.get('action')||'bootstrap';
  const store=getStore('henry-amc');

  if(action==='bootstrap'&&req.method==='GET'){
    await applyOct30InvoiceMigration(store);
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
