// Pure private pricing calculations — no public website price publishing.
const num=(v,max=100000000)=>{const n=Number(v);return v!==''&&v!==null&&v!==undefined&&Number.isFinite(n)&&n>=0&&n<=max?n:null};
const ceil100=n=>Math.ceil((n-1e-9)/100)*100;
const TIER_RULES=Object.freeze([
 {key:'three',min:3,max:5,discount:.07,margin:.25,minProfit:2500},
 {key:'six',min:6,max:11,discount:.10,margin:.22,minProfit:2500},
 {key:'twelve',min:12,max:null,discount:.14,margin:.21,minProfit:2500}
]);
export const DEFAULT_RULES={retailTargetMargin:.31,retailMinProfit:3000,depositPercent:.7};
export const calcTier=(retail,landed,rule)=>{
 if(!(retail>0&&landed>0))return null;
 // A true wholesale price must be lower than retail while maintaining BOTH safeguards.
 const minViable=ceil100(Math.max(landed/(1-rule.margin),landed+rule.minProfit));
 const target=ceil100(Math.max(retail*(1-rule.discount),minViable));
 if(target>=retail)return {price:null,eligible:false,reason:'No profitable discount at current retail price'};
 return{price:target,eligible:true,grossProfit:target-landed,margin:(target-landed)/target,discount:(retail-target)/retail};
};
export function calculateFragrance(seed,record={}){
 const mode=record.landedMode||'verified_total';
 const tier=record.supplierTier||'base';
 const supplierUsd=tier==='usd350'?seed.supplierTiers?.usd350:
  tier==='usd500'?seed.supplierTiers?.usd500:
  tier==='usd1000'?seed.supplierTiers?.usd1000:
  tier==='usd1500'?seed.supplierTiers?.usd1500:seed.supplierUsd;
 const fx=num(record.exchangeRate,1000);
 const values=['supplierShippingGyd','forwarderFreightGyd','importFeesGyd','insuranceGyd','packagingGyd','otherDirectGyd']
   .map(k=>num(record[k],10000000));
 const componentsReady=!!(fx>0&&supplierUsd>0&&values.every(v=>v!==null)&&record.chargesConfirmed===true&&
   (tier==='base'||record.supplierTierVerified===true));
 const componentTotal=componentsReady?ceil100(supplierUsd*fx+values.reduce((a,b)=>a+b,0)):null;
 const manual=num(record.verifiedLandedGyd,10000000);
 const landed=record.costVerified===true?
   mode==='components'?componentTotal:manual&&manual>0?manual:null:null;
 const adjustedLanded=landed&&landed>0?landed:null;
 const enteredRetail=num(record.retailGyd,10000000);
 const retail=adjustedLanded?(enteredRetail&&enteredRetail>0?enteredRetail:
   ceil100(Math.max(adjustedLanded/(1-DEFAULT_RULES.retailTargetMargin),
    adjustedLanded+DEFAULT_RULES.retailMinProfit))):null;
 const retailProfit=retail&&adjustedLanded?retail-adjustedLanded:null;
 const retailMargin=retail&&retailProfit!==null?retailProfit/retail:null;
 const tiers=Object.fromEntries(TIER_RULES.map(rule=>[rule.key,record.wholesaleEligible===true?
  calcTier(retail,adjustedLanded,rule):null]));
 const hasMargin=retail&&retailMargin>=.21;
 const eligible=record.wholesaleEligible===true&&adjustedLanded!==null&&!!hasMargin&&tiers.three?.eligible===true;
 const warnings=[];
 if(record.costVerified!==true)warnings.push('Landed costs unverified');
 if(mode==='components'&&!componentsReady)warnings.push('Complete FX, supplier tier and freight cost confirmations');
 if(record.wholesaleEligible===true&&!adjustedLanded)warnings.push('Wholesale pending landed-cost verification');
 if(adjustedLanded!==null&&retailMargin<.21)warnings.push('Retail margin is under 21%');
 if(tiers&&Object.values(tiers).some(t=>t&&t.eligible===false))warnings.push('At least one wholesale tier needs a higher retail price');
 if(record.photoApproved!==true)warnings.push('Approved commercial-use photo missing');
 return {supplierUsd,landedGyd:adjustedLanded,componentEstimateGyd:componentTotal,
  retailGyd:retail,retailGrossProfit:retailProfit,retailMargin,
  wholesale:tiers,wholesaleReady:eligible,
  available:Math.max(0,(num(record.stockOnHand,100000)||0)-(num(record.stockReserved,100000)||0)),
  preorderDepositPerBottle:retail?ceil100(Math.min(retail,Math.max(retail*.7,num(record.upfrontCommitmentGyd,10000000)||0))):null,
  warnings};
}
export const PRICE_RULES=TIER_RULES;
