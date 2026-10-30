import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target=process.argv[2];
if(!target)throw new Error('Usage: node deploy-v65/inject.mjs <site-directory>');
const here=path.dirname(fileURLToPath(import.meta.url));
const site=path.resolve(target);
const assets=path.join(site,'assets');
fs.mkdirSync(assets,{recursive:true});

// Shared styles + comprehensive streaming logo script.
const stylesPath=path.join(assets,'styles.css');
if(fs.existsSync(stylesPath)){
  let styles=fs.readFileSync(stylesPath,'utf8');
  const css=fs.readFileSync(path.join(here,'v65.css'),'utf8');
  if(!styles.includes('v6.5 — complete streaming logo treatment + current service notice'))fs.writeFileSync(stylesPath,`${styles}\n\n${css}\n`);
}
fs.copyFileSync(path.join(here,'streaming-logos-v65.js'),path.join(assets,'streaming-logos-v65.js'));

const streamingPath=path.join(site,'streaming.html');
if(fs.existsSync(streamingPath)){
  let html=fs.readFileSync(streamingPath,'utf8');
  // BET+ has officially closed; do not present the discontinued service as an active offer.
  html=html.replace(/<article class="streaming-offer-card" data-stream-category="shared vpn">[\s\S]*?<h3>BET\+ Premium<\/h3>[\s\S]*?<\/article>/i,'');
  // Remove legacy BET+ option from select buttons/text if an upstream section contains it.
  html=html.replace(/<button[^>]*data-service="BET\+ Premium"[\s\S]*?<\/button>/gi,'');
  if(!html.includes('assets/streaming-logos-v65.js'))html=html.replace('</body>','<script src="assets/streaming-logos-v65.js"></script></body>');
  fs.writeFileSync(streamingPath,html);
}

// Current operational notice for the King Charles III State Visit and traffic restrictions.
const announcementPath=path.join(site,'announcement.html');
if(fs.existsSync(announcementPath)){
  let html=fs.readFileSync(announcementPath,'utf8');
  const hero=`<section class="page-hero announcement-current-hero"><div class="wrap page-head"><div><div class="eyebrow"><i></i> CURRENT AMC SERVICE NOTICE</div><h1>Temporary service delays<br><span>through Friday.</span></h1></div><p>King Charles III's State Visit to Guyana, together with temporary road closures and traffic diversions across Georgetown and sections of the East Coast Demerara corridor, is affecting normal movement and AMC Shopping's operating schedule.</p></div></section>`;
  html=html.replace(/<section class="page-hero announcement-current-hero">[\s\S]*?<\/section>/i,hero);
  const main=`<main><section><div class="wrap"><div class="royal-delay-alert"><span class="alert-badge">SERVICE DELAY · OCTOBER 29–30</span><h2 style="margin:12px 0 8px">Operations are temporarily affected by traffic restrictions.</h2><p>His Majesty King Charles III is currently on a two-day State Visit to Guyana. Temporary road closures, traffic diversions and security arrangements in Georgetown and along parts of the East Coast Demerara corridor are affecting travel times and access to several areas.</p><p>As a result, AMC Shopping is experiencing slower-than-usual processing across customer coordination, package handling, deliveries and responses. We appreciate your patience while movement remains restricted.</p><div class="royal-delay-grid"><article><h3>Package processing</h3><p>Some package updates and processing may take longer than usual while our normal movement is disrupted.</p></article><article><h3>Deliveries & coordination</h3><p>Delivery timing and customer handovers may be rescheduled where road access or travel time is affected.</p></article><article><h3>Customer responses</h3><p>WhatsApp and website requests remain open, but response and fulfilment times may be slower during the disruption.</p></article></div><div class="resume-card"><strong>Expected return to normal processing: Saturday, October 31.</strong><br>We will work through delayed requests and outstanding items as quickly as possible once normal movement resumes. Thank you for your understanding and continued support.</div></div></div></section><section><div class="wrap"><div class="section-head"><div><div class="kicker">CUSTOMER REMINDER</div><h2>Keep your order details ready.</h2></div><p>When contacting AMC, include your full name and any available tracking number, package reference, screenshots or payment information so we can review your request efficiently once processing resumes.</p></div></div></section></main>`;
  html=html.replace(/<main>[\s\S]*?<\/main>/i,main);
  html=html.replace(/<title>[^<]*<\/title>/i,'<title>AMC Service Delay Notice | AMC Shopping</title>');
  html=html.replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="AMC Shopping service notice: temporary processing and delivery delays during King Charles III’s State Visit and associated traffic restrictions in Guyana.">');
  fs.writeFileSync(announcementPath,html);
}

const sitemapPath=path.join(site,'sitemap.xml');
if(fs.existsSync(sitemapPath)){
  let sitemap=fs.readFileSync(sitemapPath,'utf8');
  sitemap=sitemap.replace(/<loc>https:\/\/amcshopping\.com\/streaming<\/loc><lastmod>[^<]+<\/lastmod>/,'<loc>https://amcshopping.com/streaming</loc><lastmod>2026-10-30</lastmod>');
  sitemap=sitemap.replace(/<loc>https:\/\/amcshopping\.com\/announcement(?:\.html)?<\/loc><lastmod>[^<]+<\/lastmod>/,'<loc>https://amcshopping.com/announcement.html</loc><lastmod>2026-10-30</lastmod>');
  fs.writeFileSync(sitemapPath,sitemap);
}

console.log('AMC v6.5 service-delay announcement and complete streaming logo pass applied');
