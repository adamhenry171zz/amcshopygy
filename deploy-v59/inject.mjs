import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-v59/inject.mjs <site-directory>');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

fs.copyFileSync(path.join(here, 'v59.js'), path.join(assets, 'v59.js'));

const stylesPath = path.join(assets, 'styles.css');
const css = fs.readFileSync(path.join(here, 'v59.css'), 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('v5.9 — creative AI, Spotify and VPN service expansion')) {
  fs.writeFileSync(stylesPath, `${styles}\n\n${css}\n`);
}

const accountsPath = path.join(site, 'accounts.html');
if (fs.existsSync(accountsPath)) {
  let accounts = fs.readFileSync(accountsPath, 'utf8');
  const extra = fs.readFileSync(path.join(here, 'accounts-v59.html'), 'utf8');
  if (!accounts.includes('id="creative-ai-access"')) {
    accounts = accounts.replace('<section id="account-request"', `${extra}\n<section id="account-request"`);
  }
  accounts = accounts.replace('Canva Pro, ElevenLabs, Microsoft 365, Gemini, QuillBot, Autodesk and future digital-account services have their own AMC category, separate from Gaming and Streaming.', 'Canva Pro, ElevenLabs, Microsoft 365, Gemini, QuillBot, Autodesk, CapCut, ChatGPT Plus, VPN services and future digital-account tools have their own AMC category, separate from Gaming and Streaming.');
  accounts = accounts.replace('AMC Shopping digital accounts and software services including AI, writing, creative and productivity tools.', 'AMC Shopping digital accounts and software services including AI, creative, productivity and VPN access options.');
  if (!accounts.includes('assets/v59.js')) accounts = accounts.replace('</body>', '<script src="assets/v59.js"></script></body>');
  fs.writeFileSync(accountsPath, accounts);
}

const streamingPath = path.join(site, 'streaming.html');
if (fs.existsSync(streamingPath)) {
  let streaming = fs.readFileSync(streamingPath, 'utf8');
  const spotify = fs.readFileSync(path.join(here, 'streaming-v59.html'), 'utf8');
  if (!streaming.includes('id="spotify-plans"')) {
    streaming = streaming.replace('<section id="streaming-request"', `${spotify}\n<section id="streaming-request"`);
  }
  streaming = streaming.replace('Netflix, Disney+, Prime Video, Paramount+, HBO Max, Hulu, IPTV, Crunchyroll and an expanding range of entertainment services', 'Netflix, Disney+, Prime Video, Paramount+, HBO Max, Hulu, Spotify, IPTV, Crunchyroll and an expanding range of entertainment services');
  if (!streaming.includes('assets/v59.js')) streaming = streaming.replace('</body>', '<script src="assets/v59.js"></script></body>');
  fs.writeFileSync(streamingPath, streaming);
}

const sitemapPath = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  sitemap = sitemap.replace(/<loc>https:\/\/amcshopping\.com\/streaming<\/loc><lastmod>[^<]+<\/lastmod>/, '<loc>https://amcshopping.com/streaming</loc><lastmod>2026-10-21</lastmod>');
  sitemap = sitemap.replace(/<loc>https:\/\/amcshopping\.com\/accounts<\/loc><lastmod>[^<]+<\/lastmod>/, '<loc>https://amcshopping.com/accounts</loc><lastmod>2026-10-21</lastmod>');
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log('AMC v5.9 creative AI, Spotify and VPN services injected into', site);
