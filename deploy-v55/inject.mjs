import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-v55/inject.mjs <site-directory>');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

// New/updated assets.
for (const name of ['quote-estimator.js','quote.js','shein-calculator.js','streaming.js']) {
  fs.copyFileSync(path.join(here, name), path.join(assets, name));
}
fs.copyFileSync(path.join(here, 'streaming.html'), path.join(site, 'streaming.html'));

const stylesPath = path.join(assets, 'styles.css');
const css = fs.readFileSync(path.join(here, 'v55.css'), 'utf8');
let styles = fs.readFileSync(stylesPath, 'utf8');
if (!styles.includes('v5.5 — Quote payment breakdown + separated Gaming / Streaming')) {
  fs.writeFileSync(stylesPath, `${styles}\n\n${css}\n`);
}

// --- Shop & Quote upgrades ---
const quotePath = path.join(site, 'quote.html');
let quote = fs.readFileSync(quotePath, 'utf8');
quote = quote.replace('<title>Request a Quote | AMC Shopping</title>', '<title>Shop & Request a Quote | AMC Shopping</title>');
quote = quote.replace('Submit SHEIN USA cart links, Amazon item links, screenshots and order details to AMC Shopping for a quotation.', 'Estimate AMC card-service payments and request quotations for SHEIN, Amazon, Temu, Walmart, eBay and other online stores.');
quote = quote.replace('<h1>Send the items.<br><span>We’ll quote it.</span></h1></div><p>Choose your store and submit the shopping details. No login or customer portal is required.</p>', '<h1>Know the payment.<br><span>Then request the quote.</span></h1></div><p>Estimate your card-service payment, choose the store you are shopping from and send AMC the links or cart details for verification.</p>');

const estimator = `<section id="payment-estimator" class="payment-estimator-section"><div class="wrap"><div class="section-head"><div><div class="kicker">CARD-SERVICE PAYMENT ESTIMATOR</div><h2>See what you pay now<br>and what comes later.</h2></div><p>For AMC card-service orders using the standard USD × GYD $360 rate, enter the USD order value to see the estimated down payment, balance on arrival and total card-service cost.</p></div><div class="quick-calc payment-estimator" data-card-service-estimator><div class="payment-input"><div class="field"><label>Order / cart value (USD)</label><div class="money-input"><span>US$</span><input type="number" min="0" step="0.01" inputmode="decimal" data-card-usd placeholder="13.00"></div></div><p>Use the item or cart subtotal shown by the store. AMC verifies the final amount before any order is placed.</p></div><div class="payment-breakdown"><div class="payment-card due-now"><small>DOWN PAYMENT</small><strong data-card-downpayment>GYD $0</strong><span>USD amount × GYD $240</span></div><div class="payment-card arrival"><small>BALANCE ON ARRIVAL</small><strong data-card-balance>GYD $0</strong><span>USD amount × GYD $120</span></div><div class="payment-card total"><small>TOTAL CARD-SERVICE COST</small><strong data-card-total>GYD $0</strong><span>USD amount × GYD $360</span></div></div><div class="payment-example" data-card-example>Example: US$13.00 → GYD $3,120 down payment + GYD $1,560 balance on arrival = GYD $4,680 total.</div><div class="notice"><strong>Important:</strong> This shows the standard card-service payment split. Shipping or weight charges can still apply depending on the store and item. For SHEIN, each individual item at 1–3 lbs has no extra weight charge; items above 3 lbs receive normal AMC shipping on the full billable weight.</div></div></div></section>`;
if (!quote.includes('data-card-service-estimator')) quote = quote.replace('<main><section id="shein-calculator">', `<main>${estimator}<section id="shein-calculator">`);

const oldSummary = '<div class="shein-summary"><div><small>Card-service subtotal</small><strong data-shein-card-subtotal>GYD $0</strong></div><div><small>Heavy-item shipping</small><strong data-shein-heavy-total>GYD $0</strong></div><div class="grand"><small>Estimated total</small><strong data-shein-grand-total>GYD $0</strong></div></div>';
const newSummary = '<div class="shein-summary expanded"><div><small>Card-service subtotal</small><strong data-shein-card-subtotal>GYD $0</strong></div><div class="due"><small>Down payment</small><strong data-shein-downpayment>GYD $0</strong><span>USD × GYD $240</span></div><div><small>Card-service balance</small><strong data-shein-card-balance>GYD $0</strong><span>USD × GYD $120</span></div><div><small>Heavy-item shipping</small><strong data-shein-heavy-total>GYD $0</strong><span>Only for an item above 3 lbs</span></div><div class="arrival"><small>Balance on arrival</small><strong data-shein-arrival-balance>GYD $0</strong><span>Card balance + heavy-item shipping</span></div><div class="grand"><small>Estimated overall total</small><strong data-shein-grand-total>GYD $0</strong></div></div>';
quote = quote.replace(oldSummary, newSummary);
quote = quote.replace('Quote each item.<br>See the total instantly.', 'Quote each item.<br>See the payment split.');

