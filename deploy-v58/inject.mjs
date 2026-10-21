import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-v58/inject.mjs <site-directory>');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

fs.copyFileSync(path.join(here, 'streaming-branding.js'), path.join(assets, 'streaming-branding.js'));

const stylesPath = path.join(assets, 'styles.css');
const css = fs.readFileSync(path.join(here, 'v58.css'), 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('v5.8 — streaming cleanup, service logos, Crunchyroll pricing')) {
  fs.writeFileSync(stylesPath, `${styles}\n\n${css}\n`);
}

const catalogPath = path.join(assets, 'digital-catalog.js');
if (fs.existsSync(catalogPath)) {
  let catalog = fs.readFileSync(catalogPath, 'utf8');
  if (!catalog.includes('AMC_V58_CRUNCHYROLL_PRICING')) {
    catalog += `\n;(() => {\n  const sections = Array.isArray(window.AMC_DIGITAL_CATALOG) ? window.AMC_DIGITAL_CATALOG : [];\n  const section = sections.find(s => s.section === 'Streaming & Entertainment');\n  const item = section?.items?.find(i => i.name === 'Crunchyroll');\n  if (item) {\n    item.packages = [\n      {label:'1 Month', price:'GYD $2,500'},\n      {label:'3 Months', price:'GYD $4,500'},\n      {label:'6 Months', price:'GYD $8,000'}\n    ];\n    item.note = 'Anime streaming access. AMC confirms current availability and account details before payment.';\n  }\n})(); // AMC_V58_CRUNCHYROLL_PRICING\n`;
    fs.writeFileSync(catalogPath, catalog);
  }
}

const streamingPath = path.join(site, 'streaming.html');
if (fs.existsSync(streamingPath)) {
  let streaming = fs.readFileSync(streamingPath, 'utf8');
  streaming = streaming.replace(/<figure class="streaming-flyer">[\s\S]*?<\/figure>/, '');
  streaming = streaming.replace('class="streaming-showcase"', 'class="streaming-showcase streaming-showcase-clean"');
  if (!streaming.includes('assets/streaming-branding.js')) {
    streaming = streaming.replace('</body>', '<script src="assets/streaming-branding.js"></script></body>');
  }
  streaming = streaming.replace('AMC Streaming Plans · current website price guide', '');
  fs.writeFileSync(streamingPath, streaming);
}

const sitemapPath = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  sitemap = sitemap.replace(/<loc>https:\/\/amcshopping\.com\/streaming<\/loc><lastmod>[^<]+<\/lastmod>/, '<loc>https://amcshopping.com/streaming</loc><lastmod>2026-10-21</lastmod>');
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log('AMC v5.8 streaming cleanup, logos and Crunchyroll pricing injected into', site);
