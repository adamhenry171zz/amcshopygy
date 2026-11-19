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
const news='<section class="amc-shipment-news"><div class="amc-shipment-news-inner"><strong>✈ This week’s shipment has arrived!</strong> Customer invoices have been issued. Keep shopping and explore our <a href="/black-friday">Black Friday shipping giveaway</a>: 5 eligible winners, 50% off a qualifying shipping charge.</div></section>';
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
const announcementPath=path.join(site,'announcement.html');
if(fs.existsSync(announcementPath)){
 let html=fs.readFileSync(announcementPath,'utf8');
 html=html.replace(/<div class="amc-current-arrival-notice"[^>]*>[\s\S]*?<\/div>/gi,'');
 html=html.replace(/<\/head>/i,()=>link+'</head>');
 const main='<main><section class="amc-current-announcement"><article><div class="amc-current-announcement-header"><span>AMC SHOPPING · SHIPMENT ARRIVAL UPDATE · NOVEMBER 18, 2026</span><h1>This week’s shipment has arrived!</h1><p>Good news: our weekly air-freight shipment has arrived in Guyana, and customer invoices have been issued.</p></div><div class="amc-current-announcement-body"><h2>Check your invoice</h2><p>Please review your shipping invoice, amount due and payment deadline. Remember to send your payment confirmation through AMC Shopping. We will coordinate delivery and collection once your package has cleared the necessary processing steps.</p><h2>Members Club reminder</h2><p>Your monthly shipping pounds are tracked in HENRY OS. Excess weight beyond your remaining monthly allowance is billed at the regular customer per-pound rate. If you want to upgrade, contact AMC on the same calendar day your invoice is sent and pay the plan difference after AMC confirms the amount.</p><h2>Black Friday is here!</h2><p>Take advantage of the AMC Black Friday Shipping Giveaway. Five eligible customers will each win 50% off shipping on a qualifying invoice. Regular customers qualify at 20 lb or more, while Members Club customers qualify at 50 lb or more. Entries close November 27, with the live TikTok draw scheduled for November 28 at 7:30 PM Guyana time.</p><a class="amc-news-cta" href="/black-friday">Explore the Black Friday giveaway →</a><p>Thank you for trusting AMC Shopping. Your Package. Our Priority. Always.</p></div></article></section><section id="henry-live-announcements" style="padding:20px 0 50px"></section></main>';
 html=html.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,()=>main);
 html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>Weekly Shipment Arrived · Invoices Issued | AMC Shopping</title>');
 fs.writeFileSync(announcementPath,html);
}
console.log('Members Club overage and same-day upgrade notice published. Current weekly arrival announcement replaces outdated pending-invoice copy.');
