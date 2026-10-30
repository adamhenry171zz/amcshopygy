import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target=process.argv[2];
if(!target)throw new Error('Usage: node deploy-v63/inject.mjs <site-directory>');
const here=path.dirname(fileURLToPath(import.meta.url));
const site=path.resolve(target);
const assets=path.join(site,'assets');
fs.mkdirSync(assets,{recursive:true});
fs.copyFileSync(path.join(here,'v63.css'),path.join(assets,'v63.css'));
fs.copyFileSync(path.join(here,'v63.js'),path.join(assets,'v63.js'));

const promoStrip='<div class="promo-strip" data-membership-promo><div class="wrap"><span><strong>WEBSITE RELAUNCH SPECIAL</strong> · 25% OFF your first AMC Members Club payment for 5 days only</span><a href="announcement.html">View announcement →</a></div></div>';
const homeFeature='<section class="home-promo-feature" data-membership-promo><div class="wrap"><div class="home-promo-card"><div><div class="kicker">WEBSITE RELAUNCH SPECIAL</div><h2>25% OFF AMC Members Club.</h2><p>Join during our five-day relaunch offer and save 25% on your first membership payment.</p></div><div class="home-promo-actions"><div class="mini-countdown" data-promo-countdown data-end="2026-10-20T23:59:59-04:00"><b data-days>04</b><span>days left</span></div><a class="btn primary" href="announcement.html">View the offer →</a></div></div></div></section>';
const memberFeature='<div class="member-relaunch-offer" data-membership-promo><div><div class="kicker">5-DAY WEBSITE RELAUNCH OFFER</div><h2>Get 25% off your first membership payment.</h2><p>Join by October 20, 2026 at 11:59 PM GYT and save on any AMC Members Club plan.</p></div><div><a class="btn primary" href="announcement.html">See discounted prices →</a></div></div>';
const christmasStrip='<div class="amc-christmas-strip" role="note">🎄 <b>CHRISTMAS WITH AMC</b> <span>· Shop · Ship · Stream · Gift 🎁</span></div>';

for(const name of fs.readdirSync(site)){
  if(!name.endsWith('.html'))continue;
  const file=path.join(site,name);
  let html=fs.readFileSync(file,'utf8');
  html=html.replace(promoStrip,'').replace(homeFeature,'').replace(memberFeature,'');
  html=html.replace(/<link rel="stylesheet" href="assets\/promo\.css">\s*/g,'').replace(/<script src="assets\/promo\.js"><\/script>\s*/g,'');
  if(!html.includes('assets/v63.css'))html=html.replace('</head>','<link rel="stylesheet" href="/assets/v63.css">\n</head>');
  if(!html.includes('amc-christmas-strip')){
    if(/<div class="topbar">/i.test(html))html=html.replace(/(<div class="topbar">[\s\S]*?<\/div><\/div>)/i,`$1\n${christmasStrip}`);
    else html=html.replace(/<body[^>]*>/i,m=>`${m}\n${christmasStrip}`);
  }
  if(!html.includes('assets/v63.js'))html=html.replace('</body>','<script src="/assets/v63.js"></script>\n</body>');
  fs.writeFileSync(file,html);
}

const accountsPath=path.join(site,'accounts.html');
if(fs.existsSync(accountsPath)){
  let html=fs.readFileSync(accountsPath,'utf8');
  html=html.replace(/<section class="account-expansion account-bundles" id="streaming-vpn-bundles">[\s\S]*?<\/section>\s*/i,'');
  html=html.replace(/<title>[^<]*<\/title>/i,'<title>Digital Accounts, Software & VPN | AMC Shopping</title>');
  html=html.replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="AMC Shopping digital accounts, creative software, productivity tools, AI access and VPN services.">');
  html=html.replace('Tools, subscriptions,<br><span>streaming & VPN access.</span>','Tools for work,<br><span>content & privacy.</span>');
  html=html.replace(/<p>Creative tools, digital accounts, streaming bundles and VPN access in one AMC category\.[\s\S]*?<\/p>/i,'<p>Creative tools, productivity accounts, AI services and VPN access in one AMC category. Streaming plans and entertainment bundles now live on the dedicated Streaming page.</p>');
  fs.writeFileSync(accountsPath,html);
}

const streamingPath=path.join(site,'streaming.html');
if(fs.existsSync(streamingPath)){
  let html=fs.readFileSync(streamingPath,'utf8');
  const extra=fs.readFileSync(path.join(here,'streaming-v63.html'),'utf8');
  if(!html.includes('id="featured-streaming-v63"')){
    const warranty='<section class="streaming-featured warranty-section" id="streaming-warranty">';
    if(html.includes(warranty))html=html.replace(warranty,`${extra}\n${warranty}`);
    else html=html.replace(/(<section[^>]+id="streaming-request"[^>]*>)/i,`${extra}\n$1`);
  }
  html=html.replace(/<title>[^<]*<\/title>/i,'<title>Streaming Services, Bundles & VPN | AMC Shopping</title>');
  html=html.replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="AMC Shopping streaming plans, private and shared accounts, entertainment bundles and optional HMA VPN access.">');
  fs.writeFileSync(streamingPath,html);
}

const sitemapPath=path.join(site,'sitemap.xml');
if(fs.existsSync(sitemapPath)){
  let sitemap=fs.readFileSync(sitemapPath,'utf8');
  sitemap=sitemap.replace(/<loc>https:\/\/amcshopping\.com\/streaming<\/loc><lastmod>[^<]+<\/lastmod>/,'<loc>https://amcshopping.com/streaming</loc><lastmod>2026-10-30</lastmod>');
  sitemap=sitemap.replace(/<loc>https:\/\/amcshopping\.com\/accounts<\/loc><lastmod>[^<]+<\/lastmod>/,'<loc>https://amcshopping.com/accounts</loc><lastmod>2026-10-30</lastmod>');
  fs.writeFileSync(sitemapPath,sitemap);
}

console.log('AMC v6.3 streaming reorganization, promo cleanup and Christmas mode injected into',site);
