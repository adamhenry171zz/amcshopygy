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
for(const name of ['henry-auth.mjs','henry-amc.mjs','henry-delivery-submit.mjs','henry-inquiry-submit.mjs'])fs.copyFileSync(new URL('../henry-os/functions/'+name,import.meta.url),path.join(fnDir,name));
const assets=path.join(site,'assets');fs.mkdirSync(assets,{recursive:true});
fs.copyFileSync(new URL('../henry-os/public/henry-public.js',import.meta.url),path.join(assets,'henry-public.js'));
for(const name of fs.readdirSync(site).filter(n=>n.endsWith('.html'))){const p=path.join(site,name);let html=fs.readFileSync(p,'utf8');if(html.includes('data-netlify="true"')&&!html.includes('assets/henry-public.js')){html=html.replace(/<\/body>/i,'<script src="/assets/henry-public.js"></script></body>');fs.writeFileSync(p,html)}}
console.log('HENRY OS AMC command center, owner functions and website inquiry capture staged for /admin');
