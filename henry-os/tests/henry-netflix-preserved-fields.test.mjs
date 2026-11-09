import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';

const src=await readFile(new URL('../functions/henry-amc.mjs',import.meta.url),'utf8');
const api=src.replace(/^import .*$/gm,'').replace('export default async','const handler=async')+'\nreturn handler;';
function harness(){
 const email='owner@example.invalid',secret='s'.repeat(40),maps=new Map();
 const getStore=name=>{
  if(!maps.has(name))maps.set(name,new Map());
  const m=maps.get(name);
  return{list:async({prefix})=>({blobs:[...m.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}),
   get:async k=>m.get(k)||null,setJSON:async(k,v)=>m.set(k,structuredClone(v)),delete:async k=>m.delete(k)};
 };
 const fn=new Function('crypto','getStore','process','Response','URL',api)(
  crypto,getStore,{env:{HENRY_ADMIN_EMAIL:email,HENRY_SESSION_SECRET:secret}},Response,URL);
 const payload=Buffer.from(JSON.stringify({email,exp:Date.now()+3600000})).toString('base64url');
 const cookie=payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 const call=async(action,body,deploy='production',authorized=true)=>{
  const res=await fn(new Request('https://test.invalid/?action='+action,{
   method:'POST',headers:authorized?{cookie:'henry_session='+cookie}:{},
   body:JSON.stringify(body)}),{deploy:{context:deploy}});
  return {status:res.status,data:await res.json()};
 };
 return{maps,getStore,call};
}
const existing={
 id:'netflix-original-112',type:'streaming',customer:'Existing Customer',service:'Netflix',
 status:'inactive',plan:'PRIVATE',amount:'3500',dueDate:'2026-12-09',
 accountPaymentDate:'2026-11-20',
 notes:'Imported from N/ACCOUNTS. Netflix provider-side account payment date: 2026-11-20 (not customer payment due).',
 inactiveSince:'2026-11-09',statusHistory:[{from:'active',to:'inactive',date:'2026-11-09'}],
 createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-11-09T03:00:00Z'
};
const edited={customer:'Existing Customer',whatsapp:'5926001111',service:'Netflix',
 plan:'PRIVATE',amount:'3500',dueDate:'2026-12-09',status:'inactive',
 accountEmail:'hidden@example.invalid',notes:'Corrected customer notes only'};
test('ordinary admin edits preserve imported provider date and inactivity history',async()=>{
 const h=harness();
 await h.getStore('henry-amc').setJSON('streaming/'+existing.id,existing);
 assert.equal((await h.call('save',{type:'streaming',id:existing.id,record:edited},'deploy-preview')).status,403);
 assert.equal((await h.call('save',{type:'streaming',id:existing.id,record:edited})).status,200);
 const saved=await h.getStore('henry-amc').get('streaming/'+existing.id);
 assert.equal(saved.accountPaymentDate,existing.accountPaymentDate);
 assert.match(saved.notes,/Netflix provider-side account payment date: 2026-11-20/);
 assert.equal(saved.inactiveSince,existing.inactiveSince);
 assert.deepEqual(saved.statusHistory,existing.statusHistory);
 assert.equal(saved.createdAt,existing.createdAt);
 assert.equal(saved.customer,existing.customer);
});
test('general editor cannot silently rewrite provider dates, bypass status approval or delete customers',async()=>{
 const h=harness();
 await h.getStore('henry-amc').setJSON('streaming/'+existing.id,existing);
 assert.equal((await h.call('save',{type:'streaming',id:existing.id,
  record:{...edited,notes:'Netflix provider-side account payment date: 2027-01-20'}})).status,409);
 assert.equal((await h.call('save',{type:'streaming',id:existing.id,
  record:{...edited,status:'active'}})).status,409);
 assert.equal((await h.call('delete',{type:'streaming',id:existing.id})).status,409);
 assert.deepEqual(await h.getStore('henry-amc').get('streaming/'+existing.id),existing);
});
test('no original provider date field may be destroyed by a round-trip save',async()=>{
 const h=harness();
 const withDirect={...existing,accountPaymentDate:'2026-11-20'};
 await h.getStore('henry-amc').setJSON('streaming/'+existing.id,withDirect);
 const result=await h.call('save',{type:'streaming',id:existing.id,record:{...edited,notes:''}});
 assert.equal(result.status,200);
 const kept=await h.getStore('henry-amc').get('streaming/'+existing.id);
 assert.equal(kept.accountPaymentDate,'2026-11-20');
 assert.ok(kept.notes.includes('2026-11-20'));
 assert.doesNotThrow(()=>new Function(api));
});
