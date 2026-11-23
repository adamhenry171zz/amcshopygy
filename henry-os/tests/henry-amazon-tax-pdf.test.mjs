import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {AMC_INVOICE_LOGO_PNG_BASE64} from '../functions/henry-tax-logo.mjs';

const original=await readFile(new URL('../functions/henry-amazon-tax.mjs',import.meta.url),'utf8');
const script=original.replace(/^import .*?;$/gm,'').replace('export default async(req,context)=>','const handler=async(req,context)=>');
const records=new Map();
const getStore=()=>({
 get:async key=>records.get(key)??null,
 setJSON:async(key,value)=>{records.set(key,structuredClone(value))},
 list:async({prefix})=>({blobs:[...records.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))})
});
const secret='s'.repeat(40),email='owner@example.com';
const env={env:{HENRY_SESSION_SECRET:secret,HENRY_ADMIN_EMAIL:email}};
const {handler,buildPdf,invoiceLogo,nextTuesday}=new Function('crypto','zlib','getStore','AMC_INVOICE_LOGO_PNG_BASE64','process','Response','URL','Buffer',script+'\nreturn {handler,buildPdf,invoiceLogo,nextTuesday};')(crypto,zlib,getStore,AMC_INVOICE_LOGO_PNG_BASE64,env,Response,URL,Buffer);
const token=Buffer.from(JSON.stringify({email,exp:Date.now()+5000000})).toString('base64url');
const cookie=token+'.'+crypto.createHmac('sha256',secret).update(token).digest('base64url');
const req=(action,body=null,owner=false)=>new Request('https://test.example/.netlify/functions/henry-amazon-tax?action='+action,{method:body?'POST':'GET',headers:{...(owner?{cookie:'henry_session='+cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
const live={deploy:{context:'production'}};

test('invoice logo decodes into a full RGB image',()=>{
 const logo=invoiceLogo();
 assert.equal(logo.width,320);assert.equal(logo.height,230);
 assert.equal(zlib.inflateSync(logo.bytes).length,320*230*3);
});
test('dates always advance to the following Tuesday',()=>{
 assert.equal(nextTuesday('2026-11-21'),'2026-11-24');
 assert.equal(nextTuesday('2026-11-22'),'2026-11-24');
 assert.equal(nextTuesday('2026-11-24'),'2026-12-01');
});
test('one code supports multiple customer-submitted PDFs with the sample A4 layout and logo',async()=>{
 const created=await handler(req('admin_create',{},true),live);assert.equal(created.status,201);
 const {receiptNumber}=await created.json();assert.match(receiptNumber,/^AMC-RCPT-/);
 const wrong=await handler(req('verify',{receiptNumber:'bad'}),live);assert.equal(wrong.status,403);
 const verified=await handler(req('verify',{receiptNumber}),live);assert.equal(verified.status,200);
 for(let n=0;n<2;n++){
  const orderId='114-'+String(1234567+n)+'-'+String(7654321+n);
  const form={receiptNumber,customerName:'Test Customer',guyanaAddress:'Lot 5-6 Supply East Bank Demerara, Guyana',orderId,warehouseDate:'2026-11-19',warehouseTime:'13:00',items:'TBA335514688312 | 3.00 | Amazon Package\nTBADD0055525698 | 7.00 | Amazon Package',confirmed:true};
  const result=await handler(req('generate',form),live);
  assert.equal(result.status,200);
  const buf=Buffer.from(await result.arrayBuffer());assert.ok(buf.length>8000);
  const source=buf.toString('latin1');
  assert.ok(source.startsWith('%PDF-1.4'));
  assert.ok(source.includes('/MediaBox [0 0 595.28 841.89]'));
  assert.ok(source.includes('/Logo Do'));
  assert.ok(source.includes('Warehouse Receipt'));
  assert.ok(source.includes('Shipper Information'));
  assert.ok(source.includes('Consignee Information'));
  assert.ok(source.includes('Receipt Details'));
  assert.ok(source.includes('Total Tracking #: 2'));
  assert.ok(!source.includes('not proof of arrival'));
  assert.ok(!source.includes('customer-submitted shipment details'));
  assert.ok(source.includes('Scheduled Date/Time:'));
  assert.ok(source.includes('11/24/2026, 12:00:00 PM'));
  assert.ok(source.includes(orderId));
 }
 const rows=await handler(req('admin_list',null,true),live);const data=await rows.json();
 assert.equal(data.receipts.length,2);
 const reread=await handler(req('admin_pdf',null,true),live);assert.notEqual(reread.status,200); // requires id
});
test('a large package order flows onto multiple A4 pages',()=>{
 const rows=Array.from({length:16},(_,i)=>({tracking:'TBA12345678'+i,weight:1.5,description:'Amazon Package'}));
 const doc=buildPdf({customerName:'Example Customer',guyanaAddress:'Georgetown, Guyana'}, {items:rows,receiptNo:'AMC-DOC-TEST',orderId:'114-1234567-7654321',expectedGuyanaDate:'2026-11-24',warehouseDate:'2026-11-20',warehouseTime:'12:00'});
 const text=doc.toString('latin1');
 assert.ok(text.includes('/Count 2'));
 assert.ok(text.includes('Total Items: 16'));
});
