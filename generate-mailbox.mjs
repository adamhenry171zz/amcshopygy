import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const clean=(value,max=100)=>String(value??'').trim().replace(/[<>]/g,'').slice(0,max);
const digits=value=>String(value??'').replace(/\D/g,'');
const normalizeEmail=value=>clean(value,150).toLowerCase();
const normalizeName=value=>clean(value,80).toLowerCase().replace(/\s+/g,' ');
const emailKey=value=>value?crypto.createHash('sha256').update(value).digest('hex').slice(0,32):'';
const codeCandidate=()=>`AMC${Math.floor(10000+Math.random()*90000)}`;

function canonicalPhone(value){
  let d=digits(value);
  if(d.startsWith('00'))d=d.slice(2);
  if(d.length===7)d=`592${d}`;
  else if(d.length===8&&d.startsWith('0'))d=`592${d.slice(1)}`;
  else if(d.startsWith('592')&&d.length>=10)d=`592${d.slice(-7)}`;
  return d;
}

const sameName=(record,firstName,lastName)=>normalizeName(record?.firstName)===normalizeName(firstName)&&normalizeName(record?.lastName)===normalizeName(lastName);

async function readMailbox(store,code){
  if(!code)return null;
  return store.get(`mailboxes/${code}`,{type:'json'}).catch(()=>null);
}

async function findLegacyMailbox(store,phoneKey,email,firstName,lastName){
  const {blobs}=await store.list({prefix:'mailboxes/'});
  for(const blob of blobs){
    const record=await store.get(blob.key,{type:'json'}).catch(()=>null);
    if(!record)continue;
    const samePhone=phoneKey&&canonicalPhone(record.whatsapp)===phoneKey;
    const sameEmail=email&&normalizeEmail(record.email)===email&&sameName(record,firstName,lastName);
    if(samePhone||sameEmail)return record;
  }
  return null;
}

async function saveAliases(store,record,phoneKey,email){
  const payload={code:record.code,firstName:record.firstName,lastName:record.lastName,whatsapp:record.whatsapp,email:record.email,createdAt:record.createdAt};
  if(phoneKey){
    await store.setJSON(`identity/phone/${phoneKey}`,payload).catch(()=>{});
    await store.setJSON(`contacts/${phoneKey}`,payload).catch(()=>{});
  }
  if(email)await store.setJSON(`identity/email/${emailKey(email)}`,payload,{onlyIfNew:true}).catch(()=>{});
}

function result(record,existing){
  return {
    code:record.code,
    firstName:record.firstName,
    lastNameCheckout:`${record.lastName} AMC`,
    address1:'14619 228th Street',
    city:'Springfield Gardens',
    state:'NY',
    zip:'11413',
    country:'United States',
    phone:'+1 592 604 2826',
    existing
  };
}

export default async req=>{
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  let body;try{body=await req.json()}catch{return json({error:'Invalid request.'},400)}
  const firstName=clean(body.firstName,50),lastName=clean(body.lastName,50),whatsapp=clean(body.whatsapp,35),email=normalizeEmail(body.email);
  const phoneKey=canonicalPhone(whatsapp);
  if(!firstName||!lastName||phoneKey.length<7)return json({error:'Please enter your first name, last name and a valid WhatsApp number.'},400);

  const store=getStore('amc-mailboxes');
  const phoneAlias=await store.get(`identity/phone/${phoneKey}`,{type:'json'}).catch(()=>null) || await store.get(`contacts/${phoneKey}`,{type:'json'}).catch(()=>null);
  const rawEmailAlias=email?await store.get(`identity/email/${emailKey(email)}`,{type:'json'}).catch(()=>null):null;
  const emailAlias=rawEmailAlias&&sameName(rawEmailAlias,firstName,lastName)?rawEmailAlias:null;
  const existingAlias=phoneAlias||emailAlias;

  if(existingAlias?.code){
    const record=await readMailbox(store,existingAlias.code)||existingAlias;
    await saveAliases(store,record,phoneKey,email);
    return json(result(record,true));
  }

  const legacy=await findLegacyMailbox(store,phoneKey,email,firstName,lastName);
  if(legacy?.code){
    await saveAliases(store,legacy,phoneKey,email);
    return json(result(legacy,true));
  }

  for(let attempt=0;attempt<30;attempt+=1){
    const code=codeCandidate();
    const record={code,firstName,lastName,whatsapp,email,phoneKey,createdAt:new Date().toISOString()};
    const phoneClaim=await store.setJSON(`identity/phone/${phoneKey}`,record,{onlyIfNew:true});
    if(!phoneClaim.modified){
      const claimed=await store.get(`identity/phone/${phoneKey}`,{type:'json'}).catch(()=>null);
      if(claimed?.code){
        const existingRecord=await readMailbox(store,claimed.code)||claimed;
        await saveAliases(store,existingRecord,phoneKey,email);
        return json(result(existingRecord,true));
      }
      continue;
    }

    if(email){
      const emailClaim=await store.setJSON(`identity/email/${emailKey(email)}`,record,{onlyIfNew:true});
      if(!emailClaim.modified){
        const claimed=await store.get(`identity/email/${emailKey(email)}`,{type:'json'}).catch(()=>null);
        if(claimed?.code&&claimed.code!==code&&sameName(claimed,firstName,lastName)){
          await store.delete(`identity/phone/${phoneKey}`).catch(()=>{});
          const existingRecord=await readMailbox(store,claimed.code)||claimed;
          await saveAliases(store,existingRecord,phoneKey,email);
          return json(result(existingRecord,true));
        }
      }
    }

    const created=await store.setJSON(`mailboxes/${code}`,record,{onlyIfNew:true});
    if(created.modified){
      await store.setJSON(`contacts/${phoneKey}`,record).catch(()=>{});
      return json(result(record,false),201);
    }

    await store.delete(`identity/phone/${phoneKey}`).catch(()=>{});
  }

  return json({error:'AMC could not issue a mailbox code right now. Please try again or WhatsApp us.'},503);
};
