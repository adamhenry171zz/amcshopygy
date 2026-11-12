/* Owner-only invoice document builder. No external PDF or sharing service. */
(()=>{
'use strict';
const ascii=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e]/g,' ');
const pdfText=v=>ascii(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const money=v=>'GYD $'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):'';
const cleanName=v=>String(v||'Invoice').replace(/[^a-z0-9_-]+/gi,'_').slice(0,90);

const DESIGN_DEFAULTS=Object.freeze({version:'amc-premium-v1',festive:false,promoEnabled:true,preset:'members',title:'Save More With AMC Members Club',text:'Lower eligible shipping rates, waived package fees and member benefits.',cta:'amcshopping.com/members'});
function designSettings(v={}){return {version:DESIGN_DEFAULTS.version,festive:v.festive===true,promoEnabled:v.promoEnabled!==false,preset:v.preset||'members',title:String(v.title||DESIGN_DEFAULTS.title).slice(0,100),text:String(v.text||DESIGN_DEFAULTS.text).slice(0,280),cta:String(v.cta||DESIGN_DEFAULTS.cta).slice(0,90)};}
async function getDesign(){const r=await fetch('/.netlify/functions/henry-amc?action=invoice_design',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('Could not retrieve invoice design settings. Sign in and retry.');const d=await r.json();return designSettings(d.settings);}
async function saveDesign(v){const r=await fetch('/.netlify/functions/henry-amc?action=invoice_design',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(designSettings(v))});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save invoice design');return designSettings(d.settings);}

const standardCharge=w=>{const bill=Math.max(1,num(w));if(bill<=2)return 2800;return Math.round(bill*(bill<=10?1500:bill<=25?1300:bill<=55?1200:bill<100?1100:1050)*100)/100;};
const lb=v=>num(v).toFixed(2)+' lb';
async function memberUsage(id){if(!id)throw Error('Save the member invoice before retrieving its monthly allowance.');const r=await fetch('/.netlify/functions/henry-membership?action=invoice_usage&id='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok||!d.usage)throw Error(d.error||'Could not verify monthly membership usage.');return d.usage;}
async function hydrateMember(d){if(!d.member)return d;const u=await memberUsage(d.id);return {...d,usage:u};}
const dayPlus=(v,n=5)=>{const d=new Date(v+'T12:00:00Z');if(!Number.isFinite(d.getTime()))return '';d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
function source(r,packages=[],customers=[]){
 const snap=r.invoiceSnapshot||{}, notes=String(r.notes||'');
 const issued=date(r.invoiceDate)||date(notes.match(/Invoice date:\s*(\d{4}-\d{2}-\d{2})/i)?.[1])||date(r.createdAt);
 const invoiceNo=String(r.invoiceNo||'').trim();
 const tracking=notes.match(/Tracking:\s*([^\n]+)/i)?.[1]?.split(';').map(v=>v.trim()).filter(Boolean)||[];
 const matches=packages.filter(p=>String(p.notes||'').startsWith('Invoice '+invoiceNo+'.')||tracking.includes(String(p.tracking||'')));
 const saved=Array.isArray(snap.packages)?snap.packages:null;
 const rows=saved?saved.map(p=>({tracking:p.tracking,weight:p.weightLb,carrier:p.ref||p.carrier})):
   matches.length?matches.map(p=>({tracking:p.tracking,weight:p.weight,carrier:p.carrier})):
   tracking.map(t=>({tracking:t,weight:null,carrier:''}));
 const exact=customers.find(c=>c.id===r.customerId)||customers.find(c=>c.name===r.customer&&r.whatsapp&&c.whatsapp===r.whatsapp);
 const member=snap.customerType==='member'||/^MC/i.test(invoiceNo);
 const legacyWeight=num(r.shipmentWeight||String(r.description||'').match(/([\d.]+)\s*lb\b/i)?.[1]||notes.match(/Combined weight:\s*([\d.]+)\s*lb\b/i)?.[1]);
 const calc={...(snap.calculation||{})};if(member&&calc.weight===undefined&&legacyWeight>0)calc.weight=legacyWeight;
 if(member&&calc.standardEquivalent===undefined&&calc.weight>0){const exactNormal=notes.match(/regular equivalent GYD \$([\d,.]+)/i)?.[1];const adj=num(notes.match(/Manual adjustment:\s*GYD \$(-?[\d,.]+)/i)?.[1]);calc.standardEquivalent=exactNormal?num(exactNormal):Math.round((standardCharge(calc.weight)+adj)*100)/100;calc.comparisonEstimated=!exactNormal;}

 return {id:r.id,design:snap.design||null,invoiceNo,customer:r.customer||'',whatsapp:r.whatsapp||exact?.whatsapp||'',mailbox:snap.mailboxCode||notes.match(/(?:Mailbox|Customer code):\s*(AMC\d+)/i)?.[1]||exact?.mailboxCode||'',
  issued,due:date(r.dueDate),rows,member,amount:num(r.amount),balance:r.balance===''||r.balance==null?num(r.amount):num(r.balance),
  status:r.status||'draft',calc,description:r.description||'',billing:notes.match(/Billing:\s*([^.\n]+)/i)?.[1]||''};
}
function build(d,logo=null){
 const W=612,H=792,navy='0.027 0.078 0.165',blue='0.055 0.28 0.56',ink='0.09 0.14 0.23',muted='0.34 0.41 0.51',pale='0.946 0.962 0.983',white='1 1 1',red='0.69 0.13 0.15',gold='0.82 0.65 0.31',green='0.08 0.39 0.28';
 const design=designSettings(d.design||{}),festive=design.festive,accent=festive?gold:'0.31 0.61 0.91',season=festive?green:blue;
 const pages=[];let ops=[];
 const rect=(x,y,w,h,c)=>ops.push(c+' rg '+x+' '+(H-y-h)+' '+w+' '+h+' re f');
 const text=(x,y,v,size=10,bold=false,c=ink)=>ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+c+' rg 1 0 0 1 '+x+' '+(H-y)+' Tm ('+pdfText(v)+') Tj ET');
 const wrap=(v,max=88)=>{let s=ascii(v),out=[];while(s.length>max){let at=s.lastIndexOf(' ',max);if(at<1)at=max;out.push(s.slice(0,at));s=s.slice(at).trimStart()}if(s)out.push(s);return out};
 const block=(x,y,v,max=88,size=10,c=ink,bold=false)=>{for(const t of wrap(v,max)){text(x,y,t,size,bold,c);y+=size+4}return y};
 const label=(x,y,v)=>text(x,y,v,9,true,muted);
 const finish=()=>{rect(36,743,540,0.7,'0.82 0.86 0.91');text(36,760,'AMC SHOPPING  |  amcshopping.com  |  +592 604-2826',8,true,muted);text(532,760,'Page '+(pages.length+1),8,false,muted);pages.push(ops.join('\n'));ops=[]};
 const header=(subtitle)=>{
  rect(0,0,W,113,navy);rect(0,109,W,4,accent);
  if(logo){const h=Math.min(57,95*logo.h/logo.w),w=h*logo.w/logo.h;ops.push('q '+w+' 0 0 '+h+' 36 '+(H-81)+' cm /Logo Do Q');}
  const left=logo?146:36;
  text(left,36,'A.M.C SHOPPING',17,true,white);text(left,54,'Your Package. Our Priority. Always.',9,false,'0.76 0.84 0.93');text(left,83,subtitle,12,true,'0.85 0.91 0.98');
  if(festive){text(left,99,"SEASON'S GREETINGS",8,true,gold);rect(388,23,1,67,gold);}
  text(412,31,'INVOICE NUMBER',8,true,'0.76 0.84 0.93');text(412,50,d.invoiceNo,16,true,white);
  text(412,73,'ISSUED  '+(d.issued||'Not recorded'),8,true,'0.76 0.84 0.93');
  text(412,91,'DUE  '+(d.due||'Not assigned'),9,true,white);
 };
 const table=(rows,start,y)=>{
  rect(36,y,540,24,navy);text(44,y+16,'#',8,true,white);text(68,y+16,'TRACKING NUMBER',8,true,white);text(377,y+16,'WEIGHT (LB)',8,true,white);text(472,y+16,'CARRIER / REF',8,true,white);y+=24;
  rows.forEach((p,i)=>{const track=wrap(p.tracking,48),carrier=wrap(p.carrier||'-',17),h=Math.max(24,Math.max(track.length,carrier.length)*11+9);if(i%2===0)rect(36,y,540,h,pale);text(44,y+15,start+i+1,9);track.forEach((v,j)=>text(68,y+15+j*11,v,8.5));text(377,y+15,p.weight===null||p.weight===''||p.weight===undefined?'Not recorded':num(p.weight).toFixed(2),9);carrier.forEach((v,j)=>text(472,y+15+j*11,v,8));rect(36,y+h-0.5,540,0.5,'0.88 0.90 0.93');y+=h;});return y;
 };
 const card=(x,y,w,labelText,value,note='',color=ink)=>{rect(x,y,w,78,pale);rect(x,y,3,78,season);label(x+12,y+18,labelText);text(x+12,y+43,value,value.length>18?14:18,true,color);if(note)text(x+12,y+62,note,8,false,muted);};
 const promo=(y)=>{
  if(!design.promoEnabled)return;
  rect(36,y,540,116,navy);rect(36,y,4,116,festive?gold:accent);
  text(50,y+17,'AMC PROMOTION',8,true,festive?gold:'0.56 0.78 1');
  let yy=block(50,y+34,design.title,68,11,white,true);
  yy=block(50,yy+1,design.text,94,9,'0.86 0.91 0.97');
  block(50,Math.min(yy+4,y+96),design.cta,90,9,festive?gold:'0.67 0.84 1',true);
 };
 header(d.member?'MEMBERS CLUB SHIPPING INVOICE':'SHIPPING INVOICE');
 label(36,136,'BILL TO');let y=block(36,157,d.customer,43,14,ink,true);
 if(d.mailbox){text(36,y,'Mailbox: '+d.mailbox,9);y+=15;}
 if(d.whatsapp){text(36,y,'WhatsApp: '+d.whatsapp,9);y+=15;}
 rect(343,126,233,94,pale);rect(343,126,4,94,season);label(358,145,'AMOUNT DUE');text(358,173,money(d.balance),money(d.balance).length>19?18:23,true,red);
 text(358,194,'PAYMENT DUE',8,true,muted);text(358,209,d.due||'Not yet assigned',11,true,ink);
 y=Math.max(239,y+8);text(36,y,'01  SHIPMENT DETAILS',10,true,season);y+=14;
 const chunks=[];let chunk=[],height=0;
 for(const p of d.rows){const h=Math.max(24,Math.max(wrap(p.tracking,48).length,wrap(p.carrier||'-',17).length)*11+9);const max=chunks.length===0?144:495;if(chunk.length&&(height+h>max)){chunks.push(chunk);chunk=[];height=0;}chunk.push(p);height+=h;}
 if(chunk.length)chunks.push(chunk);
 if(chunks.length)y=table(chunks[0],0,y);else y=block(36,y+10,'Package details were not retained in this record. Contact AMC for the original shipment breakdown.',84,10,muted);
 y+=20;text(36,y,'02  BILLING SUMMARY',10,true,season);y+=18;
 const calc=d.calc||{};
 if(calc.weight!==undefined){text(36,y,'Combined shipment weight: '+num(calc.weight).toFixed(2)+' lb',10,true);y+=16;}
 y=block(36,y,calc.rateLabel||d.billing||d.description,86,9,muted);
 if(calc.shipping!==undefined){text(36,y,'Shipping charge: '+money(calc.shipping),9);y+=14;}
 if(calc.adjustment){text(36,y,'Adjustment: '+money(calc.adjustment),9);y+=14;}
 y+=4;rect(36,y,540,42,pale);text(48,y+16,'INVOICE TOTAL',8,true,muted);text(48,y+33,money(d.amount),13,true);text(336,y+16,'BALANCE DUE',8,true,muted);text(336,y+33,money(d.balance),15,true,red);y+=63;
 text(36,y,'03  PAYMENT & RELEASE',10,true,season);y+=17;
 text(36,y,'MMG Pay Merchant: AMC SHOPPING / m742288',10,true);y+=14;text(36,y,'Send payment confirmation to +592 604-2826.',9);y+=16;
 block(36,y,'Payment must be cleared before release. Storage: GYD $500/day after 7 days from notice.',92,8,muted);
 finish();
 let offset=chunks[0]?.length||0;
 for(let i=1;i<chunks.length;i++){header('PACKAGE CONTINUATION');text(36,143,d.customer,13,true);text(36,162,'Continuation of '+d.invoiceNo,9,false,muted);table(chunks[i],offset,182);offset+=chunks[i].length;finish();}
 header(d.member?'MEMBERS CLUB SUMMARY':'MEMBERS CLUB BENEFITS');
 text(36,143,d.member?'Your membership value':'Discover the AMC Members Club',20,true);
 if(d.member){
  const u=d.usage,normal=calc.standardEquivalent,diff=normal===undefined?null:num(normal)-d.amount;
  card(36,161,174,'MEMBER TOTAL',money(d.amount),'Current shipment');
  card(219,161,174,calc.comparisonEstimated?'REGULAR (EST.)':'REGULAR TOTAL',normal===undefined?'Not recorded':money(normal),'Same shipment');
  card(402,161,174,diff!==null&&diff<0?'EXTRA COST':'YOUR SAVINGS',diff===null?'Not recorded':money(Math.abs(diff)),'Shipping-rate difference',diff!==null&&diff<0?red:green);
  if(u){
   rect(36,257,540,217,pale);text(49,279,'MONTHLY SHIPPING ALLOWANCE  |  '+u.month,11,true,navy);
   text(49,298,(u.planName||'Member plan')+' - '+lb(u.baseAllowanceLb)+' base allowance',10,true);
   const values=[['MISSED-SHIPMENT CREDIT','+'+lb(u.adjustmentLb)],['TOTAL AVAILABLE',lb(u.allowanceLb)],['USED BEFORE',lb(u.usedBeforeLb)],['THIS SHIPMENT',lb(u.shipmentLb)],['USED THROUGH THIS INVOICE',lb(u.usedThroughLb)],['REMAINING',lb(u.remainingLb)]];
   values.forEach(([labelText,value],i)=>{const x=49+(i%3)*174,yy=311+Math.floor(i/3)*51;rect(x,yy,163,44,white);label(x+8,yy+14,labelText);text(x+8,yy+34,value,15,true,ink);});
   const pct=u.allowanceLb>0?Math.min(1,u.usedThroughLb/u.allowanceLb):0;rect(49,419,514,6,'0.84 0.88 0.93');rect(49,419,514*pct,6,u.overageLb>0?red:season);
   text(49,442,'Above allowance: '+lb(u.overageLb),10,true,u.overageLb>0?red:muted);text(49,459,'Recorded usage through this invoice.',8,false,muted);
   let yy=491;yy=block(36,yy,'Monthly allowances reset. Unused pounds do not roll over unless AMC approves a missed or delayed shipment adjustment.',96,9,muted);
   if(u.adjustmentLb>0)block(36,yy+2,'Extra pounds apply to the approved month only and do not permanently change your plan.',96,9,muted);
  }else block(36,274,'Monthly usage was not verified. Contact AMC Shopping for the recorded allowance.',90,10,muted);
  promo(607);
 }else{
  block(36,171,'Lower eligible shipping rates, waived package fees and priority processing for members.',85,12,muted);
  const weight=num(calc.weight),adj=num(calc.adjustment),estimate=weight>0?Math.round((Math.max(1,weight)*950+adj)*100)/100:null;
  if(estimate!==null){card(36,211,174,'REGULAR TOTAL',money(d.amount),'Current shipment');card(219,211,174,'MEMBER RATE EST.',money(estimate),'Before plan conditions');card(402,211,174,'RATE DIFFERENCE',money(Math.max(0,d.amount-estimate)),'Potential savings',green);}
  const plans=[['Starter','20 lb'],['Small Business','50 lb'],['Business Pro','100 lb'],['Enterprise','220 lb']];
  plans.forEach((p,i)=>{const x=36+(i%2)*274,yy=309+Math.floor(i/2)*70;rect(x,yy,266,62,pale);text(x+12,yy+20,p[0],10,true,season);text(x+12,yy+44,p[1],19,true);});
  text(36,472,'Explore plans: amcshopping.com/members',11,true,blue);
  promo(515);
 }
 if(!design.promoEnabled)text(36,704,'Thank you for choosing A.M.C Shopping.',10,true,season);
 else if(!d.member)text(36,704,'Thank you for choosing A.M.C Shopping.',10,true,season);
 finish();
 const objs=[null,'<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
 let imageId=0;
 if(logo){imageId=objs.length;objs.push('<< /Type /XObject /Subtype /Image /Width '+logo.w+' /Height '+logo.h+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length '+(logo.hex.length+1)+' >>\nstream\n'+logo.hex+'>\nendstream');}
 const kids=[];for(const stream of pages){const pid=objs.length,cid=pid+1;kids.push(pid+' 0 R');objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>'+(imageId?' /XObject << /Logo '+imageId+' 0 R >>':'')+' >> /Contents '+cid+' 0 R >>');objs.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');}
 objs[2]='<< /Type /Pages /Count '+pages.length+' /Kids ['+kids.join(' ')+'] >>';
 let pdf='%PDF-1.4\n',offsets=[0];for(let i=1;i<objs.length;i++){offsets[i]=pdf.length;pdf+=i+' 0 obj\n'+objs[i]+'\nendobj\n';}
 const xref=pdf.length;pdf+='xref\n0 '+objs.length+'\n0000000000 65535 f \n';for(let i=1;i<objs.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';pdf+='trailer\n<< /Size '+objs.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return pdf;
}
let logoPromise;
function getLogo(){if(logoPromise)return logoPromise;logoPromise=new Promise(resolve=>{const img=new Image();img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.fillStyle='#091a38';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);const bytes=atob(c.toDataURL('image/jpeg',0.9).split(',')[1]);resolve({w:c.width,h:c.height,hex:Array.from(bytes,ch=>ch.charCodeAt(0).toString(16).padStart(2,'0')).join('')});}catch{resolve(null)}};img.onerror=()=>resolve(null);img.src='/assets/amc-logo.png';});return logoPromise;}
async function makeFile(d){if(!d.design)d={...d,design:await getDesign()};if(d.member&&!d.usage)d=await hydrateMember(d);const logo=await getLogo();return new File([build(d,logo)],'AMC_'+cleanName(d.invoiceNo)+'_'+cleanName(d.customer)+'.pdf',{type:'application/pdf'});}
function download(file){const a=document.createElement('a'),url=URL.createObjectURL(file);a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const phone=v=>{let s=String(v||'').replace(/\D/g,'');if(s.length===7)s='592'+s;return s.length>=10&&s.length<=15?s:''};
const message=d=>'Hello '+d.customer+', your AMC Shopping invoice '+d.invoiceNo+' is ready. Total: '+money(d.amount)+'. Balance due: '+money(d.balance)+'. Payment due: '+(d.due||'please confirm with AMC')+'. Please see the attached PDF invoice for your shipment details and payment instructions. Thank you for choosing AMC Shopping!';
window.HenryInvoicePDF={source,build,makeFile,download,phone,message,dayPlus,money,memberUsage,hydrateMember,designSettings,getDesign,saveDesign,DESIGN_DEFAULTS};
})();
