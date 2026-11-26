import crypto from 'node:crypto';
import {getStore,getDeployStore} from '@netlify/blobs';
import {text,safeSheinLink,safeRetailLink,retailer,normalizeItems,quoteTotals,deliveryWindow,parseCartText,validateScreenshot} from './henry-shein-quote-rules.mjs';
import {extractImages,reserveAttempt} from './henry-smart-quote-ai.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const digest=s=>crypto.createHash('sha256').update(String(s)).digest();
function owner(req){
 const secret=String(process.env.HENRY_SESSION_SECRET||''),email=String(process.env.HENRY_ADMIN_EMAIL||'').trim().toLowerCase();
 if(secret.length<32||!email)return false;
 try{const cookie=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('henry_session='))?.slice(14)||'';
 const [p,s,...rest]=cookie.split('.');if(!p||!s||rest.length)return false;
 const sig=crypto.createHmac('sha256',secret).update(p).digest('base64url');
 if(!crypto.timingSafeEqual(digest(s),digest(sig)))return false;
 const payload=JSON.parse(Buffer.from(p,'base64url').toString('utf8'));return payload.email===email&&Number(payload.exp)>Date.now()}catch{return false}
}
const read=(store,key)=>store.get(key,{type:'json'});
const isId=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const key=id=>'quotes/'+id;
const evidenceKey=id=>'evidence/'+id;
async function withEvidence(store,row){const evidence=await read(store,evidenceKey(row.id));return {...row,retailer:row.retailer||'SHEIN',screenshots:evidence?.screenshots||[],ai:await read(store,'ai/'+row.id)}}
const statuses=['new','review','needs_info','approved','sent','deposit_paid','ordered','arrived','paid','cancelled'];
const transition={new:['review','needs_info','cancelled'],review:['needs_info','approved','cancelled'],needs_info:['review','cancelled'],approved:['review','sent','cancelled'],sent:['review','deposit_paid','cancelled'],deposit_paid:['ordered','cancelled'],ordered:['arrived'],arrived:['paid'],paid:[],cancelled:[]};
const now=()=>new Date().toISOString();
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
function paymentList(items){if(!Array.isArray(items)||items.length>100)throw Error('Invalid payment records.');return items.map(p=>{
 const amount=Number(p.amount);if(!Number.isSafeInteger(amount)||amount<=0||amount>100000000)throw Error('Enter a positive whole GYD payment amount.');
 const date=text(p.date,10);if(!dateOk(date))throw Error('Enter a valid payment date.');
 const ref=text(p.reference,120);if(!ref)throw Error('Payment reference is required.');
 return {amount,date,reference:ref};
 })}
