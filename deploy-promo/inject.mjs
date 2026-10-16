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

const promoStrip = '<div class="promo-strip" data-membership-promo><div class="wrap"><span><strong>WEBSITE RELAUNCH SPECIAL</strong> · 25% OFF your first AMC Members Club payment for 5 days only</span><a href="announcement.html">View announcement →</a></div></div>';
const homeFeature = '<section class="home-promo-feature" data-membership-promo><div class="wrap"><div class="home-promo-card"><div><div class="kicker">WEBSITE RELAUNCH SPECIAL</div><h2>25% OFF AMC Members Club.</h2><p>Join during our five-day relaunch offer and save 25% on your first membership payment.</p></div><div class="home-promo-actions"><div class="mini-countdown" data-promo-countdown data-end="2026-10-20T23:59:59-04:00"><b data-days>04</b><span>days left</span></div><a class="btn primary" href="announcement.html">View the offer →</a></div></div></div></section>';
const memberFeature = '<div class="member-relaunch-offer" data-membership-promo><div><div class="kicker">5-DAY WEBSITE RELAUNCH OFFER</div><h2>Get 25% off your first membership payment.</h2><p>Join by October 20, 2026 at 11:59 PM GYT and save on any AMC Members Club plan.</p></div><div><a class="btn primary" href="announcement.html">See discounted prices →</a></div></div>';

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
