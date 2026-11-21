import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');if(!process.argv[2]||!fs.existsSync(site))throw Error('Site directory missing');
const css=String.raw`
.amc-member-policy{margin:22px auto;padding:0 16px;max-width:1190px;box-sizing:border-box;color:#12233d}
.amc-member-policy *{box-sizing:border-box}
.amc-member-policy-card{padding:clamp(20px,3vw,32px);border-radius:17px;border:1px solid #cadbf0;background:linear-gradient(117deg,#f4f8ff,#ffffff);box-shadow:0 5px 26px #0b36700b;display:grid;grid-template-columns:1.3fr .7fr;gap:20px;align-items:center}
.amc-member-policy-tag{display:inline-block;font-size:11px;letter-spacing:1.1px;font-weight:850;text-transform:uppercase;color:#075aa2;margin-bottom:8px}
.amc-member-policy h2{font-size:clamp(22px,3vw,32px);line-height:1.15;color:#071d39;margin:0 0 9px}
.amc-member-policy p{font-size:14px;line-height:1.65;color:#344963;margin:0}
.amc-member-policy-points{padding:14px 18px;background:#071d39;color:#fff;border-radius:12px}
.amc-member-policy-points strong{display:block;color:#f2cf89;font-size:14px;margin-bottom:6px}
.amc-member-policy-points p{color:#e5edf7;font-size:13px;line-height:1.55}
.amc-member-policy-points a{display:inline-block;margin-top:10px;color:#f2cf89;font-size:13px;font-weight:800;text-decoration:underline}
.amc-shipment-news{max-width:1170px;margin:16px auto;padding:0 16px}
.amc-shipment-news-inner{padding:13px 18px;background:#eaf5f3;color:#124c3f;border:1px solid #b0d8cb;border-radius:11px;font-size:14px;line-height:1.5}
.amc-shipment-news-inner strong{color:#0a4436}
.amc-shipment-news-inner a{color:#0b5b49;font-weight:850;text-decoration:underline}
.amc-current-announcement{max-width:1050px;margin:25px auto 60px;padding:0 20px;color:#18304c}
.amc-current-announcement article{background:#fff;border:1px solid #d7e2ed;border-radius:19px;overflow:hidden}
.amc-current-announcement-header{background:linear-gradient(117deg,#081d38,#123d6f);color:#fff;padding:35px clamp(22px,4vw,44px)}
.amc-current-announcement-header span{font-size:11px;letter-spacing:1.5px;color:#b0d8ff;font-weight:850}
.amc-current-announcement-header h1{font-size:clamp(30px,5vw,48px);color:#fff;line-height:1.07;margin:12px 0}
.amc-current-announcement-header p{color:#d7e7f6;font-size:16px;line-height:1.6;margin:0}
.amc-current-announcement-body{padding:24px clamp(22px,4vw,44px) 36px}
.amc-current-announcement-body h2{font-size:23px;color:#0c315a;margin:15px 0 9px}
.amc-current-announcement-body p,.amc-current-announcement-body li{font-size:15px;color:#344963;line-height:1.7}
.amc-current-announcement-body .amc-news-cta{display:inline-block;margin-top:12px;padding:13px 22px;background:#092849;color:#fff;border-radius:9px;font-weight:800;text-decoration:none}
@media(max-width:700px){.amc-member-policy-card{grid-template-columns:1fr}.amc-current-announcement-header{padding:28px 20px}}
`.replaceAll('\\`','`');
const assets=path.join(site,'assets');fs.mkdirSync(assets,{recursive:true});
fs.writeFileSync(path.join(assets,'member-overage-2026.css'),css);
const link='<link rel="stylesheet" href="/assets/member-overage-2026.css">';
const notice='<section class="amc-member-policy" aria-label="Important Members Club monthly allowance and upgrade policy"><div class="amc-member-policy-card"><div><span class="amc-member-policy-tag">Members Club · Important Billing Update</span><h2>Use your allowance. Know your options.</h2><p>Each membership includes a monthly shipping weight allowance. Once your remaining pounds are used, any additional shipment weight is charged at the <strong>regular customer per-pound shipping rate</strong> for that shipment’s weight tier. Pounds within your allowance still receive the member rate. Unused pounds do not automatically roll over.</p></div><div class="amc-member-policy-points"><strong>Upgrade on invoice day</strong><p>When your invoice is sent, you have <strong>until 11:59 PM Guyana time that same day</strong> to request a higher Members Club plan and pay the difference in membership fees. AMC must verify the payment and confirm the upgrade before revising your invoice. Otherwise the regular customer rate applies to the excess weight.</p><a href="https://wa.me/5926042826?text=Hello%20AMC%2C%20I%20want%20to%20upgrade%20my%20Members%20Club%20plan%20on%20invoice%20day.">Request an upgrade →</a></div></div></section>';
const news=''; // Remove the dated shipment-arrival homepage notice.
for(const name of ['members.html','rates.html']){
 const target=path.join(site,name);if(!fs.existsSync(target))continue;
 let html=fs.readFileSync(target,'utf8');
 html=html.replace(/<\/head>/i,()=>link+'</head>');
 html=html.replace(/<main\b[^>]*>/i,m=>m+notice);
 fs.writeFileSync(target,html);
}
const home=path.join(site,'index.html');
if(fs.existsSync(home)){
 let html=fs.readFileSync(home,'utf8');
 // Retire the earlier preliminary "invoices coming shortly" update.
 html=html.replace(/<div class="amc-current-arrival-notice"[^>]*>[\s\S]*?<\/div>/gi,'');
 html=html.replace(/<\/head>/i,()=>link+'</head>');
 html=html.replace(/<main\b[^>]*>/i,m=>m+news);
 fs.writeFileSync(home,html);
}
const bfPage=path.join(site,'black-friday.html');
if(fs.existsSync(bfPage)){let html=fs.readFileSync(bfPage,'utf8');html=html.replace(/<div class="amc-current-arrival-notice"[^>]*>[\s\S]*?<\/div>/gi,'');fs.writeFileSync(bfPage,html);}
const announcementPath=path.join(site,'announcement.html');
if(fs.existsSync(announcementPath)){
 let html=fs.readFileSync(announcementPath,'utf8');
 html=html.replace(/<div class="amc-current-arrival-notice"[^>]*>[\s\S]*?<\/div>/gi,'');
 html=html.replace(/<section class="page-hero announcement-current-hero">[\s\S]*?<\/section>/gi,'');
  html=html.replace(/<\/head>/i,()=>link+'</head>');
 const main="<main><section class=\"amc-current-announcement\"><article><div class=\"amc-current-announcement-header\"><span>AMC SHOPPING · PROMOTIONS & UPDATES</span><h1>Latest AMC updates</h1><p>Promotions and essential shipping information in one uncluttered place.</p></div><div class=\"amc-current-announcement-body\"><section id=\"amc-bf-current-announcement\"><h2>Black Friday Shipping Giveaway</h2><p>Five eligible customers can win 50% off shipping. Regular customers qualify with 20+ lb, and Members Club customers with 50+ lb. <strong>Qualification closes November 27, 2026 at 11:59 PM Guyana time.</strong></p><p><strong>Updated TikTok LIVE draw:</strong> Monday, December 7, 2026 at 7:30 PM Guyana time (rescheduled from November 28).</p><p id=\"amc-bf-news-status\">Entries remain open until November 27.</p><a class=\"amc-news-cta\" href=\"/black-friday\">View giveaway details →</a></section><h2>Members Club allowance reminder</h2><p>Monthly pounds within your allowance use the Members Club rate. Excess pounds use the regular shipping rate. Customers can request an upgrade on the same day an invoice is sent, subject to AMC approval and verified payment.</p><p><a href=\"/members\">View Members Club plans and terms →</a></p><h2>Need a shipment update?</h2><p>Check our <a href=\"/tracking\">tracking page</a> or contact AMC with your name, mailbox code and tracking number. Older shipment-arrival notices no longer occupy the homepage.</p></div></article></section><section id=\"henry-live-announcements\" style=\"padding:20px 0 50px\"></section><script>(()=>{const section=document.getElementById('amc-bf-current-announcement');const status=document.getElementById('amc-bf-news-status');const now=Date.now();if(now>=Date.parse('2026-12-08T00:00:00-04:00')){section?.remove();return;}if(now>=Date.parse('2026-11-28T00:00:00-04:00')&&status)status.textContent='Entries are closed. The TikTok LIVE draw is Monday, December 7 at 7:30 PM Guyana time.';})();</script></main>";
 html=html.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,()=>main);
 html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>AMC Promotions & Updates | AMC Shopping</title>');
 html=html.replace(/<meta name="description" content="[^"]*"\s*\/?>/i,'<meta name="description" content="AMC Shopping promotions, Members Club shipping notices, and customer support updates.">');
 fs.writeFileSync(announcementPath,html);
}
console.log('Members Club overage and same-day upgrade notice published. Current weekly arrival announcement replaces outdated pending-invoice copy.');
