import fs from 'node:fs';
import path from 'node:path';
const site=path.resolve(process.argv[2]||'');
if(!site||!fs.existsSync(site)) throw new Error('Site directory required');
const file=path.join(site,'mailbox.html');
if(!fs.existsSync(file)) throw new Error('mailbox.html not found');
let html=fs.readFileSync(file,'utf8');
if(html.includes('id="amc-delivery-v61"')) {console.log('Delivery section already present');process.exit(0)}
const section=fs.readFileSync(new URL('./delivery.html',import.meta.url),'utf8');
if(/<\/main>/i.test(html)) html=html.replace(/<\/main>/i,section+'\n</main>');
else if(/<\/body>/i.test(html)) html=html.replace(/<\/body>/i,section+'\n</body>');
else throw new Error('No safe insertion point in mailbox.html');
fs.writeFileSync(file,html);
console.log('Added delivery information and WhatsApp request builder to mailbox.html');
