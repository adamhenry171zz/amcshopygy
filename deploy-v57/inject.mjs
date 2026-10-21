import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-v57/inject.mjs <site-directory>');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

for (const name of ['accounts-extra.js','streaming-cleanup.js']) {
  fs.copyFileSync(path.join(here, name), path.join(assets, name));
}

const stylesPath = path.join(assets, 'styles.css');
const css = fs.readFileSync(path.join(here, 'v57.css'), 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('v5.7 — AI/productivity expansion + extended IPTV plans')) {
  fs.writeFileSync(stylesPath, `${styles}\n\n${css}\n`);
}

const accountsPath = path.join(site, 'accounts.html');
if (fs.existsSync(accountsPath)) {
  let accounts = fs.readFileSync(accountsPath, 'utf8');
  const extraAccounts = fs.readFileSync(path.join(here, 'accounts-extra.html'), 'utf8');
  if (!accounts.includes('id="ai-productivity-offers"')) {
    accounts = accounts.replace('<section id="account-request"', `${extraAccounts}\n<section id="account-request"`);
  }
  accounts = accounts.replace('AMC Shopping digital accounts and software services including Canva Pro, ElevenLabs and Microsoft 365.', 'AMC Shopping digital accounts and software services including AI, writing, creative and productivity tools.');
  accounts = accounts.replace('Canva Pro, ElevenLabs, Microsoft 365 and future digital-account services now have their own AMC category, separate from Gaming and Streaming.', 'Canva Pro, ElevenLabs, Microsoft 365, Gemini, QuillBot, Autodesk and future digital-account services have their own AMC category, separate from Gaming and Streaming.');
  if (!accounts.includes('assets/accounts-extra.js')) {
    accounts = accounts.replace('</body>', '<script src="assets/accounts-extra.js"></script></body>');
  }
  fs.writeFileSync(accountsPath, accounts);
}

const streamingPath = path.join(site, 'streaming.html');
if (fs.existsSync(streamingPath)) {
  let streaming = fs.readFileSync(streamingPath, 'utf8');
  const iptv = fs.readFileSync(path.join(here, 'streaming-iptv.html'), 'utf8');
  if (!streaming.includes('id="iptv-extended-plans"')) {
    streaming = streaming.replace('<section id="streaming-request"', `${iptv}\n<section id="streaming-request"`);
  }
  if (!streaming.includes('assets/streaming-cleanup.js')) {
    streaming = streaming.replace('</body>', '<script src="assets/streaming-cleanup.js"></script></body>');
  }
  fs.writeFileSync(streamingPath, streaming);
}

const sitemapPath = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  sitemap = sitemap.replace(/<lastmod>2026-10-21<\/lastmod>/g, '<lastmod>2026-10-21</lastmod>');
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log('AMC v5.7 AI/software and IPTV expansion injected into', site);
