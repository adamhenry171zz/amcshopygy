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
  // A CALENDAR-MONTH CASH RECEIPTS VIEW, not an accounting ledger or income statement.
  // It consolidates the two existing payment stores by actual received date. Neither
  // a membership profile nor a streaming due date proves that cash was collected.
  const monthlyCollected = data => {
    const today=data.asOf;
    if(!isDate(today))throw new Error('Invalid reporting date');
    const month=today.slice(0,7);
    const normalizeRef=v=>String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    const records=[
      ...(data.legacyPayments||[]).filter(p=>String(p.status||'').toLowerCase()==='verified').map(p=>({
        source:'legacy',amount:p.amount,date:String(p.paymentDate||'').slice(0,10),reference:p.reference,
        historical:true
      })),
      ...(data.receipts||[]).filter(p=>p.status==='verified').map(p=>({
        source:'finance',amount:p.amountGyd,date:String(p.receivedDate||'').slice(0,10),reference:p.reference,
        historical:p.historical===true
      }))
    ];
    const groups=new Map();
    let excludedNoReference=0,excludedInvalid=0;
    for(const record of records){
      // An old free-text reference may be missing or generic. It cannot
      // safely be deduplicated, so withhold it for manual review.
      const reference=normalizeRef(record.reference);
      const amount=number(record.amount),cents=Math.round(amount*100);
      if(!isDate(record.date)){excludedInvalid++;continue}
      if(!Number.isSafeInteger(cents)||cents<=0){if(record.date.slice(0,7)===month&&record.date<=today)excludedInvalid++;continue}
      if(reference.length<4||['CASH','NONE','UNKNOWN','NORECEIPT','NOREF','NA','MMG','BANK'].includes(reference)){
        if(record.date.slice(0,7)===month&&record.date<=today)excludedNoReference++;
        continue;
      }
      if(!groups.has(reference))groups.set(reference,[]);
      groups.get(reference).push({...record,amountCents:cents,reference});
    }
    let totalCents=0,legacyCents=0,financeCents=0,overlapCents=0,historicalCents=0;
    let distinctTransactions=0,duplicateRecords=0,conflictingReferences=0,conflictingRecords=0,excludedFuture=0;
    for(const group of groups.values()){
      const amounts=new Set(group.map(r=>r.amountCents));
      const dates=new Set(group.map(r=>r.date));
      // Never choose an arbitrary amount/date if two registers disagree.
      if(amounts.size!==1||dates.size!==1){
        if(group.some(r=>r.date.slice(0,7)===month&&r.date<=today)){
          conflictingReferences++;conflictingRecords+=group.length;
        }
        continue;
      }
      const entry=group[0];
      if(entry.date.slice(0,7)!==month)continue;
      if(entry.date>today){excludedFuture++;continue}
      distinctTransactions++;
      duplicateRecords+=group.length-1;
      totalCents+=entry.amountCents;
      if(group.some(r=>r.source==='legacy')&&group.some(r=>r.source==='finance'))overlapCents+=entry.amountCents;
      else if(group.some(r=>r.source==='legacy'))legacyCents+=entry.amountCents;
      else financeCents+=entry.amountCents;
      if(group.every(r=>r.historical))historicalCents+=entry.amountCents;
    }
    const gyd=cents=>Math.round(cents)/100;
    const needsReview=excludedNoReference+excludedInvalid+conflictingRecords;
    return {
      month,today,total:gyd(totalCents),
      legacyOnly:gyd(legacyCents),financeOnly:gyd(financeCents),
      duplicatesAcrossRegisters:gyd(overlapCents),historicalIncluded:gyd(historicalCents),
      distinctTransactions,duplicateRecords,conflictingReferences,
      excludedNoReference,excludedInvalid,excludedFuture,needsReview,
      completeFromRecordedSources:needsReview===0,
      sourceCount:records.length
    };
  };
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
  target.HenryFinanceReport={summarize,monthlyCollected,isDate,plusDays,number,moneySum};
})(globalThis);
