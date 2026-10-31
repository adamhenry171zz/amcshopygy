import { getStore } from '@netlify/blobs';
import core from './henry-amc-core.mjs';

const num=v=>Number(String(v??'').replace(/,/g,''))||0;
const safeId=v=>String(v||'invoice').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
const dateOnly=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):new Date().toISOString().slice(0,10);
const readType=async(store,type)=>{const {blobs}=await store.list({prefix:`${type}/`});const rows=await Promise.all(blobs.map(async b=>{try{return await store.get(b.key,{type:'json'})}catch{return null}}));return rows.filter(Boolean)};

const OCT15_PAID_INVOICES=[
  {
    invoiceNo:'INV0287',customer:'Ceola Campbell',amount:'8470.50',balance:'0',status:'paid',dueDate:'',
    description:'Shipping Invoice · 3 packages · 5.6470 lb',
    notes:'Invoice date: 2026-10-15. Regular AMC customer. Mailbox not provided. Billing: GYD $1,500/lb; no package fee. Tracking: GFUS01075688605443; SWX434630000190049593; GFUS01076185193860. Owner confirmed on 2026-10-31 that this invoice had already been paid.'
  },
  {
    invoiceNo:'INV0288',customer:'Daviana Dass',amount:'2800.00',balance:'0',status:'paid',dueDate:'',
    description:'Shipping Invoice · 1 package · 0.7900 lb',
    notes:'Invoice date: 2026-10-15. Regular AMC customer. Mailbox not provided on this invoice. Billing: GYD $2,800 1-2 lb flat special; no package fee. Tracking: SWX751500000198175153. Owner confirmed on 2026-10-31 that this invoice had already been paid.'
  },
  {
    invoiceNo:'MC0034',customer:'Leah Casimero',amount:'15413.75',balance:'0',status:'paid',dueDate:'',
    description:'Members Club Shipping Invoice · 10 packages · 16.2250 lb',
    notes:'Invoice date: 2026-10-15. Mailbox AMC203. AMC Members Club pricing applied; package fees waived. Member total GYD $15,413.75; regular equivalent GYD $21,092.50; shipment savings GYD $5,678.75. Tracking: GFUS01076204820231; GFUS01076172371332; GFUS01076206503808; GFUS01076812856581; TBA335221966709; GFUS01076865252999; 9361289691069167730607; SWX113970000193755420; TBA336242126980; TBA336361501771. Owner confirmed on 2026-10-31 that this invoice had already been paid.'
  },
  {
    invoiceNo:'INV0289',customer:'Raasna Pooran',amount:'2800.00',balance:'0',status:'paid',dueDate:'',
    description:'Shipping Invoice · 1 package · 0.9000 lb',
    notes:'Invoice date: 2026-10-15. Regular AMC customer. Mailbox not provided. Billing: GYD $2,800 1-2 lb flat special; no package fee. Tracking: TBA335351605602. Owner confirmed on 2026-10-31 that this invoice had already been paid.'
  }
];

const OCT15_CUSTOMERS=[
  {name:'Ceola Campbell',mailboxCode:'',notes:'Regular AMC customer imported from paid shipping invoice INV0287 dated 2026-10-15.'},
  {name:'Daviana Dass',mailboxCode:'',notes:'Regular AMC customer with paid shipping invoice INV0288 dated 2026-10-15.'},
  {name:'Leah Casimero',mailboxCode:'AMC203',notes:'AMC Members Club customer with paid Members Club invoice MC0034 dated 2026-10-15.'},
  {name:'Raasna Pooran',mailboxCode:'',notes:'Regular AMC customer imported from paid shipping invoice INV0289 dated 2026-10-15.'}
];

async function applyOct15PaidMigration(store){
  const markerKey='migrations/2026-10-15-paid-invoices-0287-0289-mc0034-v1';
  const already=await store.get(markerKey,{type:'json'}).catch(()=>null);
  if(already?.done)return;
  const now=new Date().toISOString();
  const invoices=await readType(store,'invoices');
  const payments=await readType(store,'payments');
  const customers=await readType(store,'customers');

  for(const source of OCT15_PAID_INVOICES){
    const existing=invoices.find(x=>String(x.invoiceNo||'').trim().toUpperCase()===source.invoiceNo);
    if(existing){
      const notes=[String(existing.notes||'').trim(),source.notes].filter(Boolean).join(' ');
      await store.setJSON(`invoices/${existing.id}`,{...existing,...source,notes,updatedAt:now});
    }else{
      const id=`import-${source.invoiceNo.toLowerCase()}`;
      await store.setJSON(`invoices/${id}`,{id,type:'invoices',...source,createdAt:now,updatedAt:now});
    }

    const paymentId=`october-cleanup-${source.invoiceNo.toLowerCase()}`;
    const existingPayment=payments.find(p=>String(p.relatedId||'').trim().toUpperCase()===source.invoiceNo&&p.status==='verified');
    if(!existingPayment){
      await store.setJSON(`payments/${paymentId}`,{
        id:paymentId,type:'payments',customer:source.customer,whatsapp:'',amount:source.amount,method:'Other',reference:`OCT-CLEANUP-${source.invoiceNo}`,
        status:'verified',paymentDate:'2026-10-31',relatedType:'invoice',relatedId:source.invoiceNo,
        notes:'Owner confirmed during the October records cleanup on 2026-10-31 that this invoice had already been paid. Exact original payment date and payment method were not retained, so the confirmation date is used for October reporting and method is left as Other until corrected.',
        createdAt:now,updatedAt:now
      });
    }
  }

  for(const source of OCT15_CUSTOMERS){
    const existing=customers.find(x=>(source.mailboxCode&&String(x.mailboxCode||'').trim().toUpperCase()===source.mailboxCode)||String(x.name||'').trim().toLowerCase()===source.name.toLowerCase());
    if(existing){
      const note=String(existing.notes||'').includes(source.notes)?String(existing.notes||''):[String(existing.notes||'').trim(),source.notes].filter(Boolean).join(' ');
      await store.setJSON(`customers/${existing.id}`,{...existing,name:source.name,mailboxCode:existing.mailboxCode||source.mailboxCode,status:existing.status||'active',source:existing.source||'other',notes:note,updatedAt:now});
    }else{
      const slug=(source.mailboxCode||source.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
      const id=`import-customer-${slug}`;
      await store.setJSON(`customers/${id}`,{id,type:'customers',name:source.name,whatsapp:'',email:'',mailboxCode:source.mailboxCode,address:'',status:'active',source:'other',notes:source.notes,createdAt:now,updatedAt:now});
    }
  }

  await store.setJSON(markerKey,{done:true,completedAt:now,invoices:OCT15_PAID_INVOICES.map(x=>x.invoiceNo),customers:OCT15_CUSTOMERS.map(x=>x.name),paymentStatus:'Owner confirmed all paid; exact original methods/dates not retained'});
}

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
    await applyOct15PaidMigration(store);
    data.invoices=await readType(store,'invoices');
    data.payments=await readType(store,'payments');
    data.customers=await readType(store,'customers');
    const reconciled=await reconcileInvoicePayments(store,data);
    data.invoices=reconciled.invoices;
    data.payments=reconciled.payments;
    data.generatedAt=new Date().toISOString();
    return jsonResponse(data,response);
  }

  return response;
};