// Public endpoint never contacts arbitrary URLs or forwards customer information to third parties.
export default async(req,context)=>{
 const production=context?.deploy?.context==='production';
 // Preview cannot read or mutate production quotation storage.
 const store=production?getStore({name:'henry-amc-smart-quotes',consistency:'strong'}):getDeployStore({name:'henry-amc-smart-quotes-preview',consistency:'strong'});
 const action=new URL(req.url).searchParams.get('action')||'';
 if(production&&process.env.AMC_SMART_SHEIN_ENABLE_PRODUCTION!=='true')return json({error:'Feature not released.'},404);
 const admin=action.startsWith('admin_');
 if(admin&&!owner(req))return json({error:'Owner login required.'},401);
 if(req.method==='POST'&&req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Invalid origin.'},403);
 try{
  if(action==='admin_list'&&req.method==='GET'){
   const data=await store.list({prefix:'quotes/',paginate:false});
   const rows=await Promise.all(data.blobs.slice(0,250).map(b=>read(store,b.key)));
   return json({preview:!production,quotes:rows.filter(Boolean).map(({items,...q})=>({...q,itemCount:items.length})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),limit:250});
  }
  if(action==='admin_get'&&req.method==='GET'){
   const id=new URL(req.url).searchParams.get('id')||'';
   if(!isId(id))return json({error:'Invalid quote ID.'},400);
   const row=await read(store,key(id));return row?json({quote:await withEvidence(store,row)}):json({error:'Quote not found.'},404);
  }
  if(req.method!=='POST')return json({error:'Not found.'},404);
  if(Number(req.headers.get('content-length')||0)>4500000)return json({error:'Request too large.'},413);
  const raw=await req.text();if(Buffer.byteLength(raw)>4500000)return json({error:'Request too large.'},413);
  let b;try{b=JSON.parse(raw)}catch{return json({error:'Invalid JSON.'},400)}
  if(!b||typeof b!=='object'||Array.isArray(b))return json({error:'Invalid request.'},400);
  if(action==='parse'){
   return json({items:parseCartText(b.cartText,retailer(b.retailer)),source:'customer_export',warning:'Confirm every quantity, size, colour and USD unit price.'});
  }
  if(action==='extract'){
   const link=safeRetailLink(b.cartLink,retailer(b.retailer));if(!link)throw Error('Enter a retailer product or cart link.');
   return json({status:'provider_not_configured',items:[],message:'Link format checked. Direct link extraction is unavailable. Upload cart screenshots for owner-reviewed AI extraction.'});
  }
  if(action==='submit'){
   if(b.website)throw Error('Invalid submission.');
   const name=text(b.name,160),whatsapp=text(b.whatsapp,40),email=text(b.email,160),storeName=retailer(b.retailer),cartLink=safeRetailLink(b.cartLink,storeName),notes=text(b.notes,2000);
   if(name.length<2||!(/^[+0-9 ()-]{7,40}$/.test(whatsapp)))throw Error('Enter your name and valid WhatsApp number.');
   if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Invalid email address.');
   if(b.usConfirmed!==true)throw Error('Confirm US store location and USD prices.');
   const items=normalizeItems(b.items||[],{store:storeName}),screenshots=(Array.isArray(b.screenshots)?b.screenshots:[]);
   if(screenshots.length>3)throw Error('Maximum three screenshots.');
   const checked=screenshots.map(validateScreenshot);
   if(checked.length&&b.aiConsent!==true)throw Error('Confirm consent to AI processing of cart screenshots, or use manual entry without screenshots.');
   if(!cartLink&&!items.length&&!checked.length)throw Error('Add a share link, items or screenshots.');
   const client=req.headers.get('x-nf-client-connection-ip')||'unknown';
   const clientKey='rate/'+digest(client).toString('hex')+'/'+now().slice(0,13);
   const count=await read(store,clientKey)||{count:0};
   if(count.count>=12)return json({error:'Too many quotation requests. Please try later.'},429);
   await store.setJSON(clientKey,{count:count.count+1});
   const id=crypto.randomUUID(),createdAt=now(),reference='SQ-'+id.slice(0,8).toUpperCase();
   const row={id,reference,name,whatsapp,email,retailer:storeName,cartLink,notes,items,aiConsent:b.aiConsent===true,screenshotCount:checked.length,source:text(b.source,40)||'customer_manual',status:'new',feesUsd:0,extraGyd:0,feeNote:'',orderTuesday:'',followUp:'',ownerNotes:'',payments:[],createdAt,updatedAt:createdAt,version:1,events:[{at:createdAt,status:'new'}]};
   if(checked.length)await store.setJSON(evidenceKey(id),{screenshots:checked},{onlyIfNew:true});
   const saved=await store.setJSON(key(id),row,{onlyIfNew:true});
   if(saved?.modified===false)throw Error('Could not save request; please retry.');
   return json({ok:true,reference},201);
  }
  if(action==='admin_ai'){
   const id=text(b.id,40);if(!isId(id))throw Error('Invalid quote ID.');
   const row=await read(store,key(id));if(!row)return json({error:'Quote not found.'},404);
   if(!['new','review','needs_info'].includes(row.status))throw Error('Reopen for review before extracting.');
   if(row.version!==b.version)return json({error:'Quote changed. Refresh first.'},409);
   if(!row.aiConsent)throw Error('Screenshot AI consent is missing. Resubmit with consent or enter manually.');
   if(!process.env.OPENAI_API_KEY)throw Error('OpenAI API key not configured in this deploy context.');
   const evidence=await read(store,evidenceKey(id));if(!evidence?.screenshots?.length)throw Error('No screenshots. Ask customer to upload cart screenshots.');
   const jobKey='ai/'+id,existing=await read(store,jobKey);
   if(existing)return json({ai:existing,cached:true});
   const started={state:'processing',at:now()};
   const lock=await store.setJSON(jobKey,started,{onlyIfNew:true});
   if(lock?.modified===false)return json({ai:await read(store,jobKey),cached:true});
   try{
    const allowance=await reserveAttempt(store);
    const result=await extractImages(evidence.screenshots,row.retailer||'SHEIN',{apiKey:process.env.OPENAI_API_KEY});
    const ai={state:'ready',at:now(),allowance,...result};await store.setJSON(jobKey,ai);return json({ai});
   }catch(e){const ai={state:'failed',at:now(),error:text(e.message,250)};await store.setJSON(jobKey,ai);return json({ai});}
  }
  if(action==='admin_save'){
   const id=text(b.id,40);if(!isId(id))throw Error('Invalid quote ID.');
   const record=await store.getWithMetadata(key(id),{type:'json'});
   if(!record?.data)return json({error:'Quote not found.'},404);
   const old=record.data;
   if(b.version!==old.version)return json({error:'This quotation was changed. Refresh before saving.'},409);
   const status=text(b.status,30);
   if(!statuses.includes(status)||status!==old.status&&!transition[old.status]?.includes(status))throw Error('Invalid status transition.');
   const locked=['approved','sent','deposit_paid','ordered','arrived','paid','cancelled'].includes(old.status)&&status!=='review';
   const storeName=locked?(old.retailer||'SHEIN'):retailer(b.retailer||old.retailer),items=locked?old.items:normalizeItems(b.items||[],{store:storeName}),feesUsd=locked?old.feesUsd:Number(b.feesUsd||0),extraGyd=locked?old.extraGyd:Number(b.extraGyd||0),feeNote=locked?old.feeNote:text(b.feeNote,500),orderTuesday=locked?old.orderTuesday:text(b.orderTuesday,10);
   const payments=paymentList(b.payments||[]);if(payments.length&&['new','review','needs_info','cancelled'].includes(status))throw Error('Record payments only on approved or sent orders.');
   const followUp=text(b.followUp,10);if(followUp&&!dateOk(followUp))throw Error('Invalid follow-up date.');
   let totals=null,delivery=null;
   if(['approved','sent','deposit_paid','ordered','arrived','paid'].includes(status)){
    const complete=normalizeItems(items,{complete:true,store:storeName});
    totals=quoteTotals(complete,feesUsd,extraGyd,storeName);delivery=deliveryWindow(orderTuesday,storeName);
    if(storeName!=='SHEIN'&&!(locked?old.freightAcknowledged===true:b.freightAcknowledged===true))throw Error('Confirm freight review for this retailer; use extra GYD for applicable freight.');
    if(totals.unknownWeights&&(locked?old.weightsAcknowledged!==true:b.weightsAcknowledged!==true))throw Error('Acknowledge unknown weights before approving.');
    if((feesUsd||extraGyd)&&!feeNote)throw Error('Describe the added fees before approval.');
    const paid=payments.reduce((n,p)=>n+p.amount,0);
    if(['deposit_paid','ordered','arrived','paid'].includes(status)&&paid<totals.down)throw Error('Recorded payments must cover the down payment.');
    if(status==='paid'&&paid<totals.overall)throw Error('Full payment has not been recorded.');
    if(paid>totals.overall)throw Error('Recorded payments exceed quotation total.');
   }
   const stamp=now(),row={...old,retailer:storeName,freightAcknowledged:locked?old.freightAcknowledged:b.freightAcknowledged===true,items,feesUsd,extraGyd,feeNote,orderTuesday,totals,delivery,weightsAcknowledged:locked?old.weightsAcknowledged:b.weightsAcknowledged===true,followUp,ownerNotes:text(b.ownerNotes,3000),payments,status,updatedAt:stamp,version:old.version+1,events:[...old.events,{at:stamp,status}].slice(-200)};
   const saved=await store.setJSON(key(id),row,{onlyIfMatch:record.etag});
   if(saved?.modified===false)return json({error:'Another update occurred; refresh and retry.'},409);
   return json({quote:await withEvidence(store,row)});
  }
  return json({error:'Unknown action.'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'Unable to complete request.'},400)}
};
