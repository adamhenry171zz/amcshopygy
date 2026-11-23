import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');
if(!process.argv[2]||!fs.existsSync(site))throw Error('AMC site directory missing');
const assets=path.join(site,'assets'),admin=path.join(site,'admin'),functions=path.resolve(site,'../netlify/functions');
fs.mkdirSync(assets,{recursive:true});fs.mkdirSync(admin,{recursive:true});fs.mkdirSync(functions,{recursive:true});
const root=new URL('../henry-os/',import.meta.url);
for(const [source,target] of [
 ['functions/henry-amazon-tax.mjs',path.join(functions,'henry-amazon-tax.mjs')],
 ['public/amazon-tax.html',path.join(site,'amazon-tax.html')],
 ['public/amc-amazon-tax.js',path.join(assets,'amc-amazon-tax.js')],
 ['admin/amazon-tax-admin.html',path.join(admin,'amazon-tax-admin.html')],
 ['admin/amazon-tax-admin.js',path.join(admin,'amazon-tax-admin.js')]
])fs.copyFileSync(new URL(source,root),target);
const dashboard=path.join(admin,'index.html');
if(fs.existsSync(dashboard)){
 let html=fs.readFileSync(dashboard,'utf8');
 const nav='<a class="nav-item" href="/admin/amazon-tax-admin.html"><span>▤</span>Amazon Tax Documents</a>';
 if(!html.includes('amazon-tax-admin.html'))html=html.replace('<a class="nav-item" href="/admin/invoice-factory-preview.html">',nav+'<a class="nav-item" href="/admin/invoice-factory-preview.html">');
 fs.writeFileSync(dashboard,html);
}
const redir=path.join(site,'_redirects');
let r=fs.existsSync(redir)?fs.readFileSync(redir,'utf8'):'';
if(!r.includes('/amazon-tax '))fs.writeFileSync(redir,'/amazon-tax /amazon-tax.html 200\n'+r);
console.log('AMC tax receipt portal: private customer link, verified documents and HENRY OS owner access staged');
