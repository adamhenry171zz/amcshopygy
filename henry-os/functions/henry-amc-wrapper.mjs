import { getStore } from '@netlify/blobs';
import core from './henry-amc-core.mjs';

const num=v=>Number(String(v??'').replace(/,/g,''))||0;
const safeId=v=>String(v||'invoice').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
const dateOnly=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):new Date().toISOString().slice(0,10);
const readType=async(store,type)=>{const {blobs}=await store.list({prefix:`${type}/`});const rows=await Promise.all(blobs.map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));return rows.filter(Boolean)};

async function reconcileInvoicePayments(store,data=null){
  const invoices=Array.isArray(data?.invoices)?data.invoices:await readType(store,'invoices');
  let payments=Array.isArray(data?.payments)?data.payments:await readType(store,'payments');
  const now=new Date().toISOString();

  for(const invoice of invoices){
    const invoiceNo=String(invoice.invoiceNo||'').trim();
    if(!invoiceNo)continue;
    const total=Math.max(0,num(invoice.amount));
    if(!total)continue;

    const status=String(invoice.status||'').toLowerCase();
    const hasBalance=String(invoice.balance??'').trim()!=='';
    let balance=status==='paid'?0:(hasBalance?Math.max(0,num(invoice.balance)):total);
    if(balance>total)balance=total;
    const expectedPaid=status==='cancelled'?0:Math.max(0,total-balance);

    if(status==='paid'&&num(invoice.balance)!==0){
      const fixed={...invoice,balance:'0',updatedAt:now};
      await store.setJSON(`invoices/${invoice.id}`,fixed);
      Object.assign(invoice,fixed);
    }

    const autoId=`auto-invoice-${safeId(invoice.id||invoiceNo)}`;
    const isSameInvoice=p=>String(p.relatedId||'').trim().toUpperCase()===invoiceNo.toUpperCase();
    const explicitPaid=payments.filter(p=>p.id!==autoId&&p.status==='verified'&&isSameInvoice(p)).reduce((sum,p)=>sum+num(p.amount),0);
    const autoNeeded=Math.max(0,Math.round((expectedPaid-explicitPaid)*100)/100);
    const existingAuto=payments.find(p=>p.id===autoId);

    if(autoNeeded>0.009){
      const paymentDate=existingAuto?.paymentDate||dateOnly(invoice.updatedAt||invoice.createdAt);
      const autoRecord={
        id:autoId,type:'payments',customer:invoice.customer||'',whatsapp:invoice.whatsapp||'',amount:autoNeeded.toFixed(2),method:existingAuto?.method||'Other',
        reference:`AUTO-${invoiceNo}`,status:'verified',paymentDate,relatedType:'invoice',relatedId:invoiceNo,
        notes:'Automatically reconciled from the invoice total and remaining balance so the Henry OS dashboard matches invoice updates. Edit the payment record if you want to record the exact payment method.',
        createdAt:existingAuto?.createdAt||now,updatedAt:now
      };
      await store.setJSON(`payments/${autoId}`,autoRecord);
      payments=payments.filter(p=>p.id!==autoId).concat(autoRecord);
    }else if(existingAuto){
      await store.delete(`payments/${autoId}`);
      payments=payments.filter(p=>p.id!==autoId);
    }
  }
  return {invoices,payments};
}

const jsonResponse=(body,source)=>new Response(JSON.stringify(body),{status:source.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});

export default async req=>{
  const copy=req.clone();
  const response=await core(req);
  if(!response.ok)return response;
  const url=new URL(copy.url);
  const action=url.searchParams.get('action')||'bootstrap';
  const store=getStore('henry-amc');

  if(action==='save'&&copy.method==='POST'){
    let body=null;try{body=await copy.json()}catch{}
    if(body?.type==='invoices')await reconcileInvoicePayments(store);
    return response;
  }

  if(action==='bootstrap'&&copy.method==='GET'){
    let data;try{data=await response.json()}catch{return response}
    const reconciled=await reconcileInvoicePayments(store,data);
    data.invoices=reconciled.invoices;
    data.payments=reconciled.payments;
    data.generatedAt=new Date().toISOString();
    return jsonResponse(data,response);
  }

  return response;
};
