import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-v64/inject.mjs <site-directory>');

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
const assets = path.join(site, 'assets');
fs.mkdirSync(assets, { recursive: true });

fs.copyFileSync(path.join(here, 'delivery.html'), path.join(site, 'delivery.html'));
fs.copyFileSync(path.join(here, 'v64-delivery.css'), path.join(assets, 'v64-delivery.css'));
fs.copyFileSync(path.join(here, 'v64-delivery.js'), path.join(assets, 'v64-delivery.js'));

const mailboxPath = path.join(site, 'mailbox.html');
if (fs.existsSync(mailboxPath)) {
  let html = fs.readFileSync(mailboxPath, 'utf8');
  html = html.replace(/\s*<section id="amc-delivery-v61"[\s\S]*?<\/section>\s*/i, '\n');
  fs.writeFileSync(mailboxPath, html);
}

const sitemapPath = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  sitemap = sitemap.replace(/\s*<url>\s*<loc>https:\/\/amcshopping\.com\/delivery(?:\.html)?<\/loc>[\s\S]*?<\/url>\s*/gi, '\n');
  fs.writeFileSync(sitemapPath, sitemap);
}

console.log('AMC v6.4 private delivery scheduler staged; mailbox delivery block removed');
