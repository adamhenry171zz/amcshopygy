import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const target=process.argv[2];
if(!target)throw new Error('Usage: node deploy-fragrance/inject.mjs <site-directory>');
const site=path.resolve(target);
if(!fs.existsSync(site))throw new Error('Website build folder does not exist');
const root=path.dirname(fileURLToPath(import.meta.url));
const assets=path.join(site,'assets');
fs.mkdirSync(assets,{recursive:true});

// Keep the course source in GitHub for a possible future relaunch, but do NOT
// ship a visible course page or working old enrollment form on the website.
fs.rmSync(path.join(site,'course.html'),{force:true});
fs.copyFileSync(path.join(root,'landing.html'),path.join(site,'fragrances.html'));
fs.copyFileSync(path.join(root,'fragrance-promo.css'),path.join(assets,'fragrance-promo.css'));
// Public browse assets contain product descriptions, SKU references and selected
// low-resolution photos ONLY. No Onarys USD prices, margins, stock promises or
// HENRY OS private product records are copied into the published website.
const browseSrc=path.join(root,'public-catalog');
const browseDest=path.join(assets,'fragrance');
fs.mkdirSync(browseDest,{recursive:true});
for(const file of fs.readdirSync(browseSrc).filter(n=>/^(catalog(?:-products|-photos-\d{2})?\.js|catalog\.css)$/.test(n))){
 fs.copyFileSync(path.join(browseSrc,file),path.join(browseDest,file));
}
const needed=['catalog-products.js','catalog.js','catalog.css',...Array.from({length:14},(_,n)=>'catalog-photos-'+String(n).padStart(2,'0')+'.js')];
for(const file of needed)if(!fs.existsSync(path.join(browseDest,file)))throw Error('Missing fragrance browse asset '+file);


