import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(site))throw Error('Site directory not found');
const assets=path.join(site,'assets');fs.mkdirSync(assets,{recursive:true});
const css=String.raw`
.amc-bf[hidden],.amc-bf-open[hidden],.amc-bf-closed[hidden]{display:none!important}
.amc-bf{font-family:inherit;color:#fff;box-sizing:border-box}
.amc-bf *{box-sizing:border-box}
.amc-bf a{color:inherit}
.amc-bf-hero{margin:0 auto 28px;padding:20px max(16px,calc((100% - 1180px)/2));background:#08090d}
.amc-bf-stage{position:relative;overflow:hidden;isolation:isolate;border:1px solid #57482c;border-radius:24px;background:radial-gradient(ellipse at 83% 25%,#66302266 0%,transparent 48%),radial-gradient(ellipse at 12% 85%,#b0803333 0%,transparent 42%),linear-gradient(130deg,#101116,#050507 70%);padding:clamp(24px,5vw,64px);display:grid;grid-template-columns:1.16fr .84fr;gap:28px;align-items:center}
.amc-bf-stage:before{content:"";position:absolute;inset:0;z-index:-1;background:repeating-linear-gradient(135deg,transparent 0 60px,#ffffff04 60px 61px);pointer-events:none}
.amc-bf-kicker{display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#f7d58e}
.amc-bf-kicker:before{content:"";width:9px;height:9px;background:#ff614f;border-radius:50%;box-shadow:0 0 12px #ff614f}
.amc-bf-title{font-size:clamp(34px,6vw,76px);line-height:.94;letter-spacing:-.055em;margin:14px 0 18px;color:#fff;font-weight:950;text-transform:uppercase}
.amc-bf-title span{color:#f7d58e;display:block}
.amc-bf-lead{font-size:clamp(15px,1.7vw,20px);line-height:1.5;color:#e3dfd7;max-width:620px;margin:0 0 20px}
.amc-bf-qualifiers{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}
.amc-bf-qualifiers div{padding:13px 14px;border:1px solid #ffffff24;border-radius:11px;background:#ffffff09}
.amc-bf-qualifiers small{display:block;color:#c9c5bd;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px}
.amc-bf-qualifiers strong{display:block;font-size:23px;line-height:1.2;margin-top:3px;color:#fff}
.amc-bf-cta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:22px 0 0}
.amc-bf-btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none!important;padding:12px 18px;background:#f7d58e;color:#0b0b0d!important;font-weight:850;border:1px solid #f7d58e;border-radius:9px;min-height:45px}
.amc-bf-btn.secondary{background:transparent;color:#fff!important;border-color:#ffffff55}
.amc-bf-btn:hover{background:#fff;color:#111!important}
.amc-bf-prize{padding:24px 12px;text-align:center;border:1px solid #d8ab5b66;border-radius:22px;background:linear-gradient(145deg,#ffffff0c,#00000030);position:relative}
.amc-bf-prize .amc-bf-winners{display:inline-block;border-radius:999px;background:#f7d58e;color:#17110a;font-weight:900;font-size:12px;letter-spacing:1px;padding:7px 13px}
.amc-bf-prize .amc-bf-50{display:block;font-size:clamp(80px,13vw,172px);font-weight:950;line-height:.92;letter-spacing:-.095em;color:#f7d58e;margin:22px 0 5px}
.amc-bf-prize .amc-bf-off{display:block;color:#fff;font-size:clamp(24px,4vw,45px);font-weight:900;letter-spacing:.03em;line-height:1.1}
.amc-bf-prize p{font-size:14px;color:#dbd3c6;margin:14px 0 8px}
.amc-bf-date{display:flex;flex-wrap:wrap;gap:9px 14px;font-size:12px;color:#d6c4a1;margin-top:17px;line-height:1.5}
.amc-bf-count{font-variant-numeric:tabular-nums;font-size:14px;color:#fff;font-weight:750;display:block;margin:10px 0 0}
.amc-bf-strip{max-width:1180px;margin:16px auto 22px;padding:0 16px}
.amc-bf-strip-inner{display:flex;gap:14px;justify-content:space-between;align-items:center;background:linear-gradient(110deg,#0d0d13,#272017);border:1px solid #bd945c;border-radius:12px;padding:15px 18px;color:#fff}
.amc-bf-strip-copy{min-width:0;flex:1}
.amc-bf-strip-copy small{display:block;color:#f7d58e;font-weight:800;font-size:10px;letter-spacing:1.2px}
.amc-bf-strip-copy strong{display:block;font-size:clamp(17px,2.5vw,23px);line-height:1.2;margin:4px 0;color:#fff}
.amc-bf-strip-copy p{font-size:13px;color:#e1dbd1;margin:0;line-height:1.4}
.amc-bf-strip-inner .amc-bf-btn{flex-shrink:0;font-size:13px;padding:10px 14px}
.amc-bf-rules{max-width:1030px;margin:30px auto 50px;padding:0 20px;color:#18243a}
.amc-bf-rules h2{font-size:clamp(23px,4vw,34px);line-height:1.2;color:#18243a;margin:0 0 14px}
.amc-bf-rules p,.amc-bf-rules li{font-size:15px;line-height:1.7;color:#40506a}
.amc-bf-rules ol{padding-left:23px;margin:0 0 22px}
.amc-bf-rules li{padding:4px 0}
.amc-bf-rules .amc-bf-rulecard{background:#f8f9fc;border:1px solid #dce2e9;border-radius:16px;padding:22px;margin:15px 0}
.amc-bf-rules .amc-bf-rulecard strong{color:#17243b}
.amc-bf-closed{max-width:1000px;margin:30px auto;padding:30px 24px;background:#f7f8fa;border:1px solid #dce2e9;border-radius:16px;color:#17243b}
.amc-bf-closed h1{font-size:30px;color:#17243b;margin:0 0 12px}
.amc-bf-closed p{line-height:1.6}
@media(max-width:720px){.amc-bf-stage{grid-template-columns:1fr;padding:24px 18px;gap:22px;border-radius:16px}.amc-bf-title{font-size:43px}.amc-bf-prize{padding:24px 10px}.amc-bf-prize .amc-bf-50{font-size:112px}.amc-bf-hero{padding:12px}.amc-bf-strip-inner{align-items:flex-start;flex-direction:column;gap:12px}.amc-bf-strip-inner .amc-bf-btn{width:100%}.amc-bf-qualifiers strong{font-size:20px}.amc-bf-cta .amc-bf-btn{flex:1}}
@media(prefers-reduced-motion:no-preference){.amc-bf-btn{transition:background .18s,color .18s}}
`;
const js=String.raw`
(()=>{'use strict';
const start=Date.parse('2026-11-16T00:00:00-04:00'),end=Date.parse('2026-11-28T00:00:00-04:00'),draw=Date.parse('2026-11-28T19:30:00-04:00');
const nodes=[...document.querySelectorAll('[data-amc-bf]')];
function update(){const now=Date.now(),phase=now<start?'upcoming':now<end?'active':'closed';
for(const el of nodes){
 const dedicated=el.hasAttribute('data-bf-dedicated');
 el.hidden=phase==='closed'&&!dedicated;
 el.querySelectorAll('.amc-bf-open').forEach(n=>n.hidden=phase==='closed');
 el.querySelectorAll('.amc-bf-closed').forEach(n=>n.hidden=phase!=='closed');
 el.querySelectorAll('[data-bf-phase]').forEach(n=>n.textContent=phase==='upcoming'?'COMING NOVEMBER 16':'BLACK FRIDAY GIVEAWAY');
 el.querySelectorAll('[data-bf-count]').forEach(n=>{
 if(phase==='closed'){n.textContent='';return;}
 const remaining=Math.max(0,(phase==='upcoming'?start:end)-now),days=Math.floor(remaining/86400000),hours=Math.floor(remaining/3600000)%24,mins=Math.floor(remaining/60000)%60;
 n.textContent=(phase==='upcoming'?'Starts in ':'Entries close in ')+days+'d '+hours+'h '+mins+'m';
 });
 el.querySelectorAll('[data-bf-draw]').forEach(n=>n.textContent=now<draw?'Winner selection: November 28, 7:30 PM Guyana time.':'The scheduled draw has passed. Contact AMC Shopping for the results.');
 }
}
update();setInterval(update,30000);
})();
`;
fs.writeFileSync(path.join(assets,'amc-black-friday-2026.css'),css);
fs.writeFileSync(path.join(assets,'amc-black-friday-2026.js'),js);
const links='<link rel="stylesheet" href="/assets/amc-black-friday-2026.css"><script src="/assets/amc-black-friday-2026.js" defer></script>';
const qualifiers='<div class="amc-bf-qualifiers"><div><small>Regular customers</small><strong>20+ lb</strong></div><div><small>Members Club</small><strong>50+ lb</strong></div></div>';
const hero=(dedicated=false)=>'<section class="amc-bf amc-bf-hero" data-amc-bf'+(dedicated?' data-bf-dedicated':'')+' hidden aria-label="Black Friday shipping giveaway"><div class="amc-bf-stage amc-bf-open"><div><span class="amc-bf-kicker" data-bf-phase>COMING NOVEMBER 16</span><h'+(dedicated?'1':'2')+' class="amc-bf-title">BLACK FRIDAY <span>BIG SHIP. BIG WIN.</span></h'+(dedicated?'1':'2')+'><p class="amc-bf-lead">Five lucky customers will each win <strong>50% OFF shipping</strong> on one qualifying shipment. Shop more. Ship more. Save BIG!</p>'+qualifiers+'<div class="amc-bf-cta"><a class="amc-bf-btn" href="'+(dedicated?'/mailbox':'/black-friday')+'">'+(dedicated?'Get a free mailbox':'See how to qualify')+' &rarr;</a><a class="amc-bf-btn secondary" href="'+(dedicated?'/rates':'/mailbox')+'">'+(dedicated?'Check shipping rates':'Get a free mailbox')+'</a></div><div class="amc-bf-date"><span>Nov 16–27, 2026</span><span>LIVE TikTok draw · Nov 28 · 7:30 PM GYT</span></div><span class="amc-bf-count" data-bf-count></span></div><div class="amc-bf-prize"><span class="amc-bf-winners">5 WINNERS</span><strong class="amc-bf-50">50%</strong><span class="amc-bf-off">OFF SHIPPING</span><p>One qualifying shipment per winner.<br>Terms apply.</p></div></div>'+(dedicated?'<div class="amc-bf-closed" hidden><h1>Black Friday entries are closed.</h1><p data-bf-draw>Winner selection: November 28, 7:30 PM Guyana time.</p><p><a href="/announcement">View AMC announcements</a> or <a href="https://wa.me/5926042826">contact AMC Shopping</a>.</p></div>':'')+'</section>';
const strip=(copy)=>'<section class="amc-bf amc-bf-strip" data-amc-bf hidden aria-label="Black Friday shipping promotion"><div class="amc-bf-strip-inner"><div class="amc-bf-strip-copy"><small data-bf-phase>COMING NOVEMBER 16</small><strong>5 WINNERS. 50% OFF SHIPPING.</strong><p>'+copy+' Regular 20+ lb · Members 50+ lb · Nov 16–27.</p></div><a class="amc-bf-btn" href="/black-friday">See giveaway &rarr;</a></div></section>';
const rules='<section class="amc-bf-rules" aria-labelledby="amc-bf-rules-title"><h2 id="amc-bf-rules-title">How to qualify</h2><div class="amc-bf-rulecard"><p><strong>Campaign:</strong> November 16, 2026, 12:00 AM to November 27, 2026, 11:59 PM, Guyana time.</p><p><strong>Live selection:</strong> Saturday, November 28, 2026 at 7:30 PM Guyana time on TikTok. AMC will announce the live account on its official channels.</p></div><ol><li>Use your own AMC customer or mailbox identity and ship an eligible air-freight shipment with AMC during the campaign.</li><li>Regular customers qualify at 20 lb or more; active Members Club customers qualify at 50 lb or more. The verified combined weight of a single shipment is used, not estimated shopping-cart weights.</li><li>AMC must have confirmed the shipment and recorded its shipping invoice within the campaign period. Your account must be in good standing. Orders placed or packages merely delivered to the US warehouse do not automatically qualify.</li><li>One entry per qualifying customer, using the first qualifying shipping invoice in the campaign. Five distinct winners will be selected at random in a live TikTok draw, provided at least five eligible customers qualify.</li><li>Each winner receives 50% off the eligible standard shipping charge on that qualifying invoice. Separately assessed taxes, insurance, storage, delivery and special handling or oversized-item surcharges are excluded. The discount does not apply to product prices, membership fees, card-service orders, digital services or other non-shipping charges.</li><li>Any discount on an already-paid qualifying shipping invoice will be settled as an AMC shipping credit. No purchase of a separate giveaway ticket is required. Winners will be contacted using their recorded customer details; personal information will not be displayed publicly without consent.</li></ol><p><strong>Important:</strong> Shipping schedules are subject to airline operations and clearance. Shop early to avoid missing the qualification deadline. See the <a href="/rates">shipping rates</a> and <a href="/members">Members Club</a> information before shipping.</p><p>Questions? <a href="https://wa.me/5926042826">Message AMC Shopping on WhatsApp</a>.</p></section>';
const placements={'index.html':hero(),'mailbox.html':strip('Create your free mailbox and get ready to qualify.'),'rates.html':strip('Know your shipping rate, then ship to qualify.'),'tracking.html':strip('Track your shipment and check the giveaway rules.'),'members.html':strip('Members Club customers can qualify at 50 lb.'),'quote.html':strip('Eligible AMC air-freight shipments can qualify; card-service quotes are excluded.'),'delivery.html':strip('Check your eligible shipping invoice.'),'announcement.html':hero()};
for(const [name,fragment] of Object.entries(placements)){
 const file=path.join(site,name);if(!fs.existsSync(file))continue;
 let html=fs.readFileSync(file,'utf8');if(html.includes('data-amc-bf'))continue;
 html=html.replace(/<\/head>/i,()=>links+'\n</head>');
 if(/<main\b[^>]*>/i.test(html))html=html.replace(/<main\b[^>]*>/i,m=>m+'\n'+fragment);
 else html=html.replace(/<\/header>/i,m=>m+'\n'+fragment);
 fs.writeFileSync(file,html);
}
const index=fs.readFileSync(path.join(site,'index.html'),'utf8');
const main='<main>'+hero(true)+rules+'</main>';
let page=index.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,()=>main);
if(page===index)throw Error('Homepage main element missing');
page=page.replace(/<title>[\s\S]*?<\/title>/i,'<title>Black Friday Shipping Giveaway | AMC Shopping</title>');
page=page.replace(/<meta name="description" content="[^"]*"\s*\/?>/i,'<meta name="description" content="AMC Shopping Black Friday giveaway: five eligible customers win 50% off a qualifying shipping invoice. November 16–27, 2026.">');
page=page.replace(/<link[^>]+rel="canonical"[^>]*>/i,'<link rel="canonical" href="https://amcshopping.com/black-friday">');
fs.writeFileSync(path.join(site,'black-friday.html'),page);
const rp=path.join(site,'_redirects');let redirects=fs.existsSync(rp)?fs.readFileSync(rp,'utf8').split(/\r?\n/):[];
redirects=redirects.filter(line=>!/^\/black-friday(?:\s|$)/.test(line.trim()));redirects.unshift('/black-friday /black-friday.html 200');fs.writeFileSync(rp,redirects.join('\n').trimEnd()+'\n');
console.log('AMC Black Friday campaign installed on shipping pages; scheduled Nov 16–27, 2026, with Nov 28 live draw.');
