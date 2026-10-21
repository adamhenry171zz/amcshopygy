import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-v56/inject.mjs <site-directory>');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

for (const name of ['accounts.js','streaming-extra.js']) {
  fs.copyFileSync(path.join(here, name), path.join(assets, name));
}
fs.copyFileSync(path.join(here, 'accounts.html'), path.join(site, 'accounts.html'));

const stylesPath = path.join(assets, 'styles.css');
const css = fs.readFileSync(path.join(here, 'v56.css'), 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('v5.6 — expanded Streaming + Digital Accounts')) {
  fs.writeFileSync(stylesPath, `${styles}\n\n${css}\n`);
}

const streamingPath = path.join(site, 'streaming.html');
let streaming = fs.readFileSync(streamingPath, 'utf8');
const extra = fs.readFileSync(path.join(here, 'streaming-extra.html'), 'utf8');
if (!streaming.includes('id="featured-streaming"')) {
  streaming = streaming.replace('<main>\n<section id="streaming"', `<main>\n${extra}\n<section id="streaming"`);
}
if (!streaming.includes('assets/streaming-extra.js')) {
  streaming = streaming.replace('</body>', '<script src="assets/streaming-extra.js"></script></body>');
}
streaming = streaming.replace('Netflix, Disney+, Prime Video, IPTV, Crunchyroll and an expanding range of entertainment services', 'Netflix, Disney+, Prime Video, Paramount+, HBO Max, Hulu, IPTV, Crunchyroll and an expanding range of entertainment services');
fs.writeFileSync(streamingPath, streaming);

for (const name of fs.readdirSync(site)) {
  if (!name.endsWith('.html')) continue;
  const file = path.join(site, name);
  let text = fs.readFileSync(file, 'utf8');
  if (name !== 'accounts.html') {
    text = text.replace(/(<a class="[^"]*" href="streaming\.html">Streaming<\/a>)(?!<a[^>]*accounts\.html)/, '$1<a class="" href="accounts.html">Accounts</a>');
    text = text.replace(/(<a href="streaming\.html">Streaming Services<\/a>)(?!<a[^>]*accounts\.html)/, '$1<a href="accounts.html">Digital Accounts</a>');
  }
  if (name === 'index.html' && !text.includes('href="accounts.html">Digital Accounts & Software')) {
    text = text.replace('<a class="btn ghost" href="streaming.html">Streaming Services</a>', '<a class="btn ghost" href="streaming.html">Streaming Services</a><a class="btn ghost" href="accounts.html">Digital Accounts & Software</a>');
    text = text.replace('<span>IPTV</span></div>', '<span>IPTV</span><span>CANVA PRO</span><span>MICROSOFT 365</span><span>ELEVENLABS</span></div>');
  }
  fs.writeFileSync(file, text);
}

const redirectsPath = path.join(site, '_redirects');
if (fs.existsSync(redirectsPath)) {
  let redirects = fs.readFileSync(redirectsPath, 'utf8');
  if (!redirects.includes('/accounts /accounts.html 200')) redirects += '\n/accounts /accounts.html 200\n/software /accounts.html 200\n';
  fs.writeFileSync(redirectsPath, redirects);
}

const sitemapPath = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  if (!sitemap.includes('https://amcshopping.com/accounts')) {
    sitemap = sitemap.replace('</urlset>', '  <url><loc>https://amcshopping.com/accounts</loc><lastmod>2026-10-21</lastmod></url>\n</urlset>');
    fs.writeFileSync(sitemapPath, sitemap);
  }
}

console.log('AMC v5.6 streaming and digital accounts injected into', site);
