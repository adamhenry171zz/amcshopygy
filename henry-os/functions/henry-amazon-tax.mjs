import crypto from 'node:crypto';
import {getStore} from '@netlify/blobs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(v,max=200)=>String(v??'').trim().replace(/[\u0000-\u001f]/g,' ').slice(0,max);
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const eq=(a,b)=>{const x=Buffer.from(sha(a),'hex'),y=Buffer.from(sha(b),'hex');return crypto.timingSafeEqual(x,y)};
const cookies=req=>Object.fromEntries(String(req.headers.get('cookie')||'').split(';').map(s=>s.trim().split('=')).filter(v=>v.length>1));
const isOwner=req=>{
 const secret=process.env.HENRY_SESSION_SECRET||'',email=(process.env.HENRY_ADMIN_EMAIL||'').trim().toLowerCase();
 if(secret.length<32||!email)return false;
 const [payload,sig]=String(cookies(req).henry_session||'').split('.');
 if(!payload||!sig)return false;
 const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 if(!eq(sig,expected))return false;
 try{const d=JSON.parse(Buffer.from(payload,'base64url').toString());return d.email===email&&Number(d.exp)>Date.now()}catch{return false}
};
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const validClock=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const nextTuesday=s=>{if(!validDate(s))throw Error('Enter a valid US warehouse delivery date.');const d=new Date(s+'T12:00:00Z');const days=(2-d.getUTCDay()+7)%7||7;d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
const toDateLabel=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12)).toLocaleDateString('en-US',{timeZone:'UTC',month:'2-digit',day:'2-digit',year:'numeric'})};
const formatTime=s=>{const [h,m]=s.split(':').map(Number);return String(h%12||12).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00 '+(h>=12?'PM':'AM')};
const orderOk=s=>/^\d{3}-\d{7}-\d{7}$/.test(s);
const idOk=s=>/^[A-Z0-9-]{6,45}$/.test(s);
const key=id=>'shipments/'+id;
const store=()=>getStore('amc-tax-receipts');
const read=async(st,k)=>st.get(k,{type:'json'}).catch(()=>null);
const parseItems=s=>{
 const rows=String(s||'').split(/\r?\n/).map(t=>t.trim()).filter(Boolean);
 if(!rows.length||rows.length>30)throw Error('Enter 1–30 package rows.');
 const seen=new Set();
 return rows.map(line=>{
  const [tracking,w,...description]=line.split('|').map(x=>x.trim());
  const weight=Number(w);
  if(!/^[A-Za-z0-9-]{7,75}$/.test(tracking||'')||!Number.isFinite(weight)||weight<=0||weight>500||!description.join('|'))throw Error('Use one tracking|weight|description entry per line.');
  if(seen.has(tracking.toUpperCase()))throw Error('Each tracking number can appear only once.');
  seen.add(tracking.toUpperCase());
  return {tracking:tracking.toUpperCase(),weight:Math.round(weight*100)/100,description:clean(description.join('|'),120)};
 });
};
// A 128-bit owner-issued receipt access number is the only credential customers enter.
const accessFormat=/^AMC-RCPT-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
const normalizeAccess=v=>clean(v,62).toUpperCase().replace(/\s/g,'');
const accessKey=v=>'access/'+sha(v);
const publicClientKey=req=>sha(req.headers.get('x-nf-client-connection-ip')||'unknown').slice(0,32);
async function checkPublicThrottle(st,req){const key='throttle/'+publicClientKey(req),state=await read(st,key),now=Date.now();if(state&&state.until>now)return true;return false}
async function flagPublicFailure(st,req){const key='throttle/'+publicClientKey(req),now=Date.now();const previous=await read(st,key);const state=!previous||previous.reset<now?{count:1,reset:now+15*60*1000,until:0}:{...previous,count:previous.count+1};if(state.count>=10)state.until=state.reset;await st.setJSON(key,state)}

const ascii=s=>String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[^ -~]/g,'?');
const esc=s=>ascii(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const wrap=(s,n=55)=>{const out=[];let t=ascii(s);while(t.length>n){let i=t.lastIndexOf(' ',n);if(i<5)i=n;out.push(t.slice(0,i));t=t.slice(i).trimStart()}if(t)out.push(t);return out.length?out:['']};
function buildPdf(s,receipt){
 const W=612,H=792,navy='0.06 0.09 0.19',muted='0.36 0.39 0.47',blue='0.91 0.93 0.98',white='1 1 1';
 const pages=[];let ops=[];
 const txt=(x,y,v,sz=10,bold=false,color=navy)=>ops.push('BT /'+(bold?'F2':'F1')+' '+sz+' Tf '+color+' rg 1 0 0 1 '+x+' '+(H-y)+' Tm ('+esc(v)+') Tj ET');
 const rect=(x,y,w,h,col)=>ops.push(col+' rg '+x+' '+(H-y-h)+' '+w+' '+h+' re f');
 const line=(y)=>rect(28,y,W-56,0.8,'0.85 0.86 0.89');
 const header=()=>{
  rect(0,0,612,9,navy);
  txt(28,35,'A.M.C SHOPPING GY',22,true);
  txt(29,52,'14619 228th Street, Springfield Gardens, NY 11413, USA',9);
  txt(29,66,'Phone: +592 604 2826  |  amcshopping.com',9);
  rect(28,82,556,34,blue);txt(218,104,'WAREHOUSE RECEIPT',15,true);
  txt(29,135,'SHIPPER INFORMATION',10,true);
  txt(29,151,'PoboxShipper',9);txt(29,165,'14619 228th Street, Springfield Gardens, New York, USA 11413',9);
  line(179);
  txt(29,197,'CONSIGNEE INFORMATION',10,true);
  for(const [i,t] of wrap(s.customerName+' | '+s.guyanaAddress,90).slice(0,2).entries())txt(29,214+i*13,t,9);
  line(246);
  txt(29,265,'RECEIPT DETAILS',10,true);
  txt(29,283,'Amazon Order #:',9,true);txt(166,283,receipt.orderId,9);
  txt(29,299,'AMC Receipt #:',9,true);txt(166,299,receipt.receiptNo,9);
  txt(29,315,'AMC Shipment ID:',9,true);txt(166,315,s.id,9);
  txt(29,331,'Received in Guyana:',9,true);txt(166,331,toDateLabel(s.receivedGuyanaDate)+', '+formatTime(s.receivedGuyanaTime)+' (GYT)',9);
  line(348);
  txt(29,367,'ITEMS',10,true);rect(28,379,556,25,blue);
  txt(37,396,'#',10,true);txt(67,396,'TRACKING NUMBER',10,true);txt(294,396,'DESCRIPTION',10,true);txt(523,396,'LBS',10,true);
 };
 const rows=receipt.items;
 for(let p=0;p<Math.ceil(rows.length/11);p++){
  ops=[];header();let y=420;
  for(let i=p*11;i<Math.min((p+1)*11,rows.length);i++){
   const r=rows[i];if(i%2===0)rect(28,y-15,556,26,'0.97 0.98 0.99');
   txt(37,y,i+1,9);txt(67,y,r.tracking.slice(0,37),8);txt(294,y,r.description.slice(0,37),8);txt(523,y,r.weight.toFixed(2),9);y+=26;
  }
  if((p+1)*11>=rows.length){line(Math.min(y+5,718));const total=rows.reduce((sum,r)=>sum+r.weight,0);txt(29,Math.min(y+24,739),'Total Items: '+rows.length+'    Total Tracking #: '+rows.length,10,true);txt(468,Math.min(y+24,739),'TOTAL '+total.toFixed(2)+' lb',10,true);}
  txt(29,761,'Issued by A.M.C Shopping | Shipment received in Guyana and verified by AMC.',8,false,muted);
  txt(29,773,'Amazon order number supplied by requesting customer. Subject to Amazon review.',8,false,muted);
  pages.push(ops.join('\n'));
 }
 const objs=[null],add=x=>(objs.push(x),objs.length-1);
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),bold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const pagesId=add('');const kids=[];
 for(const stream of pages){const bytes=Buffer.from(stream,'latin1');const cid=add('<< /Length '+bytes.length+' >>\nstream\n'+stream+'\nendstream');const pid=add('<< /Type /Page /Parent '+pagesId+' 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 '+font+' 0 R /F2 '+bold+' 0 R >> >> /Contents '+cid+' 0 R >>');kids.push(pid+' 0 R')}
 objs[pagesId]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+kids.length+' >>';
 const catalog=add('<< /Type /Catalog /Pages '+pagesId+' 0 R >>');
 let doc='%PDF-1.4\n%AMC\n';const offsets=[0];
 for(let i=1;i<objs.length;i++){offsets.push(Buffer.byteLength(doc,'latin1'));doc+=i+' 0 obj\n'+objs[i]+'\nendobj\n'}
 const at=Buffer.byteLength(doc,'latin1');doc+='xref\n0 '+objs.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objs.length;i++)doc+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 doc+='trailer\n<< /Size '+objs.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+at+'\n%%EOF';
 return Buffer.from(doc,'latin1');
}
export default async(req,context)=>{
 const production=context?.deploy?.context==='production';
 const url=new URL(req.url),action=url.searchParams.get('action')||'';
 if(!process.env.HENRY_SESSION_SECRET||!process.env.HENRY_ADMIN_EMAIL)return json({error:'HENRY OS owner authentication is not configured.'},503);
 const owner=isOwner(req);
 const admin=['admin_create','admin_list','admin_revoke','admin_pdf'].includes(action);
 if(admin&&!owner)return json({error:'Owner login required.'},401);
 if(req.method==='POST'&&!production)return json({error:'Preview is read-only. Publish to production to issue or generate receipts.'},403);
 if(req.method==='POST'&&Number(req.headers.get('content-length')||0)>18000)return json({error:'Request too large.'},413);
 const st=store();
 if(action==='admin_pdf'&&req.method==='GET'){
  const id=clean(url.searchParams.get('id'),60);
  if(!/^[0-9a-f-]{36}$/.test(id))return json({error:'Invalid receipt ID.'},400);
  const receipt=await read(st,'receipts/'+id);
  if(!receipt)return json({error:'Receipt not found.'},404);
  const shipment=await read(st,key(receipt.shipmentId));
  if(!shipment)return json({error:'Linked shipment record missing.'},409);
  const pdf=buildPdf(shipment,receipt);
  return new Response(pdf,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC-Warehouse-Receipt-'+receipt.orderId+'.pdf"','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }
 if(action==='admin_list'&&req.method==='GET'){
  const {blobs}=await st.list({prefix:'shipments/'});
  const rows=await Promise.all(blobs.slice(0,300).map(b=>read(st,b.key)));
  const receiptFiles=await st.list({prefix:'receipts/'});
  const savedReceipts=await Promise.all(receiptFiles.blobs.slice(0,500).map(b=>read(st,b.key)));
  return json({shipments:rows.filter(Boolean).map(({tokenHash,accessHash,...r})=>r).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),receipts:savedReceipts.filter(Boolean).map(r=>({id:r.id,receiptNo:r.receiptNo,shipmentId:r.shipmentId,orderId:r.orderId,createdAt:r.createdAt,customerName:r.customerName,packageCount:r.items.length})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))});
 }
 if(action==='admin_create'&&req.method==='POST'){
  let b;try{b=await req.json()}catch{return json({error:'Invalid JSON.'},400)}
  const id=clean(b.id,45).toUpperCase(),customerName=clean(b.customerName,160),guyanaAddress=clean(b.guyanaAddress,250),warehouseDate=clean(b.warehouseDate,10),receivedGuyanaDate=clean(b.receivedGuyanaDate,10),receivedGuyanaTime=clean(b.receivedGuyanaTime,5);
  if(!idOk(id)||!customerName||!guyanaAddress||!validDate(warehouseDate)||!validDate(receivedGuyanaDate)||!validClock(receivedGuyanaTime))return json({error:'Complete shipment ID, name, address and valid dates/times.'},400);
  const expected=nextTuesday(warehouseDate);
  if(b.confirmedArrival!==true)return json({error:'Owner must confirm the actual Guyana receipt date and time before authorizing a warehouse receipt.'},400);
  if(receivedGuyanaDate<warehouseDate)return json({error:'Guyana receipt cannot precede warehouse delivery.'},400);
  if(receivedGuyanaDate>new Date().toISOString().slice(0,10))return json({error:'Cannot certify arrival in the future.'},400);
  let items;try{items=parseItems(b.items)}catch(e){return json({error:e.message},400)}
  if(await read(st,key(id)))return json({error:'Shipment ID already exists. Use a unique ID.'},409);
  const secret=crypto.randomBytes(16).toString('hex').toUpperCase();
  const receiptAccessNumber='AMC-RCPT-'+secret.match(/.{1,8}/g).join('-');
  const row={id,customerName,guyanaAddress,warehouseDate,expectedGuyanaDate:expected,receivedGuyanaDate,receivedGuyanaTime,items,accessHash:sha(receiptAccessNumber),status:'active',createdAt:new Date().toISOString(),issuedCount:0};
  await st.setJSON(key(id),row);
  await st.setJSON(accessKey(receiptAccessNumber),{id,createdAt:row.createdAt});
  return json({shipment:{...row,accessHash:undefined},link:'/amazon-tax',receiptNumber:receiptAccessNumber,note:'Provide this receipt number to the customer privately. The portal URL is the same for every customer; no shipment ID or secret URL is needed.'},201);
 }
 if(action==='admin_revoke'&&req.method==='POST'){
  let b;try{b=await req.json()}catch{return json({error:'Invalid JSON.'},400)}
  const id=clean(b.id,45).toUpperCase(),row=await read(st,key(id));if(!row)return json({error:'Shipment not found.'},404);
  row.status='revoked';row.revokedAt=new Date().toISOString();await st.setJSON(key(id),row);return json({ok:true});
 }
 if(!['verify','generate'].includes(action))return json({error:'Not found.'},404);
 if(action==='verify'&&req.method!=='POST'||action==='generate'&&req.method!=='POST')return json({error:'Method not allowed.'},405);
 let b;try{b=await req.json()}catch{return json({error:'Invalid request.'},400)}
 const receiptNumber=normalizeAccess(b.receiptNumber);
 if(await checkPublicThrottle(st,req))return json({error:'Too many unsuccessful attempts. Please try again later.'},429);
 if(!accessFormat.test(receiptNumber)){await flagPublicFailure(st,req);return json({error:'Invalid receipt number. Request the number directly from AMC Shopping.'},403)}
 const lookup=await read(st,accessKey(receiptNumber));
 const id=lookup?.id, row=id?await read(st,key(id)):null;
 if(!row||row.status!=='active'||!eq(row.accessHash||'',sha(receiptNumber))){await flagPublicFailure(st,req);return json({error:'Receipt number could not be verified. Please contact AMC Shopping.'},403)}
 if(action==='verify')return json({shipmentId:id,customerName:row.customerName,receivedInGuyana:toDateLabel(row.receivedGuyanaDate)+' '+formatTime(row.receivedGuyanaTime)+' GYT',packages:row.items.map(({tracking,weight,description})=>({tracking,weight,description}))});
 const orderId=clean(b.orderId,25);
 if(!orderOk(orderId))return json({error:'Enter a valid Amazon order number, for example 114-1234567-1234567.'},400);
 const tracking=[...new Set((Array.isArray(b.tracking)?b.tracking:[]).map(x=>clean(x,75).toUpperCase()))];
 if(!tracking.length||tracking.length>30)return json({error:'Select at least one package.'},400);
 const items=tracking.map(t=>row.items.find(r=>r.tracking===t));
 if(items.some(x=>!x))return json({error:'Package selection did not match verified AMC records.'},400);
 const claimKey='claim-keys/'+id+'/'+sha(orderId+'|'+tracking.slice().sort().join('|'));
 if(await read(st,claimKey))return json({error:'A receipt has already been issued for this Amazon order and package selection. Contact AMC Shopping if you need a correction.'},409);
 const claimId=crypto.randomUUID(),receiptNo='AMCTX-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+crypto.randomBytes(4).toString('hex').toUpperCase();
 const receipt={id:claimId,receiptNo,shipmentId:id,orderId,items,createdAt:new Date().toISOString(),customerName:row.customerName,receivedGuyanaDate:row.receivedGuyanaDate,receivedGuyanaTime:row.receivedGuyanaTime,source:'customer-entered-order/owner-verified-shipment'};
 const pdf=buildPdf(row,receipt);
 await st.setJSON('receipts/'+claimId,receipt);
 await st.setJSON(claimKey,{claimId,receiptNo,createdAt:receipt.createdAt});
 return new Response(pdf,{status:200,headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC-Warehouse-Receipt-'+orderId+'.pdf"','cache-control':'no-store, no-cache, must-revalidate','x-content-type-options':'nosniff','content-length':String(pdf.length)}});
};
