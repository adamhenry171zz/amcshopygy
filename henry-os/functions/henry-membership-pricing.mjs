// Permanent AMC Members Club shipping allowance and overage rules.
// This module is private: copied into Netlify functions during deployment.
export const MEMBER_RATE_GYD=950;
export const PLANS={
 starter:{id:'starter',name:'Starter',fee:5000,allowanceLb:20},
 small_business:{id:'small_business',name:'Small Business',fee:10000,allowanceLb:50},
 business_pro:{id:'business_pro',name:'Business Pro',fee:15000,allowanceLb:100},
 enterprise:{id:'enterprise',name:'Enterprise',fee:30000,allowanceLb:220}
};
export const round2=v=>Math.round((Number(v)||0)*100)/100;
export const round4=v=>Math.round((Number(v)||0)*10000)/10000;
const num=v=>Number(String(v??'').replace(/,/g,''))||0;
export const norm=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
export function isMemberInvoice(i){return i?.invoiceSnapshot?.customerType==='member'||/^MC\d+/i.test(String(i?.invoiceNo||''))||/^Members Club Shipping Invoice/i.test(String(i?.description||''))}
export function invoiceDate(i){const direct=String(i?.invoiceDate||'');if(/^\d{4}-\d{2}-\d{2}$/.test(direct))return direct;return String(i?.notes||'').match(/Invoice date:\s*(\d{4}-\d{2}-\d{2})/)?.[1]||String(i?.createdAt||'').slice(0,10)}
export function invoiceWeight(i){const direct=num(i?.invoiceSnapshot?.calculation?.weight??i?.shipmentWeight);if(direct>0)return round4(direct);return round4(num(String(i?.description||'').match(/([\d.]+)\s*lb\b/)?.[1]||String(i?.notes||'').match(/Combined weight:\s*([\d.]+)\s*lb\b/)?.[1]))}
export function matchesMember(i,m){const a=norm(i?.invoiceSnapshot?.mailboxCode||i?.mailboxCode||String(i?.notes||'').match(/Mailbox:\s*(AMC\d+)/i)?.[1]),b=norm(m?.mailboxCode);if(a&&b)return a===b;const x=norm(i?.customer),y=norm(m?.customer);return x===y||(b==='amc203'&&['leah casimir','leah casimero'].includes(x))}
export function memberForCustomer(c,members){
 const mailbox=norm(c.mailboxCode),name=norm(c.name);
 const matches=members.filter(m=>{
  if(String(m.status||'active')!=='active')return false;
  if(mailbox&&norm(m.mailboxCode))return norm(m.mailboxCode)===mailbox;
  return norm(m.customer)===name||(mailbox==='amc203'&&norm(m.mailboxCode)==='amc203');
 });
 return matches.length===1?matches[0]:null;
}
export function approvedCreditLb(credits,member,month){return round4(credits.filter(c=>c.memberId===member.id&&c.month===month&&c.type==='missed_shipment'&&c.approvedByOwner===true).reduce((sum,c)=>sum+num(c.pounds),0))}
export function usageBefore(invoices,member,month,excludeIds=new Set()){const seen=new Set();let used=0;for(const i of invoices){if(String(i.status).toLowerCase()==='cancelled'||!isMemberInvoice(i)||invoiceDate(i).slice(0,7)!==month||!matchesMember(i,member)||excludeIds.has(i.id))continue;const key=norm(i.invoiceNo)||i.id;if(seen.has(key))continue;seen.add(key);used+=invoiceWeight(i)}return round4(used)}
// Regular overage is charged per pound at the published regular tier for the
// combined shipment's weight. It does not trigger the separate 1-2 lb minimum.
export function regularPerLb(weight){return weight>=100?1050:weight>55?1100:weight>25?1200:weight>10?1300:1500}
export function applyQuota(calc,member,usedBefore,bonusLb=0){
 const weight=round4(calc.weight),allowanceLb=round4(num(member.allowanceLb||PLANS[member.planId]?.allowanceLb)+bonusLb),remainingBefore=round4(Math.max(0,allowanceLb-usedBefore));
 const memberLb=round4(Math.min(weight,remainingBefore)),excessLb=round4(Math.max(0,weight-memberLb));
 const normalRate=regularPerLb(weight),memberCharge=round2(memberLb*MEMBER_RATE_GYD),overageCharge=round2(excessLb*normalRate);
 const shipping=round2(memberCharge+overageCharge),adjustment=round2(calc.adjustment),total=round2(shipping+adjustment);
 return {...calc,member:true,rate:MEMBER_RATE_GYD,rateLabel:excessLb>0?'Members Club within quota + regular rate on excess':'GYD $950/lb · Members Club',memberLb,excessLb,memberCharge,overageCharge,regularOverageRate:normalRate,allowanceLb,usedBeforeLb:round4(usedBefore),remainingBeforeLb:remainingBefore,usedThroughLb:round4(usedBefore+weight),remainingLb:round4(Math.max(0,allowanceLb-usedBefore-weight)),shipping,total};
}
