import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const digest=v=>crypto.createHash('sha256').update(String(v||'')).digest();
const safeEq=(a,b)=>crypto.timingSafeEqual(digest(a),digest(b));
const sign=(payload,secret)=>crypto.createHmac('sha256',secret).update(payload).digest('base64url');
const parseCookies=s=>Object.fromEntries(String(s||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));
const authenticated=(req,secret,email)=>{const token=parseCookies(req.headers.get('cookie')).henry_session;if(!token)return false;const [payload,sig]=token.split('.');if(!payload||!sig||!safeEq(sign(payload,secret),sig))return false;try{const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));return data.email===email&&Number(data.exp)>Date.now()}catch{return false}};
const clean=(v,max=1200)=>String(v??'').trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').slice(0,max);
const num=v=>Number(String(v??'').replace(/,/g,''))||0;
const round2=v=>Math.round((Number(v)||0)*100)/100;
const safeId=v=>clean(v,140).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const readType=async(store,type)=>{const {blobs}=await store.list({prefix:`${type}/`});const rows=await Promise.all(blobs.map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));return rows.filter(Boolean)};
const isMember=v=>/member/i.test(String(v||''));

function standardCharge(weight){
  const bill=Math.max(1,Number(weight)||0);
  if(bill<=2)return {rate:0,total:2800,label:'GYD $2,800 flat 1–2 lb special',billWeight:bill};
  let rate=1500,label='GYD $1,500/lb · 1–10 lbs';
  if(bill>10&&bill<=25){rate=1300;label='GYD $1,300/lb · 11–25 lbs'}
  else if(bill>25&&bill<=55){rate=1200;label='GYD $1,200/lb · 26–55 lbs'}
  else if(bill>55&&bill<100){rate=1100;label='GYD $1,100/lb · 56–99 lbs'}
  else if(bill>=100){rate=1050;label='GYD $1,050/lb · 100+ lbs'}
  return {rate,total:round2(bill*rate),label,billWeight:bill};
}
function calculateCustomer(c){
  const weight=round2((Array.isArray(c.packages)?c.packages:[]).reduce((s,p)=>s+num(p.weightLb),0));
  const adjustment=round2(num(c.adjustment));
  const standard=standardCharge(weight);
  if(isMember(c.customerType)){
    const billWeight=Math.max(1,weight);
    const shipping=round2(billWeight*950);
    return {weight,billWeight,adjustment,shipping,total:round2(shipping+adjustment),rate:950,rateLabel:'GYD $950/lb · Members Club',standardEquivalent:round2(standard.total+adjustment),member:true};
  }
  return {weight,billWeight:standard.billWeight,adjustment,shipping:standard.total,total:round2(standard.total+adjustment),rate:standard.rate,rateLabel:standard.label,standardEquivalent:round2(standard.total+adjustment),member:false};
}
function nextNumber(rows,prefix,digits=4){
  let max=0;const re=new RegExp(`^${prefix}(\\d+)$`,'i');
  for(const row of rows){const m=String(row.invoiceNo||'').trim().match(re);if(m)max=Math.max(max,Number(m[1])||0)}
  return ()=>`${prefix}${String(++max).padStart(digits,'0')}`;
}
function validateCustomers(input){
  if(!Array.isArray(input)||!input.length)return 'No customers were supplied';
  if(input.length>120)return 'Batch is too large';
  const tracking=new Set();let packageCount=0;
  for(let i=0;i<input.length;i++){
    const c=input[i]||{};if(!clean(c.name,200))return `Customer ${i+1} is missing a name`;
    if(!Array.isArray(c.packages)||!c.packages.length)return `${clean(c.name,200)} has no packages`;
    for(const p of c.packages){
      packageCount++;if(packageCount>600)return 'Batch contains too many packages';
      const t=clean(p.tracking,220).toUpperCase();if(!t)return `${clean(c.name,200)} has a package without a tracking number`;
      if(tracking.has(t))return `Duplicate tracking number in batch: ${t}`;tracking.add(t);
      if(num(p.weightLb)<=0)return `Invalid weight for tracking ${t}`;
    }
  }
  return '';
}

