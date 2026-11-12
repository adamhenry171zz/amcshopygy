/* Owner-only invoice document builder. No external PDF or sharing service. */
(()=>{
'use strict';
const ascii=v=>String(v??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-').replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/[^\x20-\x7e]/g,' ');
const pdfText=v=>ascii(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const money=v=>'GYD $'+num(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const date=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):'';
const cleanName=v=>String(v||'Invoice').replace(/[^a-z0-9_-]+/gi,'_').slice(0,90);
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
 return {invoiceNo,customer:r.customer||'',whatsapp:r.whatsapp||exact?.whatsapp||'',mailbox:snap.mailboxCode||notes.match(/(?:Mailbox|Customer code):\s*(AMC\d+)/i)?.[1]||exact?.mailboxCode||'',
  issued,due:date(r.dueDate),rows,member,amount:num(r.amount),balance:r.balance===''||r.balance==null?num(r.amount):num(r.balance),
  status:r.status||'draft',calc:snap.calculation||{},description:r.description||'',billing:notes.match(/Billing:\s*([^.\n]+)/i)?.[1]||''};
}
function build(d,logo=null){
 const W=612,H=792,navy='0.035 0.10 0.22',blue='0.05 0.34 0.68',ink='0.10 0.16 0.25',muted='0.33 0.40 0.50',pale='0.94 0.96 0.99',white='1 1 1',red='0.69 0.13 0.15';
 const pages=[];let ops=[];
 const rect=(x,y,w,h,c)=>ops.push(c+' rg '+x+' '+(H-y-h)+' '+w+' '+h+' re f');
 const text=(x,y,v,size=10,bold=false,c=ink)=>ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+c+' rg 1 0 0 1 '+x+' '+(H-y)+' Tm ('+pdfText(v)+') Tj ET');
 const line=(x,y,w)=>{rect(x,y,w,0.7,'0.81 0.85 0.90')};
 const wrap=(v,max=88)=>{let s=ascii(v),out=[];while(s.length>max){let at=s.lastIndexOf(' ',max);if(at<1)at=max;out.push(s.slice(0,at));s=s.slice(at).trimStart()}if(s)out.push(s);return out};
 const block=(x,y,v,max=88,size=10,c=ink)=>{for(const t of wrap(v,max)){text(x,y,t,size,false,c);y+=size+5}return y};
 const finish=()=>{text(36,760,'AMC SHOPPING  |  amcshopping.com  |  +592 604-2826',9,true,muted);text(540,760,'Page '+(pages.length+1),9,false,muted);pages.push(ops.join('\n'));ops=[]};
 const header=(subtitle)=>{
  rect(0,0,W,116,navy);rect(0,112,W,4,blue);
  if(logo){const h=54,w=Math.min(110,h*logo.w/logo.h);ops.push('q '+w+' 0 0 '+h+' 32 '+(H-78)+' cm /Logo Do Q');}
  const left=logo?150:36;
  text(left,42,'A.M.C SHOPPING',19,true,white);text(left,62,'Your Package. Our Priority. Always.',10,false,white);text(left,89,subtitle,12,true,'0.55 0.81 1');
  text(442,39,'INVOICE #',9,true,white);text(442,61,d.invoiceNo,15,true,white);text(442,86,'Issued: '+(d.issued||'Not recorded'),9,false,white);
 };
 const table=(rows,start,y)=>{
  rect(36,y,540,25,navy);text(44,y+16,'#',9,true,white);text(72,y+16,'TRACKING NUMBER',9,true,white);text(392,y+16,'WEIGHT (LB)',9,true,white);text(480,y+16,'CARRIER / REF',9,true,white);y+=25;
  rows.forEach((p,i)=>{const track=wrap(p.tracking,49),carrier=wrap(p.carrier||'-',15),h=Math.max(25,Math.max(track.length,carrier.length)*12+10);if(i%2===0)rect(36,y,540,h,pale);text(44,y+16,start+i+1,9);track.forEach((v,j)=>text(72,y+16+j*12,v,9));text(392,y+16,p.weight===null||p.weight===''||p.weight===undefined?'Not recorded':num(p.weight).toFixed(2),9);carrier.forEach((v,j)=>text(480,y+16+j*12,v,9));y+=h;});
  return y;
 };
 header(d.member?'MEMBERS CLUB SHIPPING INVOICE':'SHIPPING INVOICE');
 text(36,143,'BILL TO',10,true,blue);let y=block(36,165,d.customer,54,13);
 if(d.mailbox){text(36,y,'Mailbox: '+d.mailbox,10);y+=16;}
 if(d.whatsapp){text(36,y,'WhatsApp: '+d.whatsapp,10);y+=16;}
 rect(350,132,226,90,pale);text(364,151,'BALANCE DUE',10,true,muted);text(364,178,money(d.balance),22,true,red);
 text(364,203,'PAYMENT DUE: '+(d.due||'Not yet assigned'),10,true,ink);
 y=Math.max(244,y+16);
 text(36,y,'SHIPMENT DETAILS',11,true,blue);y+=17;
 const chunks=[];let chunk=[],height=0;
 for(const p of d.rows){const h=Math.max(25,Math.max(wrap(p.tracking,49).length,wrap(p.carrier||'-',15).length)*12+10);
  const max=chunks.length===0?165:480;
  if(chunk.length&&(height+h>max)){chunks.push(chunk);chunk=[];height=0;}chunk.push(p);height+=h;
 }
 if(chunk.length)chunks.push(chunk);
 if(chunks.length)y=table(chunks[0],0,y);
 else y=block(36,y,'Package details were not retained in this record. Contact AMC Shopping if you need the original shipment breakdown.',83,10,muted);
 y+=17;
 if(d.calc.weight!==undefined)text(36,y,'Combined weight: '+num(d.calc.weight).toFixed(2)+' lb',10,true);
 else text(36,y,d.rows.length?'Listed packages: '+d.rows.length:'Invoice summary',10,true);
 y+=17;
 y=block(36,y,d.calc.rateLabel||d.billing||d.description,86,10,muted);
 if(d.calc.shipping!==undefined){text(36,y,'Shipping charge: '+money(d.calc.shipping),10);y+=15;}
 if(d.calc.adjustment){text(36,y,'Adjustment: '+money(d.calc.adjustment),10);y+=15;}
 y+=3;line(36,y,540);y+=19;text(36,y,'INVOICE TOTAL: '+money(d.amount),12,true);text(350,y,'BALANCE: '+money(d.balance),12,true,red);y+=25;
 text(36,y,'HOW TO PAY',11,true,blue);y+=18;text(36,y,'MMG Pay Merchant: AMC SHOPPING / m742288',10,true);y+=15;text(36,y,'Send payment confirmation to +592 604-2826.',10);y+=15;
 y=block(36,y,'Payment must be cleared before release. Storage: GYD $500/day after 7 days from notice.',85,9,muted);
 finish();
 let offset=chunks[0]?.length||0;
 for(let i=1;i<chunks.length;i++){header('PACKAGE CONTINUATION');text(36,146,d.customer,13,true);text(36,166,'Continuation of '+d.invoiceNo,10,false,muted);table(chunks[i],offset,190);offset+=chunks[i].length;finish();}
 header(d.member?'MEMBERS CLUB SUMMARY':'SAVE MORE WITH AMC');
 text(36,150,d.member?'Your Members Club shipment':'Explore the AMC Members Club',22,true,ink);
 if(d.member){
  text(36,182,'MEMBER TOTAL',10,true,blue);text(36,210,money(d.amount),22,true);
  if(d.calc.standardEquivalent!==undefined){text(36,252,'Regular customer equivalent: '+money(d.calc.standardEquivalent),12);text(36,277,'Shipment savings: '+money(Math.max(0,num(d.calc.standardEquivalent)-d.amount)),13,true,blue);}
  block(36,320,'Members Club benefits: package fees waived, lower eligible shipping rates and priority processing.',78,12);
 }else{
  block(36,184,'Save on eligible shipments with lower member shipping rates, waived package fees and priority processing.',75,13);
  const plans=[['Starter','20 lbs'],['Small Business','50 lbs'],['Business Pro','100 lbs'],['Enterprise','220 lbs']];
  plans.forEach((p,i)=>{const x=36+(i%2)*278,yy=252+Math.floor(i/2)*94;rect(x,yy,262,78,pale);text(x+14,yy+27,p[0],13,true,blue);text(x+14,yy+53,p[1],17,true);});
 }
 text(36,482,'Learn more: amcshopping.com/members',12,true,blue);
 text(36,512,'Thank you for choosing A.M.C Shopping.',12);
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
async function makeFile(d){const logo=await getLogo();return new File([build(d,logo)],'AMC_'+cleanName(d.invoiceNo)+'_'+cleanName(d.customer)+'.pdf',{type:'application/pdf'});}
function download(file){const a=document.createElement('a'),url=URL.createObjectURL(file);a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
const phone=v=>{let s=String(v||'').replace(/\D/g,'');if(s.length===7)s='592'+s;return s.length>=10&&s.length<=15?s:''};
const message=d=>'Hello '+d.customer+', your AMC Shopping invoice '+d.invoiceNo+' is ready. Total: '+money(d.amount)+'. Balance due: '+money(d.balance)+'. Payment due: '+(d.due||'please confirm with AMC')+'. Please see the attached PDF invoice for your shipment details and payment instructions. Thank you for choosing AMC Shopping!';
window.HenryInvoicePDF={source,build,makeFile,download,phone,message,dayPlus,money};
})();
