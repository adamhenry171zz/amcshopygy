
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
test('AMC Mega Sale injection, routes and countdown source',()=>{
 for(const p of ['inject.mjs','mega.js','status.mjs']){
  const syntax=spawnSync(process.execPath,['--check',path.join(here,p)],{encoding:'utf8'});
  assert.equal(syntax.status,0,p+': '+syntax.stderr);
 }
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'amc-mega-test-'));
 try{
  const site=path.join(root,'site');
  fs.mkdirSync(site,{recursive:true});
  const doc='<html><head><title>AMC Shopping</title><meta name="description" content="site"></head><body><header>Nav</header><main><section>Keep existing content</section></main><footer>Footer</footer></body></html>';
  for(const p of ['index.html','members.html','streaming.html','accounts.html','topups.html','announcement.html'])fs.writeFileSync(path.join(site,p),doc);
  fs.writeFileSync(path.join(site,'_redirects'),'/members /members.html 200\n');
  fs.writeFileSync(path.join(site,'sitemap.xml'),'<urlset></urlset>');
  const run=spawnSync(process.execPath,[path.join(here,'inject.mjs'),site],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const home=fs.readFileSync(path.join(site,'index.html'),'utf8');
  const sale=fs.readFileSync(path.join(site,'mega-sale.html'),'utf8');
  assert.match(home,/SOMETHING BIG/);
  assert.match(home,/Keep existing content/);
  assert.match(sale,/GYD \$2,500/);
  assert.match(sale,/GYD \$15,000/);
  assert.match(sale,/20% off eligible one-month subscriptions/);
  assert.match(sale,/availability and price are pending validation/);
  assert.match(fs.readFileSync(path.join(site,'_redirects'),'utf8'),/^\/mega-sale \/mega-sale\.html 200/m);
  assert.match(fs.readFileSync(path.join(site,'sitemap.xml'),'utf8'),/\/mega-sale/);
  assert.ok(fs.existsSync(path.join(root,'netlify/functions/mega-sale-status.mjs')));
  const script=fs.readFileSync(path.join(site,'assets/amc-mega.js'),'utf8');
  assert.match(script,/2026-11-27T18:00:00-04:00/);
  assert.match(script,/2026-11-27T22:00:00-04:00/);
  assert.match(script,/syncMemberCards/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
