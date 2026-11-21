import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-promo/inject.mjs <site-directory>');

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

fs.copyFileSync(path.join(here, 'announcement.html'), path.join(site, 'announcement.html'));
fs.copyFileSync(path.join(here, 'promo.css'), path.join(assets, 'promo.css'));
fs.copyFileSync(path.join(here, 'promo.js'), path.join(assets, 'promo.js'));

const promoStrip = ''; // October relaunch promotion expired.
const homeFeature = ''; // No expired homepage relaunch card.
const memberFeature = ''; // No expired member offer.

for (const name of fs.readdirSync(site)) {
  if (!name.endsWith('.html') || name === 'announcement.html') continue;
  const file = path.join(site, name);
  let text = fs.readFileSync(file, 'utf8');

  if (!text.includes('assets/promo.css')) text = text.replace('</head>', '<link rel="stylesheet" href="assets/promo.css">\n</head>');

  if (!text.includes('data-membership-promo')) {
    text = text.replace(/(<div class="topbar">[\s\S]*?<\/div><\/div>)/, `$1\n${promoStrip}`);
  }

  if (name === 'index.html' && !text.includes('home-promo-feature')) text = text.replace('<main>', `<main>\n${homeFeature}`);

  if (name === 'members.html' && !text.includes('member-relaunch-offer')) {
    const marker = '<main><section><div class="wrap">';
    text = text.replace(marker, marker + memberFeature);
  }

  if (!text.includes('assets/promo.js')) text = text.replace('</body>', '<script src="assets/promo.js"></script>\n</body>');
  fs.writeFileSync(file, text);
}

const sitemap = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemap)) {
  let text = fs.readFileSync(sitemap, 'utf8');
  if (!text.includes('announcement.html')) {
    text = text.replace('</urlset>', '  <url><loc>https://amcshopping.com/announcement.html</loc><lastmod>2026-10-16</lastmod></url>\n</urlset>');
    fs.writeFileSync(sitemap, text);
  }
}

console.log('AMC v5.3 relaunch promotion injected into', site);
