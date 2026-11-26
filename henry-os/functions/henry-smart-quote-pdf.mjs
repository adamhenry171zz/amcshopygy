import zlib from 'node:zlib';
import {AMC_INVOICE_LOGO_PNG_BASE64} from './henry-tax-logo.mjs';
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
 const base=[10,28,53]; 
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


// Premium Blue quotation template, adapted from AMC's November 26 sample.
// This renderer consumes the approved snapshot only; it never calls AI or recalculates the quote.
export function renderQuotePdf(q){
 if(!q?.totals||!q?.delivery||!q.items?.length||!['approved','sent','deposit_paid','ordered','arrived','paid'].includes(q.status))throw Error('Approve the quotation before generating a PDF.');
 const H=841.89,W=595.28,L=18,R=W-18,TW=R-L,navy='0.039 0.110 0.208',blue='0.043 0.49 0.84',cyan='0.05 0.75 0.83',red='0.87 0.15 0.22',white='1 1 1',pale='0.925 0.953 0.984',gray='0.31 0.38 0.47';
 const date=s=>new Date(String(s).slice(0,10)+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 const usd=n=>'$'+Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),gyd=n=>'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
 const store=q.retailer||'SHEIN',t=q.totals,d=q.delivery,pages=[];
 let ops=[],y=0;
 const box=(x,top,w,h,c)=>ops.push(c+' rg '+x+' '+(H-top-h)+' '+w+' '+h+' re f');
 const line=(x1,top,x2,c=cyan)=>ops.push(c+' RG .6 w '+x1+' '+(H-top)+' m '+x2+' '+(H-top)+' l S');
 const txt=(x,top,s,size=10,bold=false,c=navy)=>ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+c+' rg 1 0 0 1 '+x+' '+(H-top)+' Tm ('+esc(s)+') Tj ET');
 // Conservative width estimate for Helvetica, used only to align compact amounts/labels.
 const width=(s,size,bold=false)=>ascii(s).split('').reduce((a,c)=>a+(' ilI.,:!|'.includes(c)?.27:'MW@%'.includes(c)?.9:'0123456789'.includes(c)?.556:'.-'.includes(c)?.33:bold?.61:.55),0)*size;
 const right=(x,top,s,size=9,bold=false,c=navy)=>txt(x-width(s,size,bold),top,s,size,bold,c);
 const center=(x,top,s,size=10,bold=false,c=navy)=>txt(x-width(s,size,bold)/2,top,s,size,bold,c);
 const shorten=(s,n)=>ascii(s).length>n?ascii(s).slice(0,n-3)+'...':ascii(s);
 const tableHead=()=>{box(L,y,TW,20,navy);txt(L+8,y+13,'#',8,true,white);txt(L+28,y+13,'PRODUCT / SELECTED VARIATION',8,true,white);right(R-94,y+13,'USD TOTAL',8,true,white);right(R-9,y+13,'GYD*',8,true,white);y+=20};
 function newPage(){
  ops=[];pages.push(ops);box(L,12,TW,84,navy);box(L,91,TW,5,cyan);
  ops.push('q 94 0 0 67.56 '+(L+9)+' '+(H-85)+' cm /Logo Do Q');
  txt(L+120,47,'A.M.C SHOPPING',22,true,white);
  txt(L+120,62,'CUSTOMER QUOTATION | '+store.toUpperCase(),10,false,white);
  txt(L+120,78,'Quote date: '+date(q.approvedAt||q.updatedAt)+' | Ref: '+q.reference,9,false,white);
  y=110;
 }
 newPage();
 const a=TW*.29,b=TW*.23;box(L,y,a,54,pale);box(L+a+1,y,b-1,54,pale);box(L+a+b+1,y,TW-a-b-1,54,pale);
 txt(L+8,y+13,'CUSTOMER',8,true);txt(L+8,y+28,shorten(q.name,25),10,true);txt(L+8,y+41,shorten(q.whatsapp,27),8,false,gray);
 txt(L+a+9,y+13,'SHOPPING SOURCE',8,true);txt(L+a+9,y+28,store,10,true);txt(L+a+9,y+41,q.items.length+' rows | Qty '+q.items.reduce((n,i)=>n+i.qty,0),8,false,gray);
 txt(L+a+b+9,y+13,'SCHEDULED ORDER',8,true);txt(L+a+b+9,y+28,'Tuesday, '+date(d.orderTuesday),10,true);txt(L+a+b+9,y+41,'Upon confirmed payment',8,false,gray);y+=64;
 box(L,y,TW,56,navy);center(W/2,y+16,'ESTIMATED ARRIVAL',10,true,white);center(W/2,y+33,(date(d.arrivalFrom)+' - '+date(d.arrivalTo)).toUpperCase(),14,true,white);center(W/2,y+46,(store==='Amazon'?'7-14':'14-21')+' days after Tuesday placement. Estimates are not guaranteed.',8,false,white);y+=76;
 txt(L,y,'PAYMENT SUMMARY',11,true);y+=8;const cw=TW/3;
 for(const [i,label,val,fill,col] of [[0,'OVERALL COST',t.overall,blue,white],[1,'DOWN-PAYMENT',t.down,pale,navy],[2,'BALANCE ON ARRIVAL',t.balance,red,white]]){box(L+i*cw,y,cw-1,60,fill);center(L+(i+.5)*cw,y+19,label,8,true,col);const value='GYD '+gyd(val);center(L+(i+.5)*cw,y+40,value,value.length>16?13:17,true,col)}
 y+=78;txt(L,y,'ITEMIZED PRODUCTS',11,true);y+=8;tableHead();
 for(let i=0;i<q.items.length;i++){
  const item=q.items[i],names=wrap(item.name,51),variant=wrap([item.color,item.size,'Qty '+item.qty+' x '+usd(item.price)].filter(Boolean).join(' / '),62);
  const h=Math.max(30,10+names.length*11+variant.length*10);
  if(y+h>H-42){newPage();txt(L,y,'ITEMIZED PRODUCTS (CONTINUED)',11,true);y+=9;tableHead()}
  box(L,y,TW,h,i%2?pale:white);
  txt(L+8,y+13,String(i+1),8,false);
  names.forEach((s,j)=>txt(L+28,y+12+j*11,s,9,true));
  variant.forEach((s,j)=>txt(L+28,y+12+names.length*11+j*10,s,8,false,gray));
  right(R-94,y+13,usd(item.price*item.qty),9);right(R-9,y+13,gyd(Math.ceil(Math.round(item.price*100)*item.qty*360/10000)*100),9);
  y+=h;line(L,y,R,'0.82 0.87 0.93');
 }
 const feeRows=[['ITEM SUBTOTAL',usd(t.subtotalUsd),''],...(t.feesUsd?[['SUPPLIER CHECKOUT FEES',usd(t.feesUsd),'']]:[]),...(t.heavyShippingGyd?[['HEAVY-ITEM FREIGHT','',gyd(t.heavyShippingGyd)]]:[]),...(t.extraGyd?[['OTHER APPROVED CHARGES','',gyd(t.extraGyd)]]:[])];
 const footSpace=feeRows.length*19+204;
 if(y+footSpace>H-40){newPage();txt(L,y,'QUOTATION SUMMARY',11,true);y+=13;}
 for(const [label,u,g] of feeRows){box(L,y,TW,19,pale);txt(L+28,y+13,label,8,true);right(R-94,y+13,u,9);right(R-9,y+13,g,9);y+=19}
 y+=10;txt(L,y,'* Per-item GYD figures are indicative; the approved overall is rounded up once.',8,false,gray);y+=12;
 box(L,y,TW*.48,68,pale);box(L+TW*.48+1,y,TW*.52-1,68,pale);
 txt(L+8,y+13,'HOW TO PAY',9,true);txt(L+8,y+26,'MMG: +592 604 2826',9);txt(L+8,y+39,'Account name: Adam Henry',9);txt(L+8,y+52,'Send payment confirmation before ordering.',8);
 const nx=L+TW*.48+9;txt(nx,y+13,'ORDER & PRICE NOTES',9,true);txt(nx,y+26,'Down-payment: '+usd(t.totalUsd)+' x GYD $240 (rounded up).',8);txt(nx,y+39,'Prices and availability confirmed at checkout.',8);txt(nx,y+52,'Additional freight may apply on final weight.',8);y+=84;
 txt(L,y,'TERMS & CONDITIONS',10,true);y+=13;
 const terms='Quotation valid for 7 days, subject to stock and price changes. Confirm product details before purchase. Down-payment is non-refundable after order placement. Additional freight may apply once final weight is confirmed. Arrival may change due to supplier dispatch, customs, freight or weather delays.';
 for(const s of wrap(terms,113)){txt(L,y,s,8);y+=10}
 y+=8;box(L,y,TW,29,red);center(W/2,y+19,'AMOUNT DUE ON ARRIVAL: GYD '+gyd(t.balance),11,true,white);
 // Append consistent footer to all pages.
 for(let i=0;i<pages.length;i++){ops=pages[i];line(L,H-25,R);txt(L,H-13,'A.M.C Shopping | amcshopping.com',8,false,gray);right(R,H-13,'Page '+(i+1)+' / '+pages.length,8,false,gray)}
 const logo=invoiceLogo(),objects=[null],add=o=>(objects.push(o),objects.length-1);
 const font=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),fontBold=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const im=add('<< /Type /XObject /Subtype /Image /Width '+logo.width+' /Height '+logo.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length '+logo.bytes.length+' >>\nstream\n'+logo.bytes.toString('latin1')+'\nendstream');
 const pagesRef=add(''),refs=[];
 for(const p of pages){const commands=p.join('\n'),streamId=add('<< /Length '+Buffer.byteLength(commands,'latin1')+' >>\nstream\n'+commands+'\nendstream');
 refs.push(add('<< /Type /Page /Parent '+pagesRef+' 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 '+font+' 0 R /F2 '+fontBold+' 0 R >> /XObject << /Logo '+im+' 0 R >> >> /Contents '+streamId+' 0 R >>')+' 0 R')}
 objects[pagesRef]='<< /Type /Pages /Kids ['+refs.join(' ')+'] /Count '+refs.length+' >>';const catalog=add('<< /Type /Catalog /Pages '+pagesRef+' 0 R >>');
 let doc='%PDF-1.4\n%AMC\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets.push(Buffer.byteLength(doc,'latin1'));doc+=i+' 0 obj\n'+objects[i]+'\nendobj\n'}
 const start=Buffer.byteLength(doc,'latin1');doc+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';for(let i=1;i<objects.length;i++)doc+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
 doc+='trailer\n<< /Size '+objects.length+' /Root '+catalog+' 0 R >>\nstartxref\n'+start+'\n%%EOF';return Buffer.from(doc,'latin1');
}
