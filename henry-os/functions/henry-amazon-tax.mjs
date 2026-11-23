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
const accessKey=v=>'codes/'+sha(v);
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
  rect(28,82,556,34,blue);txt(145,104,'CUSTOMER SHIPMENT DECLARATION',15,true);
  txt(29,135,'SHIPPER INFORMATION',10,true);
  txt(29,151,'PoboxShipper',9);txt(29,165,'14619 228th Street, Springfield Gardens, New York, USA 11413',9);
  line(179);
  txt(29,197,'CONSIGNEE INFORMATION (CUSTOMER PROVIDED)',10,true);
  for(const [i,t] of wrap(s.customerName+' | '+s.guyanaAddress,90).slice(0,2).entries())txt(29,214+i*13,t,9);
  line(246);
  txt(29,265,'RECEIPT DETAILS',10,true);
  txt(29,283,'Amazon Order #:',9,true);txt(166,283,receipt.orderId,9);
  txt(29,299,'AMC Receipt #:',9,true);txt(166,299,receipt.receiptNo,9);
  txt(29,315,'US warehouse delivery:',9,true);txt(166,315,toDateLabel(receipt.warehouseDate)+', '+formatTime(receipt.warehouseTime),9);
  txt(29,331,'Estimated Guyana date:',9,true);txt(166,331,toDateLabel(s.receivedGuyanaDate)+', 12:00:00 PM (GYT)',9);
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
  txt(29,761,'Customer-submitted shipment details; estimated Guyana date, not proof of arrival.',8,false,muted);
  txt(29,773,'Not independently verified by AMC. Amazon decides documentation and refund eligibility.',8,false,muted);
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
 const owner=isOwner(req),admin=['admin_create','admin_list','admin_revoke','admin_pdf'].includes(action);
 if(admin&&!owner)return json({error:'Owner login required.'},401);
 if(req.method==='POST'&&!production)return json({error:'Preview is read-only. Try again after a production deployment.'},403);
 if(req.method==='POST'&&Number(req.headers.get('content-length')||0)>18000)return json({error:'Request too large.'},413);
 const st=store();
 if(action==='admin_create'&&req.method==='POST'){
  const receiptNumber='AMC-RCPT-'+crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{1,8}/g).join('-');
  const accessId=crypto.randomUUID();
  const now=new Date().toISOString(),record={id:accessId,status:'active',createdAt:now,issuedCount:0};
  await st.setJSON(accessKey(receiptNumber),{...record});
  await st.setJSON('code-list/'+accessId,{...record,hash:sha(receiptNumber)});
  return json({receiptNumber,link:'/amazon-tax',record},201);
 }
 if(action==='admin_list'&&req.method==='GET'){
  const [codes,receipts]=await Promise.all([st.list({prefix:'code-list/'}),st.list({prefix:'receipts/'})]);
  const codeRows=await Promise.all(codes.blobs.slice(0,500).map(b=>read(st,b.key)));
  const receiptRows=await Promise.all(receipts.blobs.slice(0,700).map(b=>read(st,b.key)));
  return json({codes:codeRows.filter(Boolean).map(({hash,...v})=>v).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),receipts:receiptRows.filter(Boolean).map(r=>({id:r.id,receiptNo:r.receiptNo,accessId:r.accessId,customerName:r.customerName,orderId:r.orderId,createdAt:r.createdAt,packageCount:r.items.length,totalWeight:r.items.reduce((n,x)=>n+x.weight,0)})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))});
 }
 if(action==='admin_revoke'&&req.method==='POST'){
  let b;try{b=await req.json()}catch{return json({error:'Invalid JSON.'},400)}
  const id=clean(b.id,60);
  if(!/^[0-9a-f-]{36}$/.test(id))return json({error:'Invalid access ID.'},400);
  const row=await read(st,'code-list/'+id);if(!row)return json({error:'Access number not found.'},404);
  const saved=await read(st,'codes/'+row.hash);
  if(!saved)return json({error:'Access data missing.'},409);
  row.status='revoked';saved.status='revoked';row.revokedAt=saved.revokedAt=new Date().toISOString();
  await st.setJSON('codes/'+row.hash,saved);await st.setJSON('code-list/'+id,row);
  return json({ok:true});
 }
 if(action==='admin_pdf'&&req.method==='GET'){
  const id=clean(url.searchParams.get('id'),60);
  if(!/^[0-9a-f-]{36}$/.test(id))return json({error:'Invalid receipt ID.'},400);
  const receipt=await read(st,'receipts/'+id);
  if(!receipt)return json({error:'Receipt not found.'},404);
  const shipment={customerName:receipt.customerName,guyanaAddress:receipt.guyanaAddress,receivedGuyanaDate:receipt.expectedGuyanaDate};
  const pdf=buildPdf(shipment,receipt);
  return new Response(pdf,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC-Order-'+receipt.orderId+'.pdf"','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }
 if(!['verify','generate'].includes(action)||req.method!=='POST')return json({error:'Not found.'},404);
 let body;try{body=await req.json()}catch{return json({error:'Invalid JSON.'},400)}
 const access=normalizeAccess(body.receiptNumber);
 if(await checkPublicThrottle(st,req))return json({error:'Too many unsuccessful attempts. Try later.'},429);
 if(!accessFormat.test(access)){await flagPublicFailure(st,req);return json({error:'Invalid receipt number. Please ask AMC Shopping for your access number.'},403)}
 const row=await read(st,accessKey(access));
 if(!row||row.status!=='active'){await flagPublicFailure(st,req);return json({error:'Invalid or revoked receipt number. Ask AMC Shopping for assistance.'},403)}
 if(action==='verify')return json({ok:true,message:'Access confirmed. Fill out the order details below.'});
 const customerName=clean(body.customerName,160),guyanaAddress=clean(body.guyanaAddress,250),orderId=clean(body.orderId,25),warehouseDate=clean(body.warehouseDate,10),warehouseTime=clean(body.warehouseTime,5),destination=clean(body.destination,80);
 if(customerName.length<3||guyanaAddress.length<8||!orderOk(orderId)||!validDate(warehouseDate)||!validClock(warehouseTime))return json({error:'Complete your name, Guyana address, Amazon order number, US warehouse delivery date and time.'},400);
 if(warehouseDate>new Date().toISOString().slice(0,10))return json({error:'Warehouse delivery date cannot be in the future.'},400);
 if(destination&&destination.toLowerCase()!=='guyana')return json({error:'This assistance page is for shipments forwarded to Guyana.'},400);
 let items;try{items=parseItems(body.items)}catch(e){return json({error:e.message},400)}
 if(body.confirmed!==true)return json({error:'Review and confirm your submitted shipment information.'},400);
 const expectedGuyanaDate=nextTuesday(warehouseDate);
 const claimKey='claim-keys/'+row.id+'/'+sha(orderId);
 const previous=await read(st,claimKey);
 if(previous){
  const existing=await read(st,'receipts/'+previous.receiptId);
  if(!existing)return json({error:'Document was issued but cannot be retrieved. Contact AMC Shopping.'},409);
  const pdf=buildPdf({customerName:existing.customerName,guyanaAddress:existing.guyanaAddress,receivedGuyanaDate:existing.expectedGuyanaDate},existing);
  return new Response(pdf,{status:200,headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC-Order-'+existing.orderId+'.pdf"','cache-control':'no-store','x-content-type-options':'nosniff','content-length':String(pdf.length)}});
 }
 const receipt={id:crypto.randomUUID(),receiptNo:'AMC-DOC-'+crypto.randomBytes(6).toString('hex').toUpperCase(),accessId:row.id,orderId,customerName,guyanaAddress,warehouseDate,warehouseTime,expectedGuyanaDate,items,createdAt:new Date().toISOString(),source:'customer-submitted/unverified'};
 const pdf=buildPdf({customerName,guyanaAddress,receivedGuyanaDate:expectedGuyanaDate},receipt);
 await st.setJSON('receipts/'+receipt.id,receipt);
 await st.setJSON(claimKey,{receiptId:receipt.id,createdAt:receipt.createdAt});
 return new Response(pdf,{status:200,headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC-Order-'+orderId+'.pdf"','cache-control':'no-store, no-cache, must-revalidate','x-content-type-options':'nosniff','content-length':String(pdf.length)}});
};
