import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const backend=await readFile(new URL('../functions/henry-streaming-reminders.mjs',import.meta.url),'utf8');
const frontend=await readFile(new URL('../admin/streaming-reminders.js',import.meta.url),'utf8');
const page=await readFile(new URL('../admin/streaming-reminders.html',import.meta.url),'utf8');
const deploy=await readFile(new URL('../../deploy-henry-os/inject.mjs',import.meta.url),'utf8');
const index=await readFile(new URL('../admin/index.html',import.meta.url),'utf8');

const pure=backend.slice(backend.indexOf('const isoDate='),backend.indexOf('export default async'));
const helpers=new Function(pure+'; return {isoDate,classify,stageFor};')();
test('validates current date fields and never invents missing dates',()=>{
  assert.equal(helpers.isoDate('2026-11-05'),'2026-11-05');
  assert.equal(helpers.isoDate('2026-02-30'),'');
  assert.equal(helpers.classify('', '2026-11-05'),'needs_date');
  assert.equal(helpers.classify('2026-11-04','2026-11-05'),'past_date');
  assert.equal(helpers.classify('2026-11-05','2026-11-05'),'due_today');
  assert.equal(helpers.classify('2026-11-12','2026-11-05'),'due_soon');
  assert.equal(helpers.classify('2026-11-13','2026-11-05'),'upcoming');
});
test('reminder stage follows renewal date, not supplier billing date',()=>{
  assert.equal(helpers.stageFor('past_date'),'follow_up');
  assert.equal(helpers.stageFor('due_today'),'due_today');
  assert.equal(helpers.stageFor('due_soon'),'upcoming');
  assert.equal(helpers.stageFor('needs_date'),'');
  assert.equal(helpers.stageFor('upcoming'),'');
});
test('new reminder API reads old Netflix data, but never overwrites it',()=>{
  assert.ok(backend.includes("getStore('henry-amc')"));
  assert.ok(backend.includes("readAll(source,'streaming/')"));
  assert.ok(!backend.includes('source.setJSON('));
  assert.ok(!backend.includes('source.delete('));
  assert.ok(backend.includes("getStore('henry-streaming-reminders')"));
  assert.ok(backend.includes("context?.deploy?.context!=='production'"));
});
test('customer reminders are manually recorded, not silently sent',()=>{
  assert.ok(backend.includes('body.confirmedSent!==true'));
  assert.ok(backend.includes("stageFor(classify(dueDate,today))!==stage"));
  assert.ok(backend.includes('if(existing)return json('));
  assert.ok(!backend.includes('fetch('));
  assert.ok(frontend.includes('https://wa.me/'));
  assert.ok(frontend.includes('window.open('));
  assert.ok(frontend.includes('actually-sent'));
});
test('promotional update requires opt-in confirmation',()=>{
  assert.ok(backend.includes('body.includedRecommendation===true&&body.marketingConsentConfirmed!==true'));
  assert.ok(frontend.includes('customer opted in to promotional updates'));
  assert.ok(page.includes('recommended update'));
});
test('reminder page is included in Netlify build',()=>{
  assert.ok(index.includes('href="/admin/streaming-reminders.html"'));
  for(const filename of ['streaming-reminders.html','streaming-reminders.js','streaming-reminders.css','henry-streaming-reminders.mjs'])
    assert.ok(deploy.includes("'"+filename+"'"));
});
test('new browser and server JavaScript parse',()=>{
  assert.doesNotThrow(()=>new Function(frontend));
  assert.doesNotThrow(()=>new Function(backend.replace(/^import .*$/gm,'').replace('export default async','const handler=async')));
});
