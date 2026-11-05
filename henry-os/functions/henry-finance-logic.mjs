// Pure Phase 1 financial calculations. No credentials, storage or side effects.
export const isoDate = value => {
  const v=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return '';
  const d=new Date(v+'T12:00:00Z');
  return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==v?'':v;
};
export const guyanaToday = (now=new Date()) => {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  return ['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-');
};
export const toCents = input => {
  const text=String(input??'').trim().replace(/,/g,'');
  if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(text))throw new Error('Enter a valid non-negative amount (at most two decimal places).');
  const [whole,dec='']=text.split('.');
  const result=Number(whole)*100+Number(dec.padEnd(2,'0'));
  if(!Number.isSafeInteger(result)||result>1000000000000)throw new Error('Amount exceeds supported limit.');
  return result;
};
export const fromCents = cents => (Math.round(cents)/100).toFixed(2);
export const addMonthsClamped = (value,months) => {
  if(!isoDate(value)||!Number.isInteger(months)||months<0||months>240)throw new Error('Invalid membership period.');
  const [y,m,d]=value.split('-').map(Number);
  const first=new Date(Date.UTC(y,m-1+months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);
};
export const calculateMembership = (member,receipts,asOf=guyanaToday()) => {
  const relevant=receipts.filter(r=>r.status==='verified'&&r.relatedType==='membership'&&r.membershipId===member.id)
    .filter(r=>isoDate(r.receivedDate)&&Number.isInteger(Number(r.months))&&Number(r.months)>0)
    .sort((a,b)=>String(a.receivedDate).localeCompare(String(b.receivedDate))||String(a.verifiedAt||a.createdAt||'').localeCompare(String(b.verifiedAt||b.createdAt||''))||String(a.id).localeCompare(String(b.id)));
  let anchor='',paidThrough='',termMonths=0;
  for(const r of relevant){
    if(!paidThrough||r.receivedDate>=paidThrough){anchor=r.receivedDate;termMonths=Number(r.months);}
    else termMonths+=Number(r.months);
    paidThrough=addMonthsClamped(anchor,termMonths);
  }
  const status=!paidThrough?'needs_review':paidThrough>asOf?'active':'expired';
  return {...member,paidThrough,status,verifiedPaymentCount:relevant.length};
};
export const nextExpectedBills = (supplier,asOf=guyanaToday(),limit=6) => {
  if(supplier.status!=='active'||!isoDate(supplier.firstDueDate))return [];
  const cycle=supplier.recurrence==='monthly'?'monthly':'one_time';
  const days=[];
  for(let i=0;i<(cycle==='monthly'?240:1)&&days.length<limit;i++){
    const due=addMonthsClamped(supplier.firstDueDate,i);
    if(due>=asOf)days.push(due);
  }
  return days;
};
export const validLinkId = value => /^[a-zA-Z0-9_-]{1,100}$/.test(String(value||''));