const banner='<div class="frag-site-banner"><div class="wrap"><strong>NEW AT AMC SHOPPING</strong><span>Authentic fragrances · Wholesale prices from 3 pieces</span><a href="fragrances">Explore fragrances →</a></div></div>';
for(const filename of fs.readdirSync(site).filter(v=>v.endsWith('.html')&&v!=='fragrances.html')){
 const file=path.join(site,filename);
 let html=fs.readFileSync(file,'utf8');
 // The old course injector runs earlier in the legacy zip build. Replace both
 // navigation and footer links rather than leaving a visible dead-end.
 html=html.replace(/<a\b[^>]*href=["'](?:course|course\.html)["'][^>]*>\s*Course\s*<\/a>/gi,
  '<a class="" href="fragrances">Fragrances</a>');
 html=html.replace(/<a\b[^>]*href=["'](?:course|course\.html)["'][^>]*>\s*Income Blueprint\s*<\/a>/gi,
  '<a href="fragrances">Wholesale Fragrances</a>');
 html=html.replace(/Shopping &amp; Learning|Shopping & Learning/g,'Shopping');
 // Fallback for original pages without the old Course navigation.
 if(html.includes('class="nav-links"')&&!/<a\b[^>]*href=["'](?:fragrances|fragrances\.html)["'][^>]*>Fragrances<\/a>/i.test(html)){
  html=html.replace(/(<a\b[^>]*href=["']members\.html["'][^>]*>\s*Members\s*<\/a>)/i,
    '<a class="" href="fragrances">Fragrances</a>$1');
 }
 if(filename==='index.html'&&!html.includes('frag-site-banner')){
  html=html.replace('</header>','</header>\n'+banner);
 }
 if(filename==='index.html'&&!html.includes('assets/fragrance-promo.css')){
  html=html.replace('</head>','<link rel="stylesheet" href="assets/fragrance-promo.css">\n</head>');
 }
 fs.writeFileSync(file,html);
}

// The existing /course enrollment URL should no longer serve a live course.
// Use a temporary redirect while fragrances take its navigation position.
const redirectPath=path.join(site,'_redirects');
let lines=fs.existsSync(redirectPath)?fs.readFileSync(redirectPath,'utf8').split(/\r?\n/):[];
lines=lines.filter(line=>!/^\/(?:course|course\.html|fragrances|perfumes)(?:\s|$)/.test(line.trim()));
lines.push('/fragrances /fragrances.html 200');
lines.push('/course /fragrances 302');
lines.push('/course.html /fragrances 302');
lines.push('/perfumes /fragrances 302');
fs.writeFileSync(redirectPath,lines.join('\n').trimEnd()+'\n');

// Remove courses from the public sitemap and add only the new preview route.
const sitemapPath=path.join(site,'sitemap.xml');
if(fs.existsSync(sitemapPath)){
 let xml=fs.readFileSync(sitemapPath,'utf8');
 xml=xml.replace(/\s*<url>\s*<loc>https:\/\/amcshopping\.com\/course(?:\.html)?<\/loc>[\s\S]*?<\/url>\s*/gi,'\n');
 if(!xml.includes('https://amcshopping.com/fragrances')){
  xml=xml.replace('</urlset>','  <url><loc>https://amcshopping.com/fragrances</loc><lastmod>2026-11-10</lastmod></url>\n</urlset>');
 }
 fs.writeFileSync(sitemapPath,xml);
}

/* Latest shipment status supersedes all temporary flight-delay notices. */
const arrivalPath=path.join(site,'announcement.html');
if(fs.existsSync(arrivalPath)){
 let html=fs.readFileSync(arrivalPath,'utf8');
 const hero='<section class="page-hero announcement-current-hero"><div class="wrap page-head"><div><div class="eyebrow"><i></i> FLIGHT ARRIVAL UPDATE</div><h1>Flight has arrived.<br><span>Invoices coming shortly.</span></h1></div><p>Good news! Our shipment has arrived in Guyana. AMC Shopping is preparing package records and customer invoices, which will be sent out shortly.</p></div></section>';
 const main='<main><section><div class="wrap"><div class="royal-delay-alert"><span class="alert-badge">FLIGHT ARRIVAL · NOVEMBER 11, 2026</span><h2 style="margin:12px 0 8px">Your packages are being processed.</h2><p>We are pleased to announce that the flight has arrived in Guyana. Our team is working through the shipment and preparing invoices for customers. <strong>Invoices will be sent out shortly.</strong></p><div class="royal-delay-grid"><article><h3>Flight arrival</h3><p>The shipment has arrived in Guyana.</p></article><article><h3>Package processing</h3><p>Package records are being reviewed and prepared for invoicing.</p></article><article><h3>Customer invoices</h3><p>Invoices will be sent to customers shortly. Please look out for your invoice and payment instructions.</p></article></div><div class="resume-card"><strong>Thank you for your patience and continued support.</strong><br>We will share collection and delivery arrangements as each package is ready. Please wait for your invoice and confirmation before making arrangements.</div></div></div></section><section><div class="wrap"><div class="section-head"><div><div class="kicker">CUSTOMER REMINDER</div><h2>Keep your package details handy.</h2></div><p>When contacting AMC Shopping, please provide your name and tracking number or AMC mailbox code so we can assist you efficiently.</p></div></div></section></main>';
 html=html.replace(/<section class="page-hero announcement-current-hero">[\\s\\S]*?<\\/section>/i,hero);
 html=html.replace(/<main>[\\s\\S]*?<\\/main>/i,main);
 html=html.replace(/<title>[^<]*<\\/title>/i,'<title>Flight Arrival & Invoices Update | AMC Shopping</title>');
 html=html.replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="AMC Shopping flight arrival update: the shipment has arrived in Guyana and customer invoices will be sent out shortly.">');
 fs.writeFileSync(arrivalPath,html);
}
const homePath=path.join(site,'index.html');
if(fs.existsSync(homePath)){
 let html=fs.readFileSync(homePath,'utf8');
 // Remove dated disruption banners/alerts rather than leaving contradictory homepage notices.
 html=html.replace(/<([a-z][\\w-]*)\\b[^>]*class="[^"]*(?:flight-delay|delay-alert|shipment-delay|service-delay)[^"]*"[^>]*>[\\s\\S]*?<\\/\\1>/gi,'');
 html=html.replace(/<([a-z][\\w-]*)\\b[^>]*data-(?:flight-delay|delay-notice)[^>]*>[\\s\\S]*?<\\/\\1>/gi,'');
 // Promote the current arrival status on the home page.
 if(!html.includes('amc-current-arrival-notice')){
  const notice='<div class="amc-current-arrival-notice" role="status" style="background:#eaf5ff;color:#08264b;padding:12px 16px;text-align:center;font-weight:650">✈ Flight arrived in Guyana · Customer invoices will be sent out shortly. <a href="/announcement" style="color:#075ab2;text-decoration:underline">View update</a></div>';
  html=html.replace(/<header\\b[^>]*>/i,m=>notice+'\\n'+m);
 }
 fs.writeFileSync(homePath,html);
}

console.log('AMC public fragrance catalogue installed; 835 enquiry-only listings, 530 curated photos, no supplier prices. Original Course unpublished.');
