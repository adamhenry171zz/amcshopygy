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
console.log('AMC Wholesale Fragrances preview installed; original course unpublished');
