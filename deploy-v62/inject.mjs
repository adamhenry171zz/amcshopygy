import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target=process.argv[2];
if(!target)throw new Error('Usage: node deploy-v62/inject.mjs <site-directory>');
const here=path.dirname(fileURLToPath(import.meta.url));
const site=path.resolve(target);
const stylesPath=path.join(site,'assets','styles.css');
if(fs.existsSync(stylesPath)){
  let styles=fs.readFileSync(stylesPath,'utf8');
  const css=fs.readFileSync(path.join(here,'v62.css'),'utf8');
  if(!styles.includes('v6.2 — compact page rhythm, subscription bundles and delivery UX'))fs.writeFileSync(stylesPath,`${styles}\n\n${css}\n`);
}

const accountsPath=path.join(site,'accounts.html');
if(fs.existsSync(accountsPath)){
  let html=fs.readFileSync(accountsPath,'utf8');
  html=html.replace(/<title>[^<]*<\/title>/i,'<title>Digital Accounts, Streaming Bundles & VPN | AMC Shopping</title>');
  html=html.replace(/<meta name="description" content="[^"]*">/i,'<meta name="description" content="AMC Shopping digital accounts, streaming bundles, software and VPN access including HMA monthly plans and selected private or shared subscription options.">');
  html=html.replace('Tools for work,<br><span>content & productivity.</span>','Tools, subscriptions,<br><span>streaming & VPN access.</span>');
  html=html.replace(/<p>Canva Pro, ElevenLabs, Microsoft 365[^<]*<\/p>/i,'<p>Creative tools, digital accounts, streaming bundles and VPN access in one AMC category. Each offer clearly shows whether the account is private or shared, whether VPN is included, and any limited warranty.</p>');
  fs.writeFileSync(accountsPath,html);
}

const sitemapPath=path.join(site,'sitemap.xml');
if(fs.existsSync(sitemapPath)){
  let sitemap=fs.readFileSync(sitemapPath,'utf8');
  sitemap=sitemap.replace(/<loc>https:\/\/amcshopping\.com\/accounts<\/loc><lastmod>[^<]+<\/lastmod>/,'<loc>https://amcshopping.com/accounts</loc><lastmod>2026-10-30</lastmod>');
  sitemap=sitemap.replace(/<loc>https:\/\/amcshopping\.com\/mailbox<\/loc><lastmod>[^<]+<\/lastmod>/,'<loc>https://amcshopping.com/mailbox</loc><lastmod>2026-10-30</lastmod>');
  fs.writeFileSync(sitemapPath,sitemap);
}

console.log('AMC v6.2 compact spacing and account subscription refresh injected into',site);
