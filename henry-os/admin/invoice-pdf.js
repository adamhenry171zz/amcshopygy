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
  rect(36,y,540,147,navy);rect(36,y,4,147,festive?gold:accent);
  text(50,y+17,'AMC PROMOTION',8,true,festive?gold:'0.56 0.78 1');
  let yy=block(50,y+34,design.title,68,11,white,true);
  yy=block(50,yy+1,design.text,88,9,'0.86 0.91 0.97');
  block(50,yy+3,design.cta,82,9,festive?gold:'0.67 0.84 1',true);
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
  promo(582);
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
function getLogo(){if(logoPromise)return logoPromise;logoPromise=new Promise(resolve=>{const img=new Image();img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.fillStyle='#07142a';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);const bytes=atob(c.toDataURL('image/jpeg',0.9).split(',')[1]);resolve({w:c.width,h:c.height,hex:Array.from(bytes,ch=>ch.charCodeAt(0).toString(16).padStart(2,'0')).join('')});}catch{resolve(null)}};img.onerror=()=>resolve(null);img.src="data:image/png;base64,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";});return logoPromise;}
async function makeFile(d){if(!d.design)d={...d,design:await getDesign()};if(d.member&&!d.usage)d=await hydrateMember(d);const logo=await getLogo();return new File([build(d,logo)],'AMC_'+cleanName(d.invoiceNo)+'_'+cleanName(d.customer)+'.pdf',{type:'application/pdf'});}
function download(file){const a=document.createElement('a'),url=URL.createObjectURL(file);a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const phone=v=>{let s=String(v||'').replace(/\D/g,'');if(s.length===7)s='592'+s;return s.length>=10&&s.length<=15?s:''};
const message=d=>'Hello '+d.customer+', your AMC Shopping invoice '+d.invoiceNo+' is ready. Total: '+money(d.amount)+'. Balance due: '+money(d.balance)+'. Payment due: '+(d.due||'please confirm with AMC')+'. Please see the attached PDF invoice for your shipment details and payment instructions. Thank you for choosing AMC Shopping!';
window.HenryInvoicePDF={source,build,makeFile,download,phone,message,dayPlus,money,memberUsage,hydrateMember,designSettings,getDesign,saveDesign,DESIGN_DEFAULTS};
})();