const how = `<section class="quote-how"><div class="wrap"><div class="section-head"><div><div class="kicker">HOW TO USE SHOP & QUOTE</div><h2>Four simple steps.</h2></div><p>You do not need an AMC account to request a quotation. Use the tools above for an estimate, then send AMC enough information to verify the order.</p></div><div class="quote-step-grid"><article><b>01</b><h3>Check the USD price</h3><p>Open the store in US pricing where applicable and note the order or item subtotal in USD.</p></article><article><b>02</b><h3>Estimate your payment</h3><p>See the expected down payment, balance on arrival and total card-service cost.</p></article><article><b>03</b><h3>Choose the store</h3><p>Select SHEIN, Amazon, Temu, Walmart, eBay or Other Store and paste the links with quantities, sizes and colours.</p></article><article><b>04</b><h3>Submit for confirmation</h3><p>AMC verifies stock, pricing, shipping details and the final amount, then contacts you.</p></article></div></div></section>`;
if (!quote.includes('HOW TO USE SHOP & QUOTE')) quote = quote.replace('<section id="quote-form">', `${how}<section id="quote-form">`);

quote = quote.replace('<div class="form-card"><h2>Full quotation request</h2><p>Submissions are delivered to AMC through Netlify Forms after the site is deployed.</p>', '<div class="form-card"><h2>Full quotation request</h2><p>Select where you are shopping from. AMC can quote more than SHEIN and Amazon.</p>');
quote = quote.replace('<div class="store-tabs"><button type="button" class="store-tab active" data-store="SHEIN">SHEIN</button><button type="button" class="store-tab" data-store="Amazon">Amazon</button></div>', '<div class="store-tabs"><button type="button" class="store-tab active" data-store="SHEIN">SHEIN</button><button type="button" class="store-tab" data-store="Amazon">Amazon</button><button type="button" class="store-tab" data-store="Temu">Temu</button><button type="button" class="store-tab" data-store="Walmart">Walmart</button><button type="button" class="store-tab" data-store="eBay">eBay</button><button type="button" class="store-tab" data-store="Other Store">Other Store</button></div>');

const genericPanel = '<div data-store-panel="GENERAL" hidden><div class="store-note"><strong data-generic-store-name>Store</strong>: Paste the exact product links or a cart/share link. AMC will verify the item, availability, region and final cost before confirming your quotation.</div><div class="field" data-other-store-name hidden><label>Website / store name *</label><input name="other-store-name" placeholder="Example: Fashion Nova, Target, Etsy, etc."></div><div style="height:12px"></div><div class="form-grid"><div class="field"><label>Product link 1</label><input name="store-link-1" type="url" placeholder="Paste product link"></div><div class="field"><label>Quantity 1</label><input name="store-qty-1" type="number" min="1" value="1"></div><div class="field"><label>Product link 2</label><input name="store-link-2" type="url" placeholder="Optional"></div><div class="field"><label>Quantity 2</label><input name="store-qty-2" type="number" min="1" value="1"></div><div class="field"><label>Product link 3</label><input name="store-link-3" type="url" placeholder="Optional"></div><div class="field"><label>Quantity 3</label><input name="store-qty-3" type="number" min="1" value="1"></div><div class="field full"><label>Cart / shared list link</label><input name="store-cart-link" type="url" placeholder="Optional cart or shared-list link"></div></div></div>';
const notesMarker = '<div class="form-divider"></div><div class="field"><label>Order notes</label>';
if (!quote.includes('data-store-panel="GENERAL"')) quote = quote.replace(notesMarker, `${genericPanel}${notesMarker}`);
quote = quote.replace('<script src="assets/app.js"></script><script src="assets/shein-calculator.js"></script><script src="assets/quote.js"></script>', '<script src="assets/app.js"></script><script src="assets/quote-estimator.js"></script><script src="assets/shein-calculator.js"></script><script src="assets/quote.js"></script>');
fs.writeFileSync(quotePath, quote);

