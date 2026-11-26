import fs from 'node:fs';
import path from 'node:path';
import {redesignQuotePage} from './quote-layout.mjs';
// The owner must explicitly authorize production release; branch previews remain testable.
if(process.env.CONTEXT==='production'&&process.env.AMC_SMART_SHEIN_ENABLE_PRODUCTION!=='true'){console.log('Smart SHEIN feature is disabled for production.');process.exit(0)}
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
 ['functions/henry-shein-quote-rules.mjs',path.join(functions,'henry-shein-quote-rules.mjs')],
 ['functions/henry-smart-quote-ai.mjs',path.join(functions,'henry-smart-quote-ai.mjs')],
 ['functions/henry-smart-quote-pdf.mjs',path.join(functions,'henry-smart-quote-pdf.mjs')],
 ['functions/henry-tax-logo.mjs',path.join(functions,'henry-tax-logo.mjs')]
])fs.copyFileSync(new URL(src,root),dst);
const quoteFile=path.join(site,'quote.html');
const page=fs.readFileSync(quoteFile,'utf8');
fs.writeFileSync(quoteFile,redesignQuotePage(page,{preview:process.env.CONTEXT!=='production'}));
const dashboard=path.join(admin,'index.html');let html=fs.readFileSync(dashboard,'utf8');
if(!html.includes('smart-shein-admin.html')){
 const marker='<a class="nav-item" href="/admin/invoice-factory-preview.html">';
 if(!html.includes(marker))throw Error('Existing HENRY OS navigation marker not found.');
 html=html.replace(marker,'<a class="nav-item" href="/admin/smart-shein-admin.html"><span>▤</span>Smart Quotations</a>'+marker);fs.writeFileSync(dashboard,html);
}
console.log('AMC Smart Quotations layout integrated; original price calculators preserved.');
