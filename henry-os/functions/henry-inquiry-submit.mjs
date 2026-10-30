import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clean=(v,max=1200)=>String(v??'').trim().replace(/[\u0000-\u001F]/g,'').slice(0,max);
const clientKey=req=>crypto.createHash('sha256').update(req.headers.get('x-nf-client-connection-ip')||req.headers.get('x-forwarded-for')||'unknown').digest('hex').slice(0,32);
export default async(req)=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);let body;try{body=await req.json()}catch{return json({error:'Invalid request'},400)}
 const limiter=getStore('henry-public-security'),limitKey=`inquiry/${clientKey(req)}`,now=Date.now();let state=await limiter.get(limitKey,{type:'json'}).catch(()=>null);if(!state||now-(state.firstAt||0)>60*60*1000)state={count:0,firstAt:now};if((state.count||0)>=15)return json({error:'Too many requests'},429);state.count++;await limiter.setJSON(limitKey,state).catch(()=>{});
 const fields=body.fields&&typeof body.fields==='object'?body.fields:{};const pick=(...keys)=>{for(const k of keys)if(fields[k])return clean(fields[k]);return ''};
 const id=crypto.randomUUID(),stamp=new Date().toISOString(),formName=clean(body.formName,100)||'website-form';
 const record={id,type:'inquiries',customer:pick('name','customer','fullName','firstName'),whatsapp:pick('whatsapp','phone','telephone'),email:pick('email'),subject:pick('topic','subject','service')||formName,channel:'Website',status:'new',message:pick('message','details','notes','request'),followUpDate:'',notes:`Captured automatically from website form: ${formName}`,createdAt:stamp,updatedAt:stamp};
 await getStore('henry-amc').setJSON(`inquiries/${id}`,record,{onlyIfNew:true});return json({ok:true});
};
