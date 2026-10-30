import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(v,max=600)=>String(v??'').trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,max);
const clientKey=req=>{const raw=req.headers.get('x-nf-client-connection-ip')||req.headers.get('x-forwarded-for')||'unknown';return crypto.createHash('sha256').update(raw).digest('hex').slice(0,32)};
const ref=()=>`DLV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

export default async(req)=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  let body;try{body=await req.json()}catch{return json({error:'Invalid request'},400)}
  const customer=clean(body.customer,100),whatsapp=clean(body.whatsapp,40),address=clean(body.address,500);
  if(!customer||whatsapp.replace(/\D/g,'').length<7||!address)return json({error:'Name, WhatsApp number and delivery address are required.'},400);
  if(body.consent!==true)return json({error:'Consent is required to submit a delivery request.'},400);

  const limiter=getStore('henry-public-security');const key=`delivery/${clientKey(req)}`;const now=Date.now();
  let state=await limiter.get(key,{type:'json'}).catch(()=>null);if(!state||now-(state.firstAt||0)>60*60*1000)state={count:0,firstAt:now};
  if((state.count||0)>=8)return json({error:'Too many delivery requests. Please try again later or contact AMC Shopping on WhatsApp.'},429);
  state.count=(state.count||0)+1;await limiter.setJSON(key,state).catch(()=>{});

  const id=crypto.randomUUID(),reference=ref(),createdAt=new Date().toISOString();
  const record={
    id,type:'deliveries',requestType:clean(body.requestType,60)||'Request delivery',customer,whatsapp,
    packageRef:clean(body.packageRef,100),weight:clean(body.weight,40),address,
    landmark:clean(body.landmark,500),mapLink:clean(body.mapLink,800),preferredDate:clean(body.preferredDate,20),preferredTime:clean(body.preferredTime,20),
    status:'awaiting_review',quote:'',paymentStatus:'not_confirmed',source:'website',notes:`Customer request reference: ${reference}`,
    reference,createdAt,updatedAt:createdAt
  };
  const store=getStore('henry-amc');await store.setJSON(`deliveries/${id}`,record,{onlyIfNew:true});
  return json({ok:true,reference,status:'awaiting_review'});
};
