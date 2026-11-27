import crypto from 'node:crypto';
import {getStore,getDeployStore} from '@netlify/blobs';
import {text,safeSheinLink,safeRetailLink,retailer,normalizeItems,quoteTotals,deliveryWindow,parseCartText,validateScreenshot,RATES,normalizeRates,publicEstimate} from './henry-shein-quote-rules.mjs';
import {extractImages,reserveAttempt} from './henry-smart-quote-ai.mjs';
import {renderQuotePdf} from './henry-smart-quote-pdf.mjs';
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
const pricingKey='settings/pricing-v1';
async function defaults(store){const d=await read(store,pricingKey);return d?{rates:normalizeRates(d.rates),version:d.version}:{rates:{...RATES},version:0}}
async function quoteRates(store,row){return row.rates?normalizeRates(row.rates):row.totals||!['new','review','needs_info'].includes(row.status)?{...RATES}:(await defaults(store)).rates}
const evidenceKey=id=>'evidence/'+id;
const accessKey=hash=>'upload-access/'+hash;
const uploadKey=id=>'upload-session/'+id;
const imageKey=(id,index)=>'upload-image/'+id+'/'+index;
const codeHash=code=>digest(String(code)).toString('hex');
const codeInfo=(hash,r)=>({id:hash,name:r.name,kind:r.kind,limit:r.limit,expiresAt:r.expiresAt,maxUses:r.maxUses,uses:r.uses,revoked:r.revoked,createdAt:r.createdAt,lastUsedAt:r.lastUsedAt||null});
function codeActive(r){return r&&!r.revoked&&(!r.expiresAt||Date.parse(r.expiresAt)>Date.now())}
function verifyCode(code){if(typeof code!=='string'||!/^AMC-[A-Za-z0-9_-]{22,64}$/.test(code))throw Error('Invalid or expired access code.');return codeHash(code)}
async function checkCode(store,code,available=true){const hash=verifyCode(code),record=await store.getWithMetadata(accessKey(hash),{type:'json'}),r=record?.data;if(!codeActive(r)||(available&&r.maxUses!==null&&r.uses>=r.maxUses))throw Error('Invalid, expired, revoked or exhausted access code.');return {hash,record,r}}
async function countLimit(store,key,limit){for(let i=0;i<5;i++){const old=await store.getWithMetadata(key,{type:'json'}),count=old?.data?.count||0;if(count>=limit)throw Error('Too many attempts. Please try again later.');const s=await store.setJSON(key,{count:count+1},old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(s?.modified!==false)return}throw Error('Please try again shortly.')}
async function reserveUpload(store,code){for(let i=0;i<5;i++){const {hash,record,r}=await checkCode(store,code);const next={...r,uses:r.uses+1,lastUsedAt:now()};const s=await store.setJSON(accessKey(hash),next,{onlyIfMatch:record.etag});if(s?.modified!==false)return {hash,r:next}}throw Error('Access changed. Try again.')}
async function sessionFor(store,b){if(!isId(b.sessionId||''))throw Error('Invalid upload session.');const {hash,r}=await checkCode(store,b.accessCode,false),session=await read(store,uploadKey(b.sessionId));if(!session||session.codeHash!==hash||Date.parse(session.expiresAt)<=Date.now()||session.count>r.limit)throw Error('Upload session expired or unavailable. Start again.');return session}

async function withEvidence(store,row){const evidence=await read(store,evidenceKey(row.id));return {...row,rates:await quoteRates(store,row),retailer:row.retailer||'SHEIN',screenshots:evidence?.screenshots||[],extendedScreenshots:evidence?.indices||[],ai:await read(store,'ai/'+row.id)}}
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
  if(action==='admin_upload_codes'&&req.method==='GET'){
   const data=await store.list({prefix:'upload-access/'});const codes=await Promise.all(data.blobs.map(async b=>codeInfo(b.key.slice('upload-access/'.length),await read(store,b.key))));return json({codes:codes.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
  }
  if(action==='admin_evidence'&&req.method==='GET'){
   const u=new URL(req.url),id=u.searchParams.get('id')||'',index=Number(u.searchParams.get('index'));if(!isId(id)||!Number.isInteger(index)||index<0||index>=30)throw Error('Invalid screenshot.');
   const row=await read(store,key(id)),manifest=await read(store,evidenceKey(id));if(!row||!manifest?.indices?.includes(index))return json({error:'Screenshot not found.'},404);
   const s=await read(store,imageKey(id,index));if(!s)return json({error:'Screenshot not found.'},404);
   return new Response(Buffer.from(s.data,'base64'),{headers:{'content-type':s.mime,'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  if(action==='admin_pricing'&&req.method==='GET')return json(await defaults(store));
  if(action==='admin_list'&&req.method==='GET'){
   const data=await store.list({prefix:'quotes/',paginate:false});
   const rows=await Promise.all(data.blobs.slice(0,250).map(b=>read(store,b.key)));
   return json({preview:!production,quotes:rows.filter(Boolean).map(({items,...q})=>({...q,itemCount:items.length})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)),limit:250});
  }
  if(action==='admin_pdf'&&req.method==='GET'){
   const id=new URL(req.url).searchParams.get('id')||'';if(!isId(id))return json({error:'Invalid quote ID.'},400);
   const row=await read(store,key(id));if(!row)return json({error:'Quote not found.'},404);
   if(!row.totals||!row.delivery||!['approved','sent','deposit_paid','ordered','arrived','paid'].includes(row.status))return json({error:'Approve the quotation before downloading.'},409);
   return new Response(renderQuotePdf(row),{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC_Quotation_'+row.reference+'.pdf"','cache-control':'no-store','x-content-type-options':'nosniff'}});
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
  if(action==='admin_upload_create'){
   const kind=b.kind==='owner'?'owner':'reseller',name=text(b.name,120)|| (kind==='owner'?'Owner override':'');if(!name)throw Error('Enter a customer/reseller name.');
   const limit=kind==='owner'?30:Number(b.limit),hours=Number(b.hours),maxUses=kind==='owner'||b.maxUses===null?null:Number(b.maxUses);
   if(!Number.isInteger(limit)||limit<5||limit>30||kind==='reseller'&&(!Number.isInteger(hours)||hours<1||hours>720)||maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<1||maxUses>100))throw Error('Invalid access limits.');
   const code='AMC-'+crypto.randomBytes(24).toString('base64url'),hash=codeHash(code),r={name,kind,limit,expiresAt:kind==='owner'?null:new Date(Date.now()+hours*3600000).toISOString(),maxUses,uses:0,revoked:false,createdAt:now()};
   const saved=await store.setJSON(accessKey(hash),r,{onlyIfNew:true});if(saved?.modified===false)throw Error('Could not create code. Try again.');return json({code,access:codeInfo(hash,r)},201);
  }
  if(action==='admin_upload_cleanup'){
   const data=await store.list({prefix:'upload-session/'});let removed=0;
   for(const b of data.blobs.slice(0,100)){const s=await read(store,b.key);if(!s||Date.parse(s.expiresAt)>Date.now()-3600000||await read(store,key(s.id)))continue;
    for(let i=0;i<s.count;i++)await store.delete(imageKey(s.id,i));await store.delete(evidenceKey(s.id));await store.delete(b.key);removed++;if(removed>=3)break;
   }
   return json({removed});
  }
  if(action==='admin_upload_revoke'){
   const hash=String(b.id||'');if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid access record.');const record=await store.getWithMetadata(accessKey(hash),{type:'json'});if(!record?.data)throw Error('Access record not found.');
   const saved=await store.setJSON(accessKey(hash),{...record.data,revoked:true},{onlyIfMatch:record.etag});if(saved?.modified===false)return json({error:'Access changed. Refresh and retry.'},409);return json({ok:true});
  }
  if(action==='upload_check'||action==='upload_start'){
   const ip=digest(req.headers.get('x-nf-client-connection-ip')||'unknown').toString('hex');
   await countLimit(store,'upload-check/'+ip+'/'+now().slice(0,13),60);
   const {r}=await checkCode(store,b.accessCode);
   if(action==='upload_check')return json({limit:r.limit,expiresAt:r.expiresAt});
   const count=Number(b.count);if(!Number.isInteger(count)||count<4||count>r.limit)throw Error('Screenshot count exceeds your access limit.');
   const id=crypto.randomUUID();const {hash}=await reserveUpload(store,b.accessCode);
   const session={id,codeHash:hash,accessName:r.name,accessKind:r.kind,count,expiresAt:new Date(Math.min(Date.now()+2*3600000,r.expiresAt?Date.parse(r.expiresAt):Infinity)).toISOString(),createdAt:now()};
   await store.setJSON(uploadKey(id),session,{onlyIfNew:true});return json({sessionId:id,expiresAt:session.expiresAt});
  }
  if(action==='upload_image'){
   const session=await sessionFor(store,b),index=Number(b.index);if(!Number.isInteger(index)||index<0||index>=session.count)throw Error('Invalid screenshot number.');
   if(await read(store,key(session.id)))throw Error('Quotation already submitted.');
   const s=validateScreenshot(b.screenshot),hash=codeHash(s.data),k=imageKey(session.id,index);
   const saved=await store.setJSON(k,{...s,hash},{onlyIfNew:true});if(saved?.modified===false){const old=await read(store,k);if(old?.hash!==hash)throw Error('Screenshot differs from the saved upload. Start a new request.')}
   return json({ok:true,index});
  }
  if(action==='admin_pricing_save'){
   const rates=normalizeRates(b.rates);
   const record=await store.getWithMetadata(pricingKey,{type:'json'});
   const version=record?.data?.version??0;
   if(b.version!==version)return json({error:'Pricing defaults changed. Reload settings and try again.'},409);
   const next={rates,version:version+1,updatedAt:now()};
   const saved=await store.setJSON(pricingKey,next,record?.data?{onlyIfMatch:record.etag}:{onlyIfNew:true});
   if(saved?.modified===false)return json({error:'Pricing defaults changed. Reload settings and try again.'},409);
   return json({rates:next.rates,version:next.version});
  }
  if(action==='estimate'){
   if(raw.length>8000)throw Error('Estimate request too large.');
   return json(publicEstimate(b.items,(await defaults(store)).rates));
  }
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
   if(screenshots.length>3)throw Error('Maximum three screenshots without extended access.');
   let session=null,indices=[];
   if(b.sessionId){if(screenshots.length)throw Error('Do not mix upload modes.');session=await sessionFor(store,b);const existing=await read(store,key(session.id));if(existing)return json({ok:true,reference:existing.reference},201);
    for(let i=0;i<session.count;i+=5){const chunk=Array.from({length:Math.min(5,session.count-i)},(_,j)=>i+j);const found=await Promise.all(chunk.map(async j=>{const s=await read(store,imageKey(session.id,j));return !!s}));for(let j=0;j<chunk.length;j++){if(!found[j])throw Error('Screenshot '+(chunk[j]+1)+' has not finished uploading.');indices.push(chunk[j])}}
   }
   const checked=screenshots.map(validateScreenshot);
   if((checked.length||indices.length)&&b.aiConsent!==true)throw Error('Confirm consent to AI processing of cart screenshots, or use manual entry without screenshots.');
   if(!cartLink&&!items.length&&!checked.length&&!indices.length)throw Error('Add a share link, items or screenshots.');
   const client=req.headers.get('x-nf-client-connection-ip')||'unknown';
   const clientKey='rate/'+digest(client).toString('hex')+'/'+now().slice(0,13);
   const count=await read(store,clientKey)||{count:0};
   if(count.count>=12)return json({error:'Too many quotation requests. Please try later.'},429);
   await store.setJSON(clientKey,{count:count.count+1});
   const id=session?.id||crypto.randomUUID(),createdAt=now(),reference='SQ-'+id.slice(0,8).toUpperCase();
   const row={id,reference,name,whatsapp,email,rates:(await defaults(store)).rates,retailer:storeName,cartLink,notes,items,aiConsent:b.aiConsent===true,screenshotCount:indices.length||checked.length,extendedUpload:!!session,uploadAccess:session?{name:session.accessName,kind:session.accessKind}:null,source:text(b.source,40)||'customer_manual',status:'new',feesUsd:0,extraGyd:0,feeNote:'',orderTuesday:'',followUp:'',ownerNotes:'',payments:[],createdAt,updatedAt:createdAt,version:1,events:[{at:createdAt,status:'new'}]};
   if(checked.length||indices.length)await store.setJSON(evidenceKey(id),indices.length?{indices}:{screenshots:checked},{onlyIfNew:true});
   const saved=await store.setJSON(key(id),row,{onlyIfNew:true});
   if(saved?.modified===false){const existing=session&&await read(store,key(id));if(existing)return json({ok:true,reference:existing.reference},201);throw Error('Could not save request; please retry.')}
   return json({ok:true,reference},201);
  }
  if(action==='admin_ai'){
   const id=text(b.id,40);if(!isId(id))throw Error('Invalid quote ID.');
   const row=await read(store,key(id));if(!row)return json({error:'Quote not found.'},404);
   if(!['new','review','needs_info'].includes(row.status))throw Error('Reopen for review before extracting.');
   if(row.version!==b.version)return json({error:'Quote changed. Refresh first.'},409);
   if(!row.aiConsent)throw Error('Screenshot AI consent is missing. Resubmit with consent or enter manually.');
   if(!process.env.OPENAI_API_KEY)throw Error('OpenAI API key not configured in this deploy context.');
   const evidence=await read(store,evidenceKey(id));if(evidence?.indices?.length){
    const jobKey='ai/'+id,record=await store.getWithMetadata(jobKey,{type:'json'}),prior=record?.data;
    if(prior&&prior.state!=='partial')return json({ai:prior,cached:true});
    const nextIndex=prior?.nextIndex||0,indices=evidence.indices.slice(nextIndex,nextIndex+3);
    const state={state:'processing',at:now(),nextIndex,totalImages:evidence.indices.length,items:prior?.items||[],evidence:prior?.evidence||[],warnings:prior?.warnings||[],checkoutNotes:prior?.checkoutNotes||'',inputTokens:prior?.inputTokens||0,outputTokens:prior?.outputTokens||0,estimatedUsd:prior?.estimatedUsd||0,seenHashes:prior?.seenHashes||[],allowance:prior?.allowance};
    const lock=await store.setJSON(jobKey,state,record?{onlyIfMatch:record.etag}:{onlyIfNew:true});if(lock?.modified===false)return json({ai:await read(store,jobKey),cached:true});
    try{
     const images=[];for(const i of indices){const s=await read(store,imageKey(id,i));if(!s)throw Error('Screenshot '+(i+1)+' is missing.');if(!state.seenHashes.includes(s.hash)){state.seenHashes.push(s.hash);images.push(s)}else state.warnings.push('Duplicate screenshot '+(i+1)+' skipped.')}
     if(images.length){state.allowance=await reserveAttempt(store);const result=await extractImages(images,row.retailer||'SHEIN',{apiKey:process.env.OPENAI_API_KEY});if(state.items.length+result.items.length>150)throw Error('More than 150 products. Split the cart into separate quotation requests.');
      const priorKeys=new Set(state.items.map(x=>JSON.stringify([x.name.toLowerCase(),x.size.toLowerCase(),x.color.toLowerCase(),x.price,x.sku])));
      result.items.forEach((x,i)=>{if(priorKeys.has(JSON.stringify([x.name.toLowerCase(),x.size.toLowerCase(),x.color.toLowerCase(),x.price,x.sku])))state.warnings.push('Possible overlap at row '+(state.items.length+i+1)+'; compare screenshots before approval.')});
      state.items.push(...result.items);state.evidence.push(...result.evidence.map(x=>'Images '+(nextIndex+1)+'–'+(nextIndex+indices.length)+': '+x));state.warnings.push(...result.warnings.map(x=>'Batch '+(Math.floor(nextIndex/3)+1)+': '+x));state.checkoutNotes=(state.checkoutNotes+'\n'+result.checkoutNotes).trim().slice(0,4000);state.inputTokens+=result.inputTokens;state.outputTokens+=result.outputTokens;state.estimatedUsd+=result.estimatedUsd;
     }
     state.nextIndex=nextIndex+indices.length;state.state=state.nextIndex===state.totalImages?'ready':'partial';state.warnings=[...new Set(state.warnings)].slice(0,250);
    }catch(e){state.state='failed';state.error=text(e.message,250);state.warnings.push('Extraction stopped after '+nextIndex+' of '+state.totalImages+' screenshots. Review remaining screenshots manually.');}
    await store.setJSON(jobKey,state);return json({ai:state});
   }
   if(!evidence?.screenshots?.length)throw Error('No screenshots. Ask customer to upload cart screenshots.');
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
   if(!statuses.includes(status)||status!==old.status&&!transition[old.status]?.includes(status)&&!(status==='approved'&&b.approve===true&&['new','needs_info'].includes(old.status)))throw Error('Invalid status transition.');
   const locked=['approved','sent','deposit_paid','ordered','arrived','paid','cancelled'].includes(old.status)&&status!=='review';
   const storeName=locked?(old.retailer||'SHEIN'):retailer(b.retailer||old.retailer),items=locked?old.items:normalizeItems(b.items||[],{store:storeName}),feesUsd=locked?old.feesUsd:Number(b.feesUsd||0),extraGyd=locked?old.extraGyd:Number(b.extraGyd||0),feeNote=locked?old.feeNote:text(b.feeNote,500),orderTuesday=locked?old.orderTuesday:text(b.orderTuesday,10);
   const rates=locked?await quoteRates(store,old):normalizeRates(b.rates??await quoteRates(store,old));
   const payments=paymentList(b.payments||[]);if(payments.length&&['new','review','needs_info','cancelled'].includes(status))throw Error('Record payments only on approved or sent orders.');
   const followUp=text(b.followUp,10);if(followUp&&!dateOk(followUp))throw Error('Invalid follow-up date.');
   let totals=null,delivery=null;
   if(['approved','sent','deposit_paid','ordered','arrived','paid'].includes(status)){
    const complete=normalizeItems(items,{complete:true,store:storeName});
    totals=locked&&old.totals?old.totals:quoteTotals(complete,feesUsd,extraGyd,storeName,rates);delivery=locked&&old.delivery?old.delivery:deliveryWindow(orderTuesday,storeName);
    if(storeName!=='SHEIN'&&!(locked?old.freightAcknowledged===true:b.freightAcknowledged===true))throw Error('Confirm freight review for this retailer; use extra GYD for applicable freight.');
    if(totals.unknownWeights&&(locked?old.weightsAcknowledged!==true:b.weightsAcknowledged!==true))throw Error('Acknowledge unknown weights before approving.');
    if((feesUsd||extraGyd)&&!feeNote)throw Error('Describe the added fees before approval.');
    const paid=payments.reduce((n,p)=>n+p.amount,0);
    if(['deposit_paid','ordered','arrived','paid'].includes(status)&&paid<totals.down)throw Error('Recorded payments must cover the down payment.');
    if(status==='paid'&&paid<totals.overall)throw Error('Full payment has not been recorded.');
    if(paid>totals.overall)throw Error('Recorded payments exceed quotation total.');
   }
   const stamp=now(),row={...old,approvedAt:status==='approved'&&!locked?stamp:totals?(old.approvedAt||old.updatedAt):null,retailer:storeName,rates,freightAcknowledged:locked?old.freightAcknowledged:b.freightAcknowledged===true,items,feesUsd,extraGyd,feeNote,orderTuesday,totals,delivery,weightsAcknowledged:locked?old.weightsAcknowledged:b.weightsAcknowledged===true,followUp,ownerNotes:text(b.ownerNotes,3000),payments,status,updatedAt:stamp,version:old.version+1,events:[...old.events,{at:stamp,status}].slice(-200)};
   const saved=await store.setJSON(key(id),row,{onlyIfMatch:record.etag});
   if(saved?.modified===false)return json({error:'Another update occurred; refresh and retry.'},409);
   return json({quote:await withEvidence(store,row)});
  }
  return json({error:'Unknown action.'},404);
 }catch(e){return json({error:e instanceof Error?e.message:'Unable to complete request.'},400)}
};
