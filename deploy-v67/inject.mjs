import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target=process.argv[2];
if(!target)throw new Error('Usage: node deploy-v67/inject.mjs <site-directory>');
const here=path.dirname(fileURLToPath(import.meta.url));
const site=path.resolve(target);
if(!fs.existsSync(site))throw new Error('Site directory not found');

const fnDir=path.resolve(site,'../netlify/functions');
fs.mkdirSync(fnDir,{recursive:true});
fs.copyFileSync(path.join(here,'generate-mailbox.mjs'),path.join(fnDir,'generate-mailbox.mjs'));

const mailboxPath=path.join(site,'mailbox.html');
if(fs.existsSync(mailboxPath)){
  let html=fs.readFileSync(mailboxPath,'utf8');
  html=html.replace('No account required. AMC automatically issues an unused five-digit mailbox code and stores it for future identification.','No account required. One AMC mailbox is issued per customer. If your WhatsApp number or email is already registered, we will return your existing mailbox instead of creating another one.');
  html=html.replace('Use your real name and WhatsApp number. AMC codes are issued once and should stay attached to your shipments.','Use your real name and WhatsApp number. Your AMC code is permanent — save it and reuse the same code for every shipment.');
  fs.writeFileSync(mailboxPath,html);
}

console.log('AMC v6.7 mailbox identity protection deployed');
