import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');
if(!fs.existsSync(site))throw Error('Site directory not found');
const root=new URL('../henry-os/admin/',import.meta.url);
const dest=path.join(site,'admin');
fs.mkdirSync(dest,{recursive:true});
for(const name of ['index.html','styles.css','app.js','henry-live-sync.js','membership-tracker.js','membership-tracker.css','invoice-factory-preview.html','invoice-factory-preview.css','invoice-factory-workspace.css','invoice-factory-fixes.css','invoice-factory-preview.js','invoice-factory-handoff.js','streaming-migration-preview.html','streaming-migration-preview.js','streaming-migration-preview.css','henry-finance-report.js','henry-finance.js','henry-finance.css','streaming-reminders.html','streaming-reminders.js','streaming-reminders.css','netflix-account-planner.js','fragrance-manager.html','fragrance-manager.js','fragrance-manager.css'])fs.copyFileSync(new URL(name,root),path.join(dest,name));
// The standalone Finance screen is retired; retain its API and stored records for future redesign.
fs.rmSync(path.join(dest,'henry-finance.html'),{force:true});
const invoiceFactoryJs=path.join(dest,'invoice-factory-preview.js');
if(fs.existsSync(invoiceFactoryJs))fs.writeFileSync(invoiceFactoryJs,fs.readFileSync(invoiceFactoryJs,'utf8').replace(/300 lbs/g,'220 lbs'));
const fnDir=path.resolve(site,'../netlify/functions');
fs.mkdirSync(fnDir,{recursive:true});
for(const name of ['henry-auth.mjs','henry-delivery-submit.mjs','henry-inquiry-submit.mjs','henry-track-status.mjs','henry-announcements.mjs','henry-invoice-batch.mjs','henry-membership.mjs','henry-streaming-reminders.mjs'])fs.copyFileSync(new URL('../henry-os/functions/'+name,import.meta.url),path.join(fnDir,name));
// Keep pricing logic outside the publicly served website. Supplier SKU costs
// are imported by the owner into Netlify Blobs, never checked into GitHub.
const fragranceLibDir=path.resolve(site,'../netlify/henry-fragrance-lib');
fs.mkdirSync(fragranceLibDir,{recursive:true});
for(const name of ['henry-fragrance-logic.mjs'])
  fs.copyFileSync(new URL('../henry-os/functions/'+name,import.meta.url),path.join(fragranceLibDir,name));
let fragranceFn=fs.readFileSync(new URL('../henry-os/functions/henry-fragrance.mjs',import.meta.url),'utf8');
fragranceFn=fragranceFn.replace("'./henry-fragrance-logic.mjs'","'../henry-fragrance-lib/henry-fragrance-logic.mjs'");
fs.writeFileSync(path.join(fnDir,'henry-fragrance.mjs'),fragranceFn);
fs.copyFileSync(new URL('../henry-os/functions/henry-amc.mjs',import.meta.url),path.join(fnDir,'henry-amc-core.mjs'));
fs.copyFileSync(new URL('../henry-os/functions/henry-amc-wrapper.mjs',import.meta.url),path.join(fnDir,'henry-amc.mjs'));
const financeLibraryDir=path.resolve(site,'../netlify/henry-finance-lib');
fs.mkdirSync(financeLibraryDir,{recursive:true});
fs.copyFileSync(new URL('../henry-os/functions/henry-finance-logic.mjs',import.meta.url),path.join(financeLibraryDir,'henry-finance-logic.mjs'));
const financeFn=fs.readFileSync(new URL('../henry-os/functions/henry-finance.mjs',import.meta.url),'utf8').replace("'./henry-finance-logic.mjs'","'../henry-finance-lib/henry-finance-logic.mjs'");
fs.writeFileSync(path.join(fnDir,'henry-finance.mjs'),financeFn);
const assets=path.join(site,'assets');fs.mkdirSync(assets,{recursive:true});
fs.copyFileSync(new URL('../henry-os/public/henry-public.js',import.meta.url),path.join(assets,'henry-public.js'));
fs.copyFileSync(new URL('../henry-os/public/henry-tracking.js',import.meta.url),path.join(assets,'henry-tracking.js'));
fs.copyFileSync(new URL('../henry-os/public/henry-announcements.js',import.meta.url),path.join(assets,'henry-announcements.js'));
for(const name of fs.readdirSync(site).filter(n=>n.endsWith('.html'))){const p=path.join(site,name);let html=fs.readFileSync(p,'utf8');if(html.includes('data-netlify="true"')&&!html.includes('assets/henry-public.js'))html=html.replace(/<\/body>/i,'<script src="/assets/henry-public.js"></script></body>');if(name==='tracking.html'){html=html.replace(/<section\s+id="henry-amc-track"[\s\S]*?<\/section>\s*/gi,'');html=html.replace(/<script\s+src="\/assets\/henry-tracking\.js"><\/script>\s*/gi,'')}if(name==='announcement.html'&&!html.includes('id="henry-live-announcements"')){html=html.replace(/<\/main>/i,'<section id="henry-live-announcements" style="padding:20px 0 50px"></section></main>');html=html.replace(/<\/body>/i,'<script src="/assets/henry-announcements.js"></script></body>')}if(name==='members.html'){html=html.replace(/<h3>300 lbs<\/h3>/g,'<h3>220 lbs</h3>').replace(/Up to 300 lbs monthly allowance/g,'Up to 220 lbs monthly allowance')}fs.writeFileSync(p,html)}
console.log('HENRY OS AMC command center, Invoice Factory, Members Club monthly usage tracking, 220 lb Enterprise plan, live dashboard sync, inquiries, internal tracking and announcements staged');



