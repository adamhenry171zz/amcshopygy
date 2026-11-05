// Presentation-only finance summaries. Source: authenticated HENRY OS records.
// NEVER infer cash received from a due date, active membership, or supplier estimate.
(function (target) {
  'use strict';
  const isDate = value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))) return false;
    const d=new Date(value+'T12:00:00Z');
    return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value;
  };
  const plusDays = (day, delta) => {
    if(!isDate(day))return '';
    const d=new Date(day+'T12:00:00Z');
    d.setUTCDate(d.getUTCDate()+delta);
    return d.toISOString().slice(0,10);
  };
  const number = value => {
    const n=Number(String(value??'').replace(/,/g,'').trim());
    return Number.isFinite(n)&&n>0?n:0;
  };
  const moneySum = rows => Math.round(rows.reduce((sum,item)=>sum+Math.round(number(item.amountGyd??item.amount)*100),0))/100;
  const summarize = data => {
    const today=data.asOf;
    if(!isDate(today)) throw new Error('Invalid reporting date');
    const weekday=new Date(today+'T12:00:00Z').getUTCDay();
    const weekStart=plusDays(today,-((weekday+6)%7)); // Guyana calendar, Monday start
    const weekEnd=plusDays(weekStart,6);
    const month=today.slice(0,7);
    const activeStreaming=(data.streaming||[]).filter(x=>
      !['paused','cancelled','inactive'].includes(String(x.status||'').toLowerCase()));
    const expected=activeStreaming.filter(x=>isDate(x.dueDate)&&number(x.amount)>0);
    const between=(v,start,end)=>isDate(v)&&v>=start&&v<=end;
    const expectedValue=(start,end)=>moneySum(expected.filter(x=>between(x.dueDate,start,end)));
    // A recorded and verified *historic* receipt is not a post-go-live cash inflow.
    const verified=(data.receipts||[]).filter(r=>r.status==='verified');
    const newCash=verified.filter(r=>r.historical!==true&&isDate(r.receivedDate));
    const calc=(start,end,type='')=>moneySum(newCash.filter(r=>
      between(r.receivedDate,start,end)&&(!type||r.relatedType===type)));
    const verifiedMember=verified.filter(r=>r.relatedType==='membership');
    const historicalMember=verifiedMember.filter(r=>r.historical===true);
    const legacy=(data.legacyPayments||[]).filter(p=>
      ['verified','paid'].includes(String(p.status||'').toLowerCase()));
    return {
      today,weekStart,weekEnd,month,
      expectedToday:expectedValue(today,today),
      expectedNext7:expectedValue(today,plusDays(today,6)),
      expectedCalendarWeek:expectedValue(weekStart,weekEnd),
      expectedMonth:moneySum(expected.filter(s=>s.dueDate.slice(0,7)===month)),
      expectedSubscriptionsToday:expected.filter(s=>s.dueDate===today).length,
      missingStreamingAmounts:activeStreaming.filter(s=>isDate(s.dueDate)&&number(s.amount)===0).length,
      missingStreamingDates:activeStreaming.filter(s=>!isDate(s.dueDate)).length,
      receivedToday:calc(today,today),receivedWeek:calc(weekStart,weekEnd),
      receivedMonth:moneySum(newCash.filter(r=>r.receivedDate.slice(0,7)===month)),
      memberReceivedToday:calc(today,today,'membership'),
      memberReceivedWeek:calc(weekStart,weekEnd,'membership'),
      memberReceivedMonth:moneySum(newCash.filter(r=>r.relatedType==='membership'&&r.receivedDate.slice(0,7)===month)),
      memberReceivedAll:moneySum(verifiedMember.filter(r=>r.historical!==true)),
      streamingReceivedMonth:moneySum(newCash.filter(r=>r.relatedType==='streaming'&&r.receivedDate.slice(0,7)===month)),
      unallocatedReceivedMonth:moneySum(newCash.filter(r=>r.relatedType==='unallocated'&&r.receivedDate.slice(0,7)===month)),
      historicalMemberVerified:moneySum(historicalMember),
      legacyVerifiedAmount:moneySum(legacy),
      legacyVerifiedCount:legacy.length,
      historicalMemberCount:historicalMember.length,
      legacyMemberCount:(data.legacyMembers||[]).length,
      newMembershipCount:(data.memberships||[]).length
    };
  };
  target.HenryFinanceReport={summarize,isDate,plusDays,number,moneySum};
})(globalThis);
