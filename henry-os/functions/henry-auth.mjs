import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest();
const safeEq=(a,b)=>{const x=hash(a),y=hash(b);return crypto.timingSafeEqual(x,y)};
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');
const cookie=(token,maxAge)=>`henry_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const parseCookies=s=>Object.fromEntries(String(s||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));
const sessionOk=(req,secret,email)=>{const token=parseCookies(req.headers.get('cookie')).henry_session;if(!token)return false;const [payload,sig]=token.split('.');if(!payload||!sig||!safeEq(sign(payload,secret),sig))return false;try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return data.email===email&&Number(data.exp)>Date.now()}catch{return false}};
const clientKey=req=>{const ip=req.headers.get('x-nf-client-connection-ip')||req.headers.get('x-forwarded-for')||'unknown';return crypto.createHash('sha256').update(ip).digest('hex').slice(0,32)};

export default async(req)=>{
  const adminEmail=String(process.env.HENRY_ADMIN_EMAIL||'').trim().toLowerCase();
  const adminPassword=String(process.env.HENRY_ADMIN_PASSWORD||'');
  const sessionSecret=String(process.env.HENRY_SESSION_SECRET||'');
  const missing=[];
  if(!adminEmail)missing.push('HENRY_ADMIN_EMAIL');
  if(!adminPassword)missing.push('HENRY_ADMIN_PASSWORD');
  if(sessionSecret.length<32)missing.push('HENRY_SESSION_SECRET (must be at least 32 characters)');
  if(missing.length)return json({error:'Private owner login is not configured yet',missing},503);
  const url=new URL(req.url); const action=url.searchParams.get('action')||'';
  if(action==='session'&&req.method==='GET')return json({authenticated:sessionOk(req,sessionSecret,adminEmail)});
  if(action==='logout'&&req.method==='POST')return json({ok:true},200,{'set-cookie':cookie('',0)});
  if(action!=='login'||req.method!=='POST')return json({error:'Not found'},404);
  let body;try{body=await req.json()}catch{return json({error:'Invalid request'},400)}
  const email=String(body.email||'').trim().toLowerCase(); const password=String(body.password||'');
  if(password.length>256)return json({error:'Invalid credentials'},401);
  const store=getStore('henry-auth-security'); const key=`attempts/${clientKey(req)}`; const now=Date.now();
  let state=await store.get(key,{type:'json'}).catch(()=>null); if(!state||now-(state.firstAt||0)>15*60*1000)state={count:0,firstAt:now,lockUntil:0};
  if((state.lockUntil||0)>now)return json({error:'Too many attempts. Try again later.'},429,{'retry-after':String(Math.ceil((state.lockUntil-now)/1000))});
  const valid=safeEq(email,adminEmail)&&safeEq(password,adminPassword);
  if(!valid){state.count=(state.count||0)+1;if(state.count>=5)state.lockUntil=now+15*60*1000;await store.setJSON(key,state).catch(()=>{});return json({error:'Invalid credentials'},401)}
  await store.setJSON(key,{count:0,firstAt:now,lockUntil:0}).catch(()=>{});
  const payload=Buffer.from(JSON.stringify({email:adminEmail,exp:now+8*60*60*1000})).toString('base64url');
  return json({ok:true},200,{'set-cookie':cookie(`${payload}.${sign(payload,sessionSecret)}`,8*60*60)});
};
