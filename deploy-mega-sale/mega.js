
(()=>{'use strict';
const START=Date.parse('2026-11-27T18:00:00-04:00');
const END=Date.parse('2026-11-27T22:00:00-04:00');
const WA='https://wa.me/5926042826?text=';
let serverOffset=0,latestPhase='';
const money=n=>'GYD $'+Number(n).toLocaleString('en-US');
const phaseAt=now=>now<START?'upcoming':now<END?'active':'ended';
function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor(s/60)%60).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
const planData=[['Starter',5000],['Small Business',10000],['Business Pro',15000],['Enterprise',30000]];
function syncMemberCards(phase){
 const cards=[...document.querySelectorAll('.plan-grid .plan-card')];
 for(const card of cards){
  const name=card.querySelector('small')?.textContent?.trim();
  const plan=planData.find(p=>p[0]===name);
  const price=card.querySelector('.plan-price'),link=card.querySelector('a.btn');
  if(!plan||!price||!link)continue;
  if(!price.dataset.megaNormalMarkup)price.dataset.megaNormalMarkup=price.innerHTML;
  if(!link.dataset.megaNormalHref)link.dataset.megaNormalHref=link.href;
  if(!link.dataset.megaNormalText)link.dataset.megaNormalText=link.textContent;
  const note=card.querySelector('.amc-mega-mem-note');
  if(phase==='active'){
   price.innerHTML='<span class="amc-mega-price-inline">'+money(plan[1]).replace('GYD ','')+'</span><span class="amc-mega-price-current">'+money(plan[1]/2).replace('GYD ','')+'</span>';
   if(!note){const el=document.createElement('span');el.className='amc-mega-mem-note';el.textContent='BLACK FRIDAY • First month only • 50% OFF';price.insertAdjacentElement('afterend',el);}
   link.href=WA+encodeURIComponent('Hello AMC Shopping, I want to claim the November 27 Black Friday 50% off the '+plan[0]+' membership. My first month is '+money(plan[1]/2)+' and the normal renewal is '+money(plan[1])+'. Please confirm my eligibility and payment instructions. I understand payment must be made before 10 PM Guyana time.');
   link.textContent='Claim half-price month →';
  }else{
   price.innerHTML=price.dataset.megaNormalMarkup;
   note?.remove();
   link.href=link.dataset.megaNormalHref;
   link.textContent=link.dataset.megaNormalText;
  }
 }
}
function render(){
 const now=Date.now()+serverOffset,phase=phaseAt(now);
 const target=phase==='upcoming'?START:END;
 document.querySelectorAll('[data-mega-clock]').forEach(n=>n.textContent=phase==='ended'?'00:00:00':fmt(target-now));
 document.querySelectorAll('[data-mega-status]').forEach(n=>n.textContent=phase==='upcoming'?'THE SALE STARTS IN':phase==='active'?'FLASH SALE ENDS IN':'THE FLASH SALE HAS ENDED');
 document.querySelectorAll('[data-mega-phase-note]').forEach(n=>n.textContent=phase==='upcoming'?'Doors open at 6:00 PM Guyana time':phase==='active'?'Live now · Claims close at 10:00 PM':'Ended November 27 at 10:00 PM GYT');
 document.querySelectorAll('[data-mega-ended]').forEach(n=>n.hidden=phase!=='ended');
 document.querySelectorAll('[data-mega-hide-after]').forEach(n=>n.hidden=phase==='ended');
 document.querySelectorAll('[data-mega-claim]').forEach(link=>{
  if(!link.dataset.megaHref)link.dataset.megaHref=link.getAttribute('href')||'';
  if(!link.dataset.megaText)link.dataset.megaText=link.textContent;
  if(phase==='active'){link.setAttribute('href',link.dataset.megaHref);link.removeAttribute('aria-disabled');link.textContent=link.dataset.megaText;}
  else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.textContent=phase==='upcoming'?'Opens at 6:00 PM':'Sale ended';}
 });
 if(phase!==latestPhase){syncMemberCards(phase);latestPhase=phase;}
}
async function syncServer(){
 try{
  const response=await fetch('/.netlify/functions/mega-sale-status',{cache:'no-store'});
  if(!response.ok)throw Error('Clock unavailable');
  const data=await response.json();
  if(typeof data.serverNow==='number')serverOffset=data.serverNow-Date.now();
 }catch(e){/* Local timer is display-only; AMC verifies payment time manually. */}
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
function init(){render();syncServer();setInterval(render,1000);setInterval(syncServer,60000);}
})();
