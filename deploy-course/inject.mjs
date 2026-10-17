import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
if (!target) throw new Error('Usage: node deploy-course/inject.mjs <site-directory>');

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(target);
fs.copyFileSync(path.join(here, 'course.html'), path.join(site, 'course.html'));

for (const name of fs.readdirSync(site)) {
  if (!name.endsWith('.html') || name === 'course.html') continue;
  const file = path.join(site, name);
  let text = fs.readFileSync(file, 'utf8');

  if (!text.includes('href="course">Course</a>')) {
    text = text.replace(/(<a class="(?:active|)" href="members\.html">Members<\/a>)/, '<a class="" href="course">Course</a>$1');
  }

  if (!text.includes('>Income Blueprint</a>')) {
    text = text.replace('<div class="footer-col"><strong>Shopping</strong>', '<div class="footer-col"><strong>Shopping & Learning</strong><a href="course">Income Blueprint</a>');
  }

  fs.writeFileSync(file, text);
}

const redirects = path.join(site, '_redirects');
if (fs.existsSync(redirects)) {
  let text = fs.readFileSync(redirects, 'utf8');
  if (!text.includes('/course /course.html 200')) text += '\n/course /course.html 200\n';
  fs.writeFileSync(redirects, text);
}

const sitemap = path.join(site, 'sitemap.xml');
if (fs.existsSync(sitemap)) {
  let text = fs.readFileSync(sitemap, 'utf8');
  if (!text.includes('https://amcshopping.com/course')) {
    text = text.replace('</urlset>', '  <url><loc>https://amcshopping.com/course</loc><lastmod>2026-10-16</lastmod></url>\n</urlset>');
    fs.writeFileSync(sitemap, text);
  }
}

console.log('AMC Online Shopping Income Blueprint injected into', site);
