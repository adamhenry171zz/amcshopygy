import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-v60/inject.mjs <site-directory>');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

fs.copyFileSync(path.join(here, 'v60.js'), path.join(assets, 'v60.js'));

const stylesPath = path.join(assets, 'styles.css');
const css = fs.readFileSync(path.join(here, 'v60.css'), 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('v6.0 — virtual card, warranty policy, announcements, logo resilience')) {
  fs.writeFileSync(stylesPath, `${styles}\n\n${css}\n`);
}

const accountsPath = path.join(site, 'accounts.html');
if (fs.existsSync(accountsPath)) {
  let accounts = fs.readFileSync(accountsPath, 'utf8');
  const card = fs.readFileSync(path.join(here, 'virtual-card.html'), 'utf8');
  if (!accounts.includes('id="virtual-card-offer"')) accounts = accounts.replace('<section id="account-request"', `${card}\n<section id="account-request"`);
  accounts = accounts.replace('AMC Shopping digital accounts and software services including AI, creative, productivity and VPN access options.', 'AMC Shopping digital accounts, software, VPN and virtual-card services including AI, creative and productivity access options.');
  if (!accounts.includes('assets/v60.js')) accounts = accounts.replace('</body>', '<script src="assets/v60.js"></script></body>');
  fs.writeFileSync(accountsPath, accounts);
}

const streamingPath = path.join(site, 'streaming.html');
if (fs.existsSync(streamingPath)) {
  let streaming = fs.readFileSync(streamingPath, 'utf8');
  const warranty = fs.readFileSync(path.join(here, 'streaming-warranty.html'), 'utf8');
  if (!streaming.includes('id="streaming-warranty"')) streaming = streaming.replace('<section id="streaming-request"', `${warranty}\n<section id="streaming-request"`);
  if (!streaming.includes('assets/v60.js')) streaming = streaming.replace('</body>', '<script src="assets/v60.js"></script></body>');
  fs.writeFileSync(streamingPath, streaming);
}

fs.copyFileSync(path.join(here, 'announcement.html'), path.join(site, 'announcement.html'));

const sitemapPath = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  sitemap = sitemap.replace(/<loc>https:\/\/amcshopping\.com\/streaming<\/loc><lastmod>[^<]+<\/lastmod>/, '<loc>https://amcshopping.com/streaming</loc><lastmod>2026-10-21</lastmod>');
  sitemap = sitemap.replace(/<loc>https:\/\/amcshopping\.com\/accounts<\/loc><lastmod>[^<]+<\/lastmod>/, '<loc>https://amcshopping.com/accounts</loc><lastmod>2026-10-21</lastmod>');
  if (!sitemap.includes('https://amcshopping.com/announcement')) sitemap = sitemap.replace('</urlset>', '  <url><loc>https://amcshopping.com/announcement</loc><lastmod>2026-10-21</lastmod></url>\n</urlset>');
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log('AMC v6.0 virtual card, warranty policy, announcement refresh and logo fixes injected into', site);
