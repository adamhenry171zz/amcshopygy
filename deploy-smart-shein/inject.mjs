import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');if(!process.argv[2]||!fs.existsSync(site))throw Error('Site directory missing.');
const assets=path.join(site,'assets'),admin=path.join(site,'admin'),functions=path.resolve(site,'../netlify/functions');
fs.mkdirSync(assets,{recursive:true});fs.mkdirSync(admin,{recursive:true});fs.mkdirSync(functions,{recursive:true});
const root=new URL('../henry-os/',import.meta.url);
for(const [src,dst] of [
 ['public/smart-shein-quote.js',path.join(assets,'smart-shein-quote.js')],
 ['public/smart-shein-quote.css',path.join(assets,'smart-shein-quote.css')],
 ['admin/smart-shein-admin.html',path.join(admin,'smart-shein-admin.html')],
 ['admin/smart-shein-admin.js',path.join(admin,'smart-shein-admin.js')],
 ['admin/smart-shein-admin.css',path.join(admin,'smart-shein-admin.css')],
 ['functions/henry-shein-quotes.mjs',path.join(functions,'henry-shein-quotes.mjs')],
 ['functions/henry-shein-quote-rules.mjs',path.join(functions,'henry-shein-quote-rules.mjs')]
])fs.copyFileSync(new URL(src,root),dst);
const quoteFile=path.join(site,'quote.html');let page=fs.readFileSync(quoteFile,'utf8');
const panel=String.raw`<section id="smart-shein-quote"><div class="wrap"><div class="sq-card"><span class="sq-kicker">SMART SHEIN QUOTATION · PREVIEW</span><h2>Share your SHEIN cart. Request a quote.</h2><p>Send your USA cart link, confirm product details, and let AMC review your quotation. No account needed. Use fictional contact details in this preview.</p><form id="sq-form"><div class="sq-grid"><label>Full name<input id="sq-name" required maxlength="160" autocomplete="name"></label><label>WhatsApp number<input id="sq-phone" required type="tel" autocomplete="tel"></label><label>Email (optional)<input id="sq-email" type="email"></label><label>SHEIN share link<input id="sq-link" type="url" placeholder="https://onelink.shein.com/..."></label></div><label class="sq-check"><input type="checkbox" id="sq-us" required> I confirm my store is set to United States and prices are USD.</label><button type="button" class="sq-secondary" id="sq-extract">Check share link</button><p class="sq-note">Automatic link extraction is not available until an approved provider is configured. You can still send the link and supporting details.</p><details><summary>Import product details from a spreadsheet</summary><p>Copy a table containing product name, USD unit price, quantity, size and colour. The import can also accept product links, SKU, image URL and weight.</p><label>Paste table (tab-separated)<textarea id="sq-paste" placeholder="Name	Price	Quantity	Size	Colour"></textarea></label><button type="button" class="sq-secondary" id="sq-import">Import product rows</button></details><h3>Review or add items</h3><div id="sq-rows"></div><button id="sq-add" class="sq-secondary" type="button">+ Add item</button><label>Cart screenshots (optional, 3 maximum, 1 MB each)<input id="sq-files" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><label>Order notes / coupon information<textarea id="sq-notes" maxlength="2000"></textarea></label><label class="sq-trap" aria-hidden="true">Leave blank<input id="sq-trap" tabindex="-1" autocomplete="off"></label><button type="submit" id="sq-submit">Submit SHEIN quotation request</button><p id="sq-msg" role="status" aria-live="polite"></p><p class="sq-note">Prices, stock, discounts, checkout shipping and final weight are subject to AMC verification. Submitting does not place an order.</p></form></div></div></section>`;
if(!page.includes('id="smart-shein-quote"')){
 if(!page.includes('<section id="quote-form">'))throw Error('Existing quote form marker not found. Avoid unsafe replacement.');
 page=page.replace('<section id="quote-form">',panel+'<section id="quote-form">');
 page=page.replace(/<\/head>/i,'<link rel="stylesheet" href="/assets/smart-shein-quote.css"></head>');
 page=page.replace(/<\/body>/i,'<script src="/assets/smart-shein-quote.js" defer></script></body>');
 fs.writeFileSync(quoteFile,page);
}
const dashboard=path.join(admin,'index.html');let html=fs.readFileSync(dashboard,'utf8');
if(!html.includes('smart-shein-admin.html')){
 const marker='<a class="nav-item" href="/admin/invoice-factory-preview.html">';
 if(!html.includes(marker))throw Error('Existing HENRY OS navigation marker not found.');
 html=html.replace(marker,'<a class="nav-item" href="/admin/smart-shein-admin.html"><span>▤</span>Smart SHEIN Quotes</a>'+marker);fs.writeFileSync(dashboard,html);
}
console.log('Smart SHEIN quotation preview integrated without replacing legacy quote forms.');
