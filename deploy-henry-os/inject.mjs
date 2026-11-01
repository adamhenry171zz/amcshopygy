import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');
if(!fs.existsSync(site))throw Error('Site directory not found');
const root=new URL('../henry-os/admin/',import.meta.url);
const dest=path.join(site,'admin');
fs.mkdirSync(dest,{recursive:true});
for(const name of ['index.html','styles.css','app.js','invoice-factory-preview.html','invoice-factory-preview.css','invoice-factory-preview.js'])fs.copyFileSync(new URL(name,root),path.join(dest,name));
const fnDir=path.resolve(site,'../netlify/functions');
fs.mkdirSync(fnDir,{recursive:true});
for(const name of ['henry-auth.mjs','henry-delivery-submit.mjs','henry-inquiry-submit.mjs','henry-track-status.mjs','henry-announcements.mjs'])fs.copyFileSync(new URL('../henry-os/functions/'+name,import.meta.url),path.join(fnDir,name));
fs.copyFileSync(new URL('../henry-os/functions/henry-amc.mjs',import.meta.url),path.join(fnDir,'henry-amc-core.mjs'));
fs.copyFileSync(new URL('../henry-os/functions/henry-amc-wrapper.mjs',import.meta.url),path.join(fnDir,'henry-amc.mjs'));
const assets=path.join(site,'assets');fs.mkdirSync(assets,{recursive:true});
fs.copyFileSync(new URL('../henry-os/public/henry-public.js',import.meta.url),path.join(assets,'henry-public.js'));
fs.copyFileSync(new URL('../henry-os/public/henry-tracking.js',import.meta.url),path.join(assets,'henry-tracking.js'));
fs.copyFileSync(new URL('../henry-os/public/henry-announcements.js',import.meta.url),path.join(assets,'henry-announcements.js'));
for(const name of fs.readdirSync(site).filter(n=>n.endsWith('.html'))){const p=path.join(site,name);let html=fs.readFileSync(p,'utf8');if(html.includes('data-netlify="true"')&&!html.includes('assets/henry-public.js'))html=html.replace(/<\/body>/i,'<script src="/assets/henry-public.js"></script></body>');if(name==='tracking.html'){html=html.replace(/<section\s+id="henry-amc-track"[\s\S]*?<\/section>\s*/gi,'');html=html.replace(/<script\s+src="\/assets\/henry-tracking\.js"><\/script>\s*/gi,'')}if(name==='announcement.html'&&!html.includes('id="henry-live-announcements"')){html=html.replace(/<\/main>/i,'<section id="henry-live-announcements" style="padding:20px 0 50px"></section></main>');html=html.replace(/<\/body>/i,'<script src="/assets/henry-announcements.js"></script></body>')}fs.writeFileSync(p,html)}
console.log('HENRY OS AMC command center, invoice reconciliation, CSP-safe invoice factory preview, inquiries, internal tracking and live announcements staged');