// --- Separate Gaming from Streaming ---
const topupsPath = path.join(site, 'topups.html');
let topups = fs.readFileSync(topupsPath, 'utf8');
topups = topups.replace('<title>Gaming, TikTok, Gift Cards & Streaming | AMC Shopping</title>', '<title>Gaming Top-Ups, TikTok Coins & Gift Cards | AMC Shopping</title>');
topups = topups.replace('AMC Gaming & Digital: TikTok Coins, game top-ups, gift cards and streaming/subscription assistance in Guyana.', 'AMC Gaming & Top-Ups in Guyana: game credit, TikTok Coins, gift cards and digital top-up services.');
topups = topups.replace(/<section id="streaming" class="streaming-feature">[\s\S]*?<\/section>\s*(?=<section><div class="wrap">)/, '');
topups = topups.replace('AMC GAMING & DIGITAL', 'AMC GAMING & TOP-UPS');
topups = topups.replace('TikTok Coins, game top-ups, gift cards and streaming/subscription assistance — with clear AMC pricing where fixed and current-price requests where supplier costs move.', 'Game credit, TikTok Coins and gift cards now have their own dedicated AMC section. Streaming subscriptions are available separately so each service category can continue to grow.');
topups = topups.replace('Choose a listed package or request a current price. Streaming has its own section above; AMC confirms availability, region compatibility and payment details before processing.', 'Choose a listed package or request a current price. AMC confirms availability, region compatibility and payment details before processing.');
const splitNote = '<div class="service-split-note"><div><strong>Looking for Netflix, Disney+, Prime, IPTV or Crunchyroll?</strong><span>Streaming now has a separate dedicated page.</span></div><a class="btn ghost" href="streaming.html">View Streaming →</a></div>';
if (!topups.includes('service-split-note')) topups = topups.replace('<div class="notice" style="margin-bottom:24px">', `${splitNote}<div class="notice" style="margin-bottom:24px">`);
topups = topups.replace('Select any game, gift card, TikTok or streaming package above, or choose the service manually.', 'Select any game, gift card or TikTok package above, or choose the service manually.');
topups = topups.replace('Zone ID, platform, account region, streaming duration or anything AMC should verify.', 'Zone ID, platform, account region or anything AMC should verify.');
fs.writeFileSync(topupsPath, topups);

const topupsJsPath = path.join(assets, 'topups.js');
let topupsJs = fs.readFileSync(topupsJsPath, 'utf8');
topupsJs = topupsJs.replace('catalog.flatMap(section => (section.items || []).map(item => item.name))', 'otherSections.flatMap(section => (section.items || []).map(item => item.name))');
fs.writeFileSync(topupsJsPath, topupsJs);

// --- Global navigation/footer + homepage structure ---
const newDigitalBand = '<section class="digital-band"><div class="wrap"><div class="info-card digital-info"><div><div class="eyebrow"><i></i> AMC DIGITAL SERVICES</div><h2>Gaming and streaming.<br>Now easier to browse.</h2><p>Gaming top-ups, TikTok Coins and gift cards now have their own section, while Netflix, Disney+, Prime Video, IPTV, Crunchyroll and future entertainment services have a dedicated Streaming page.</p><div class="cta-actions" style="justify-content:flex-start;margin-top:18px"><a class="btn primary" href="topups.html">Gaming & Top-Ups</a><a class="btn ghost" href="streaming.html">Streaming Services</a></div></div><div class="digital-chips"><span>ROBLOX</span><span>RAZER GOLD</span><span>FREE FIRE</span><span>PUBG MOBILE</span><span>PLAYSTATION</span><span>TIKTOK</span><span>NETFLIX</span><span>DISNEY+</span><span>PRIME VIDEO</span><span>IPTV</span></div></div></div></section>';
for (const name of fs.readdirSync(site)) {
  if (!name.endsWith('.html') || name === 'streaming.html') continue;
  const file = path.join(site, name);
  let text = fs.readFileSync(file, 'utf8');
  text = text.replace(/<nav class="nav-links">([\s\S]*?)<\/nav>/, (whole, inner) => {
    if (inner.includes('href="streaming.html"')) return whole;
    const updated = inner.replace(/<a(?: class="([^"]*)")? href="topups\.html">(?:Gaming & Digital|Gaming)<\/a>/, (_m, cls) => `<a class="${cls || ''}" href="topups.html">Gaming</a><a class="" href="streaming.html">Streaming</a>`);
    return `<nav class="nav-links">${updated}</nav>`;
  });
  if (!text.includes('>Streaming Services</a>')) {
    text = text.replace(/<a href="topups\.html">(?:Gaming & Digital|Gaming & Top-Ups)<\/a>/, '<a href="topups.html">Gaming & Top-Ups</a><a href="streaming.html">Streaming Services</a>');
  }
  if (name === 'index.html' && text.includes('AMC GAMING & DIGITAL')) text = text.replace(/<section class="digital-band">[\s\S]*?<\/section>/, newDigitalBand);
  fs.writeFileSync(file, text);
}

const redirectsPath = path.join(site, '_redirects');
let redirects = fs.readFileSync(redirectsPath, 'utf8');
if (!redirects.includes('/streaming /streaming.html 200')) redirects = redirects.replace('/gaming /topups.html 200', '/gaming /topups.html 200\n/streaming /streaming.html 200');
fs.writeFileSync(redirectsPath, redirects);

const sitemapPath = path.join(site, 'sitemap.xml');
let sitemap = fs.readFileSync(sitemapPath, 'utf8');
if (!sitemap.includes('https://amcshopping.com/streaming')) sitemap = sitemap.replace('</urlset>', '<url><loc>https://amcshopping.com/streaming</loc><lastmod>2026-10-20</lastmod></url>\n</urlset>');
fs.writeFileSync(sitemapPath, sitemap);

console.log('AMC v5.5 quote + Gaming/Streaming upgrade injected into', site);
