import zlib from 'node:zlib';
import {AMC_INVOICE_LOGO_PNG_BASE64} from './henry-tax-logo.mjs';
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

let embeddedLogo;
function invoiceLogo(){
 if(embeddedLogo)return embeddedLogo;
 const input=Buffer.from(AMC_INVOICE_LOGO_PNG_BASE64,'base64');
 let at=8,width=0,height=0,kind=0,palette=null,alpha=null,idat=[];
 while(at+12<=input.length){
  const length=input.readUInt32BE(at),name=input.toString('ascii',at+4,at+8),data=input.subarray(at+8,at+8+length);at+=length+12;
  if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);kind=data[9];if(data[8]!==8)throw Error('Unexpected logo format')}
  else if(name==='PLTE')palette=data;
  else if(name==='tRNS')alpha=data;
  else if(name==='IDAT')idat.push(data);
  else if(name==='IEND')break;
 }
 if(!width||!height||!palette||kind!==3||width>1500||height>1500)throw Error('Invalid invoice logo');
 const raw=zlib.inflateSync(Buffer.concat(idat)),rgb=Buffer.alloc(width*height*3);
 const prev=Buffer.alloc(width),cur=Buffer.alloc(width);let off=0;
 const base=[8,23,45]; 
 for(let y=0;y<height;y++){
  const filter=raw[off++];
  for(let x=0;x<width;x++){
   const n=raw[off++],left=x?cur[x-1]:0,up=prev[x],upLeft=x?prev[x-1]:0;
   let predictor=0;if(filter===1)predictor=left;else if(filter===2)predictor=up;else if(filter===3)predictor=Math.floor((left+up)/2);else if(filter===4){const p=left+up-upLeft,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-upLeft);predictor=a<=b&&a<=c?left:b<=c?up:upLeft}
   else if(filter!==0)throw Error('Unsupported logo PNG filter');
   cur[x]=(n+predictor)&255; const idx=cur[x],opacity=alpha&&idx<alpha.length?alpha[idx]:255;
   for(let c=0;c<3;c++)rgb[(y*width+x)*3+c]=Math.round((palette[idx*3+c]??255)*opacity/255+base[c]*(255-opacity)/255);
  }
  cur.copy(prev);
 }
 embeddedLogo={width,height,bytes:zlib.deflateSync(rgb,{level:8})};
 return embeddedLogo;
}
function buildPdf(data,receipt){
 // A4 receipt layout follows the two October 2026 AMC warehouse receipt samples.
 const H=841.89,W=595.28,navy='0.086 0.09 0.165',muted='0.25 0.25 0.29',lavender='0.902 0.902 0.961',pale='0.949 0.953 0.973',border='0.784 0.784 0.823',white='1 1 1';
 const pages=[],body=Array.isArray(receipt.items)?receipt.items:[];
 const line=(ops,x1,y1,x2,y2,c=border)=>ops.push(c+' RG 0.5 w '+x1+' '+(H-y1)+' m '+x2+' '+(H-y2)+' l S');
 const rect=(ops,x,y,w,h,fill)=>ops.push(fill+' rg '+x+' '+(H-y-h)+' '+w+' '+h+' re f');
 const borderRect=(ops,x,y,w,h)=>ops.push(border+' RG 0.55 w '+x+' '+(H-y-h)+' '+w+' '+h+' re S');
 const tx=(ops,x,y,v,size=10,bold=false,col=navy)=>ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+col+' rg 1 0 0 1 '+x+' '+(H-y)+' Tm ('+esc(String(v??''))+') Tj ET');
 const left=31.18,tableLeft=28.35,tableRight=566.93,rowH=22.68;
 const head=ops=>{
  rect(ops,28.35,28.35,79.37,79.37,'0.031 0.090 0.176');
  // The same white AMC logo embedded in the shipment invoice PDF engine.
  ops.push('q 70 0 0 51 33.0 '+(H-92)+' cm /Logo Do Q');
  tx(ops,127.56,46,'A.M.C SHOPPING GY',18,true);
  tx(ops,127.56,64,'14619 228th Street',10);
  tx(ops,127.56,78,'Springfield Gardens, New York United State, Zip: 11413',10);
  tx(ops,127.56,92,'Phone: +592 604 2826',10);
  rect(ops,28.35,113.39,538.59,28.35,lavender);
  tx(ops,228,133,'Warehouse Receipt',14,true);
  tx(ops,left,162,'Shipper Information',11,true);
  tx(ops,left,181,'PoboxShipper',10);
  tx(ops,left,198,'14619 228th Street',10);
  tx(ops,left,215,'Springfield Gardens, New York',10);
  tx(ops,left,232,'United State Zip: 11413',10);
  line(ops,28.35,246.61,566.93,246.61);
  tx(ops,left,269,'Consignee Information',11,true);
  tx(ops,left,290,data.customerName,10);
  const address=String(data.guyanaAddress||'').trim();
  const max=80;const parts=wrap(address,max);
  tx(ops,left,307,parts[0]||'GUYANA',10);
  tx(ops,left,324,'Phone: '+(data.customerPhone||'+592 604 2826'),10);
  line(ops,28.35,337.32,566.93,337.32);
  tx(ops,left,361,'Receipt Details',12,true);
  tx(ops,left,386,'Order #:',10,true);tx(ops,158.7,386,receipt.orderId,10);
  tx(ops,left,406,'Receipt Number:',10,true);tx(ops,158.7,406,receipt.receiptNo,10);
  // This is a schedule-based date unless supported by AMC's shipment records.
  tx(ops,left,426,'Scheduled Date/Time:',10,true);
  tx(ops,158.7,426,toDateLabel(receipt.expectedGuyanaDate)+', 12:00:00 PM',10);
  line(ops,28.35,436.54,566.93,436.54);
  tx(ops,left,462,'Items',12,true);
 };
 const columns=[28.35,56.69,255.12,453.55,538.58,595.27];
 const cell=(ops,x,y,w,h,fill=null)=>{if(fill)rect(ops,x,y,w,h,fill);borderRect(ops,x,y,w,h)};
 const chunks=Math.max(1,Math.ceil(body.length/11));
 for(let p=0;p<chunks;p++){
  const ops=[];head(ops);
  const visible=body.slice(p*11,p*11+11);
  const y0=467.72;
  for(let i=0;i<4;i++)cell(ops,columns[i],y0,columns[i+1]-columns[i],rowH,pale);
  tx(ops,37.5,484,'#',10,true);
  tx(ops,59.5,484,'Tracking Number(s)',10,true);
  tx(ops,258.0,484,'Description',10,true);
  tx(ops,471.5,484,'Weight (lbs)',10,true);
  for(let i=0;i<visible.length;i++){
   const item=visible[i],y=y0+rowH*(i+1);
   for(let c=0;c<4;c++)cell(ops,columns[c],y,columns[c+1]-columns[c],rowH);
   tx(ops,40.9,y+15,p*11+i+1,10);
   tx(ops,62.4,y+15,String(item.tracking||'').slice(0,32),9.5);
   tx(ops,260.8,y+15,String(item.description||'Amazon Package').slice(0,36),9.5);
   tx(ops,514.5,y+15,Number(item.weight||0).toFixed(2),10);
  }
  const bottom=y0+rowH*(visible.length+1),last=p===chunks-1;
  if(last){
   for(let i=0;i<4;i++)cell(ops,columns[i],bottom,columns[i+1]-columns[i],rowH);
   cell(ops,columns[4],bottom,columns[5]-columns[4],rowH);
   const sum=body.reduce((v,o)=>v+Number(o.weight||0),0);
   tx(ops,31.2,bottom+15,'Total Items: '+body.length,9.5,true);
   tx(ops,258,bottom+15,'Total Tracking #: '+body.length,9.5,true);
   tx(ops,480,bottom+15,'Total (lbs):',9.5,true);
   tx(ops,573,bottom+15,sum.toFixed(2),9.5,true);
  }
  pages.push(ops.join('\n'));
 }
 const logo=invoiceLogo(),objects=[null],add=o=>(objects.push(o),objects.length-1);
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 const fontBold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
 const compressed=logo.bytes.toString('latin1');
 const im=add('<< /Type /XObject /Subtype /Image /Width '+logo.width+' /Height '+logo.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length '+logo.bytes.length+' >>\nstream\n'+compressed+'\nendstream');
 const pagesRef=add(''),refs=[];
 for(const commands of pages){
  const bytes=Buffer.from(commands,'latin1');
  const streamId=add('<< /Length '+bytes.length+' >>\nstream\n'+commands+'\nendstream');
  const pageId=add('<< /Type /Page /Parent '+pagesRef+' 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 '+font+' 0 R /F2 '+fontBold+' 0 R >> /XObject << /Logo '+im+' 0 R >> >> /Contents '+streamId+' 0 R >>');
  refs.push(pageId+' 0 R');
 }
 objects[pagesRef]='<< /Type /Pages /Kids ['+refs.join(' ')+'] /Count '+refs.length+' >>';
 const catalog=add('<< /Type /Catalog /Pages '+pagesRef+' 0 R >>');
 let doc='%PDF-1.4\n%AMC\n';const offsets=[0];
 for(let i=1;i<objects.length;i++){offsets.push(Buffer.byteLength(doc,'latin1'));doc+=i+' 0 obj\n'+objects[i]+'\nendobj\n'}
 const start=Buffer.byteLength(doc,'latin1');doc+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
 for(let i=1;i<objects.length;i++)doc+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 doc+='trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+start+'\n%%EOF';
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
  const now=new Date().toISOString();
  let publicReceiptNo;
  for(let attempt=0;attempt<10;attempt++){
   const candidate=String(crypto.randomInt(1000000,10000000));
   if(!await read(st,'receipt-groups/'+candidate)){publicReceiptNo=candidate;break}
  }
  if(!publicReceiptNo)return json({error:'Could not generate an unused receipt number. Retry.'},503);
  const record={id:accessId,status:'active',createdAt:now,issuedCount:0,publicReceiptNo};
  await st.setJSON(accessKey(receiptNumber),{...record});
  await st.setJSON('code-list/'+accessId,{...record,hash:sha(receiptNumber)});
  await st.setJSON('receipt-groups/'+publicReceiptNo,{id:accessId,createdAt:now});
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
  const shipment={customerName:receipt.customerName,customerPhone:receipt.customerPhone,guyanaAddress:receipt.guyanaAddress,receivedGuyanaDate:receipt.expectedGuyanaDate};
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
 const customerName=clean(body.customerName,160),customerPhone=clean(body.customerPhone,35),guyanaAddress=clean(body.guyanaAddress,250),orderId=clean(body.orderId,25),warehouseDate=clean(body.warehouseDate,10),warehouseTime=clean(body.warehouseTime,5),destination=clean(body.destination,80);
 if(customerName.length<3||customerPhone.length<7||guyanaAddress.length<8||!orderOk(orderId)||!validDate(warehouseDate)||!validClock(warehouseTime))return json({error:'Complete your name, Guyana address, Amazon order number, US warehouse delivery date and time.'},400);
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
  const pdf=buildPdf({customerName:existing.customerName,customerPhone:existing.customerPhone,guyanaAddress:existing.guyanaAddress,receivedGuyanaDate:existing.expectedGuyanaDate},existing);
  return new Response(pdf,{status:200,headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC-Order-'+existing.orderId+'.pdf"','cache-control':'no-store','x-content-type-options':'nosniff','content-length':String(pdf.length)}});
 }
 const receipt={id:crypto.randomUUID(),receiptNo:row.publicReceiptNo||String(crypto.randomInt(1000000,10000000)),accessId:row.id,orderId,customerName,customerPhone,guyanaAddress,warehouseDate,warehouseTime,expectedGuyanaDate,items,createdAt:new Date().toISOString(),source:'customer-submitted/unverified'};
 const pdf=buildPdf({customerName,customerPhone,guyanaAddress,receivedGuyanaDate:expectedGuyanaDate},receipt);
 await st.setJSON('receipts/'+receipt.id,receipt);
 await st.setJSON(claimKey,{receiptId:receipt.id,createdAt:receipt.createdAt});
 return new Response(pdf,{status:200,headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="AMC-Order-'+orderId+'.pdf"','cache-control':'no-store, no-cache, must-revalidate','x-content-type-options':'nosniff','content-length':String(pdf.length)}});
};