// Prominent, dated public notice for the mechanically delayed November shipment.
// Keep this separate from routine schedule text: November 12 is ARRIVAL, not invoice delivery.
const delayStyle=path.join(assets,'shipment-delay-2026.css');
fs.copyFileSync(new URL('../henry-os/public/shipment-delay-2026.css',import.meta.url),delayStyle);
const delayCssLink='<link rel="stylesheet" href="/assets/shipment-delay-2026.css">';
const delayBanner=String.raw`<section class="amc-shipment-banner" id="amc-shipment-delay-banner-2026" aria-label="Important shipment delay"><div class="wrap"><div><small>IMPORTANT SHIPMENT UPDATE · FLIGHT DELAY</small><strong>Revised arrival: Thursday, November 12, 2026</strong><p>Mechanical issues delayed the scheduled flight. Sorting, processing and customer invoicing are scheduled for Friday, November 13.</p></div><a href="/announcement.html">Read full update</a></div></section>`;
const delayAnnouncement=String.raw`<section class="amc-shipment-announcement" id="amc-shipment-update-nov-2026" aria-labelledby="amc-delay-title"><div class="wrap"><article class="amc-delay-panel"><div class="amc-delay-title"><div class="eyebrow">✈ IMPORTANT SHIPMENT UPDATE</div><h1 id="amc-delay-title">Flight Delay — Revised Arrival Schedule</h1><p>A.M.C Shopping · Shipment update issued November 4, 2026</p></div><div class="amc-delay-body"><p>Dear Valued Customers,</p><p>We would like to inform you that our incoming shipment has experienced an unexpected delay due to <strong>mechanical issues affecting the scheduled flight</strong>.</p><p>Please see the revised schedule below:</p><div class="amc-delay-grid"><div class="amc-delay-date"><small>Expected shipment arrival in Guyana</small><strong>Thursday, November 12</strong><p>Revised flight arrival date, subject to airline operations and clearance.</p></div><div class="amc-delay-date"><small>Shipment processing and invoicing</small><strong>Friday, November 13</strong><p>Sorting, processing and customer invoices are scheduled for this day.</p></div></div><p class="amc-delay-clarification">November 13 is the processing and invoicing date, not a guaranteed customer delivery date. We will share delivery arrangements once processing is complete.</p><p>We sincerely apologize for the inconvenience and appreciate your patience and understanding. We remain committed to transparency and keeping you informed every step of the way.</p><p class="amc-delay-signoff">Your Package. Our Priority. Always.<br>A.M.C Shopping Management</p></div></article></div></section>`;
const addDelayStyle=html=>html.includes('shipment-delay-2026.css')?html:html.replace(/<\/head>/i,delayCssLink+'\n</head>');
const injectAtMain=(html,fragment)=>html.replace(/<main\b[^>]*>/i,m=>m+'\n'+fragment);
const publicIndex=path.join(site,'index.html');
const announcementPath=path.join(site,'announcement.html');
if(!fs.existsSync(announcementPath)&&fs.existsSync(publicIndex)){
  // Reuse the deployed site's header, navigation, footer and asset links.
  let base=fs.readFileSync(publicIndex,'utf8');
  base=base.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i,'<main></main>');
  base=base.replace(/<title>[\s\S]*?<\/title>/i,'<title>Flight Delay &amp; Shipment Update | AMC Shopping</title>');
  base=base.replace(/<meta name="description" content="[^"]*"\s*\/?>/i,'<meta name="description" content="AMC Shopping incoming flight delay: expected arrival November 12, 2026, and shipment processing and invoicing November 13.">');
  base=base.replace(/<\/main>/i,'<section id="henry-live-announcements" style="padding:20px 0 50px"></section></main>');
  if(!base.includes('/assets/henry-announcements.js'))base=base.replace(/<\/body>/i,'<script src="/assets/henry-announcements.js"></script></body>');
  fs.writeFileSync(announcementPath,base);
}
for(const name of ['index.html','tracking.html','announcement.html']){
  const target=path.join(site,name);
  if(!fs.existsSync(target))continue;
  let html=addDelayStyle(fs.readFileSync(target,'utf8'));
  const fragment=name==='announcement.html'?delayAnnouncement:delayBanner;
  const marker=name==='announcement.html'?'amc-shipment-update-nov-2026':'amc-shipment-delay-banner-2026';
  if(!html.includes(marker))html=injectAtMain(html,fragment);
  fs.writeFileSync(target,html);
}
console.log('November 12 flight-delay announcement published to AMC website and homepage/tracking banners staged');
