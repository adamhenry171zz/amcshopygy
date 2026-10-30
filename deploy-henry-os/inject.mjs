import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');
if(!fs.existsSync(site))throw Error('Site directory not found');
const root=new URL('../henry-os/admin/',import.meta.url);
const dest=path.join(site,'admin');
fs.mkdirSync(dest,{recursive:true});
for(const name of ['index.html','styles.css','app.js'])fs.copyFileSync(new URL(name,root),path.join(dest,name));
const fnDir=path.resolve(site,'../netlify/functions');
fs.mkdirSync(fnDir,{recursive:true});
for(const name of ['henry-auth.mjs','henry-amc.mjs','henry-delivery-submit.mjs','henry-inquiry-submit.mjs','henry-track-status.mjs'])fs.copyFileSync(new URL('../henry-os/functions/'+name,import.meta.url),path.join(fnDir,name));
const assets=path.join(site,'assets');fs.mkdirSync(assets,{recursive:true});
fs.copyFileSync(new URL('../henry-os/public/henry-public.js',import.meta.url),path.join(assets,'henry-public.js'));
fs.copyFileSync(new URL('../henry-os/public/henry-tracking.js',import.meta.url),path.join(assets,'henry-tracking.js'));
for(const name of fs.readdirSync(site).filter(n=>n.endsWith('.html'))){const p=path.join(site,name);let html=fs.readFileSync(p,'utf8');if(html.includes('data-netlify="true"')&&!html.includes('assets/henry-public.js'))html=html.replace(/<\/body>/i,'<script src="/assets/henry-public.js"></script></body>');if(name==='tracking.html'&&!html.includes('id="henry-amc-track"')){const tracker=`<section id="henry-amc-track"><div class="wrap"><div style="max-width:900px;margin:0 auto 26px;padding:24px;border:1px solid #cfe3f5;border-radius:20px;background:#f7fbff;color:#123451"><div class="kicker">AMC INTERNAL STATUS</div><h2 style="margin:8px 0 6px">Check AMC's package record</h2><p style="margin-top:0">If AMC has already entered your tracking number into Henry OS, you can see its current AMC processing status here. This is separate from the carrier tracker below.</p><form id="henry-amc-track-form" style="display:flex;gap:10px;flex-wrap:wrap"><input id="henry-amc-track-input" required placeholder="Enter tracking number" style="flex:1;min-width:230px;padding:13px;border:1px solid #aac8df;border-radius:12px"><button class="btn primary" type="submit">Check AMC status →</button></form><div id="henry-amc-track-result" style="display:grid;gap:5px;margin-top:14px;color:#1e4c70"><span>Only package status information is returned. Customer and payment details remain private.</span></div></div></div></section>`;html=html.replace(/<main>/i,'<main>'+tracker);html=html.replace(/<\/body>/i,'<script src="/assets/henry-tracking.js"></script></body>')}fs.writeFileSync(p,html)}
console.log('HENRY OS AMC command center, website inquiries and internal tracking staged');