export default async req=>{
  const adminEmail=clean(process.env.HENRY_ADMIN_EMAIL,180).toLowerCase();
  const sessionSecret=String(process.env.HENRY_SESSION_SECRET||'');
  if(!adminEmail||sessionSecret.length<32)return json({error:'Henry OS is not configured'},503);
  if(!authenticated(req,sessionSecret,adminEmail))return json({error:'Unauthorized'},401);
  if(req.method!=='POST')return json({error:'Method not allowed'},405);

  let body;try{body=await req.json()}catch{return json({error:'Invalid JSON'},400)}
  const customers=Array.isArray(body.customers)?body.customers:[];
  const validationError=validateCustomers(customers);if(validationError)return json({error:validationError},400);
  const rawBatchId=clean(body.batchId,140)||`shipment-${new Date().toISOString().replace(/[:.]/g,'-')}`;
  const batchKey=safeId(rawBatchId);if(!batchKey)return json({error:'Invalid batch ID'},400);
  const invoiceDate=/^\d{4}-\d{2}-\d{2}$/.test(clean(body.invoiceDate,20))?clean(body.invoiceDate,20):new Date().toISOString().slice(0,10);
  const canonical={batchId:batchKey,invoiceDate,customers:customers.map(c=>({name:clean(c.name,200),whatsapp:clean(c.whatsapp,80),mailboxCode:clean(c.mailboxCode,80),customerType:clean(c.customerType,40),notes:clean(c.notes,1800),adjustment:round2(num(c.adjustment)),packages:c.packages.map(p=>({tracking:clean(p.tracking,220),carrier:clean(p.carrier,120),sourceWeight:clean(p.sourceWeight,120),weightLb:round2(num(p.weightLb)),ref:clean(p.ref,120),status:clean(p.status,40)}))}))};
  const inputHash=hash(JSON.stringify(canonical));
  const store=getStore('henry-amc');
  const markerKey=`invoice-batches/${batchKey}`;
  let marker=await store.get(markerKey,{type:'json'}).catch(()=>null);
  if(marker?.done){
    if(marker.inputHash&&marker.inputHash!==inputHash)return json({error:'This batch ID was already used for different data. Use a new batch ID.'},409);
    return json({ok:true,reused:true,batchId:batchKey,invoiceDate:marker.invoiceDate||invoiceDate,results:marker.results||[]});
  }
  if(marker?.inputHash&&marker.inputHash!==inputHash)return json({error:'A pending batch already exists with this ID but different data. Use a new batch ID.'},409);

  let plan=Array.isArray(marker?.plan)?marker.plan:null;
  if(!plan){
    const [existingInvoices,existingCustomers,existingPackages]=await Promise.all([readType(store,'invoices'),readType(store,'customers'),readType(store,'packages')]);
    const existingTracking=new Map(existingPackages.filter(p=>p.tracking).map(p=>[String(p.tracking).trim().toUpperCase(),p]));
    for(const c of canonical.customers)for(const p of c.packages){const found=existingTracking.get(p.tracking.toUpperCase());if(found)return json({error:`Tracking number already exists in HENRY OS: ${p.tracking}`,tracking:p.tracking,existingCustomer:found.customer||''},409)}
    const normalNo=nextNumber(existingInvoices,'INV',4),memberNo=nextNumber(existingInvoices,'MC',4);
    plan=canonical.customers.map((c,index)=>{
      const member=isMember(c.customerType);const invoiceNo=member?memberNo():normalNo();
      const existing=existingCustomers.find(x=>(c.mailboxCode&&String(x.mailboxCode||'').trim().toUpperCase()===c.mailboxCode.toUpperCase())||(String(x.name||'').trim().toLowerCase()===c.name.toLowerCase()&&(!c.whatsapp||!x.whatsapp||String(x.whatsapp).trim()===c.whatsapp)));
      const customerId=existing?.id||`factory-customer-${safeId(c.mailboxCode||c.name)||hash(c.name).slice(0,14)}`;
      return {index,invoiceNo,invoiceId:`factory-${batchKey}-${invoiceNo.toLowerCase()}`,customerId,existingCustomerId:existing?.id||'',packageIds:c.packages.map(p=>`factory-package-${hash(`${batchKey}|${p.tracking.toUpperCase()}`).slice(0,24)}`)};
    });
    marker={id:batchKey,type:'invoice_batch',status:'pending',done:false,inputHash,invoiceDate,plan,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await store.setJSON(markerKey,marker);
  }

  const now=new Date().toISOString();const results=[];
  for(const item of plan){
    const c=canonical.customers[item.index];const calc=calculateCustomer(c);const trackingList=c.packages.map(p=>p.tracking).join('; ');
    const oldCustomer=await store.get(`customers/${item.customerId}`,{type:'json'}).catch(()=>null);
    const customerNotes=[clean(oldCustomer?.notes,3500),c.notes,`${calc.member?'AMC Members Club':'Regular AMC'} customer updated by Invoice Factory batch ${batchKey} on ${invoiceDate}.`].filter(Boolean).join(' ').slice(0,4000);
    const customerRecord={id:item.customerId,type:'customers',name:c.name,whatsapp:c.whatsapp||oldCustomer?.whatsapp||'',email:oldCustomer?.email||'',mailboxCode:c.mailboxCode||oldCustomer?.mailboxCode||'',address:oldCustomer?.address||'',status:oldCustomer?.status||'active',source:oldCustomer?.source||'manual',notes:customerNotes,createdAt:oldCustomer?.createdAt||now,updatedAt:now};
    await store.setJSON(`customers/${item.customerId}`,customerRecord);

    const adjustmentText=calc.adjustment?` Manual adjustment: GYD $${calc.adjustment.toFixed(2)}.`:'';
    const invoiceNotes=`Invoice Factory batch ${batchKey}. Invoice date: ${invoiceDate}. ${c.mailboxCode?`Mailbox: ${c.mailboxCode}. `:''}${calc.member?'AMC Members Club pricing applied; package fees waived.':'Regular AMC customer; package fee GYD $0.'} Combined weight: ${calc.weight.toFixed(4)} lb. Billing: ${calc.rateLabel}.${adjustmentText} Tracking: ${trackingList}`.slice(0,4000);
    const invoiceRecord={id:item.invoiceId,type:'invoices',invoiceNo:item.invoiceNo,customer:c.name,whatsapp:c.whatsapp,amount:calc.total.toFixed(2),balance:calc.total.toFixed(2),status:'sent',dueDate:'',description:`${calc.member?'Members Club Shipping Invoice':'Shipping Invoice'} · ${c.packages.length} package${c.packages.length===1?'':'s'} · ${calc.weight.toFixed(4)} lb`,notes:invoiceNotes,createdAt:now,updatedAt:now};
    await store.setJSON(`invoices/${item.invoiceId}`,invoiceRecord);

    for(let pIndex=0;pIndex<c.packages.length;pIndex++){
      const p=c.packages[pIndex];const packageId=item.packageIds[pIndex];
      const packageRecord={id:packageId,type:'packages',customer:c.name,whatsapp:c.whatsapp,tracking:p.tracking,carrier:p.carrier||p.ref||'',weight:num(p.weightLb).toFixed(4),packageCount:'1',status:p.status||'ready',arrivalDate:invoiceDate,amountDue:'',notes:`Invoice ${item.invoiceNo}. Invoice Factory batch ${batchKey}.${p.sourceWeight?` Source weight: ${p.sourceWeight}.`:''}${p.ref?` Ref: ${p.ref}.`:''}`.slice(0,4000),createdAt:now,updatedAt:now};
      await store.setJSON(`packages/${packageId}`,packageRecord);
    }
    results.push({invoiceNo:item.invoiceNo,invoiceId:item.invoiceId,customer:c.name,customerId:item.customerId,customerType:calc.member?'member':'regular',amount:calc.total.toFixed(2),weight:calc.weight.toFixed(4),standardEquivalent:calc.standardEquivalent.toFixed(2),savings:calc.member?round2(calc.standardEquivalent-calc.total).toFixed(2):'0.00',packageCount:c.packages.length,packageIds:item.packageIds});
  }

  marker={...marker,status:'done',done:true,inputHash,invoiceDate,results,completedAt:now,updatedAt:now};
  await store.setJSON(markerKey,marker);
  return json({ok:true,reused:false,batchId:batchKey,invoiceDate,results});
};
