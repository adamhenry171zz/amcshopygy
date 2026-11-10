import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const inject=path.join(here,'inject.mjs');
test('course removed from public site and fragrance landing becomes main navigation replacement',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'amc-fragrance-'));
 try{
  fs.mkdirSync(path.join(temp,'assets'));
  fs.writeFileSync(path.join(temp,'course.html'),'<h1>Courses are taking deposits</h1>');
  fs.writeFileSync(path.join(temp,'index.html'),'<html><head></head><body><header></header><div class="nav-links"><a class="" href="members.html">Members</a><a class="" href="course">Course</a></div><div class="footer-col"><strong>Shopping & Learning</strong><a href="course">Income Blueprint</a></div><main></main></body></html>');
  fs.writeFileSync(path.join(temp,'quote.html'),'<html><head></head><body><nav class="nav-links"><a class="" href="course">Course</a></nav></body></html>');
  fs.writeFileSync(path.join(temp,'_redirects'),'/tracking /tracking.html 200\n/course /course.html 200\n');
  fs.writeFileSync(path.join(temp,'sitemap.xml'),'<?xml version="1.0"?><urlset><url><loc>https://amcshopping.com/course</loc><lastmod>2026-10-16</lastmod></url></urlset>');
  const result=spawnSync(process.execPath,[inject,temp],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.existsSync(path.join(temp,'course.html')),false);
  const index=fs.readFileSync(path.join(temp,'index.html'),'utf8');
  const quote=fs.readFileSync(path.join(temp,'quote.html'),'utf8');
  const landing=fs.readFileSync(path.join(temp,'fragrances.html'),'utf8');
  const redirects=fs.readFileSync(path.join(temp,'_redirects'),'utf8');
  const sitemap=fs.readFileSync(path.join(temp,'sitemap.xml'),'utf8');
  assert.match(index,/href="fragrances">Fragrances<\/a>/);
  assert.match(index,/frag-site-banner/);
  assert.match(index,/assets\/fragrance-promo\.css/);
  assert.match(index,/Wholesale Fragrances/);
  assert.doesNotMatch(index,/href="course"/);
  assert.doesNotMatch(quote,/href="course"/);
  assert.match(landing,/Wholesale pricing starts at <strong>3 pieces<\/strong>/);
  assert.match(landing,/id="frag-request"/);
  assert.match(landing,/https:\/\/wa\.me\/5926042826/);
  assert.match(redirects,/\/course \/fragrances 302/);
  assert.match(redirects,/\/fragrances \/fragrances\.html 200/);
  assert.doesNotMatch(redirects,/\/course \/course\.html 200/);
  assert.match(sitemap,/https:\/\/amcshopping\.com\/fragrances/);
  assert.doesNotMatch(sitemap,/https:\/\/amcshopping\.com\/course/);
  assert.ok(fs.existsSync(path.join(temp,'assets','fragrance-promo.css')));
  // Repeatable without duplicate nav/promos/redirects.
  const second=spawnSync(process.execPath,[inject,temp],{encoding:'utf8'});
  assert.equal(second.status,0,second.stderr);
  const twice=fs.readFileSync(path.join(temp,'index.html'),'utf8');
  assert.equal((twice.match(/frag-site-banner/g)||[]).length,1);
  assert.equal((fs.readFileSync(path.join(temp,'_redirects'),'utf8').match(/\/fragrances \/fragrances\.html 200/g)||[]).length,1);
 }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
