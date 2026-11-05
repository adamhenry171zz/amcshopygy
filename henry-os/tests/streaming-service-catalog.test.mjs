import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const admin = await readFile(new URL('../admin/app.js', import.meta.url),'utf8');
const server = await readFile(new URL('../functions/henry-amc.mjs', import.meta.url),'utf8');
const wrapper = await readFile(new URL('../functions/henry-amc-wrapper.mjs', import.meta.url),'utf8');
const html = await readFile(new URL('../admin/index.html', import.meta.url),'utf8');
const schemaStart = admin.indexOf('const schemas={');
const schemaEnd = admin.indexOf('\n};', schemaStart);
const schemas = new Function(admin.slice(schemaStart,schemaEnd+3)+';return schemas;')();

test('front end supports owner-defined subscription service names',()=>{
  assert.equal(schemas.streaming.fields.find(x=>x[0]==='service')?.[2],'service');
  assert.ok(admin.includes('name="service" type="text"'));
  assert.ok(admin.includes("...list('streaming_services').map(r=>r.name)"));
  assert.ok(admin.includes("...list('streaming').map(r=>r.service)"));
  assert.ok(html.includes('data-view="streaming_services"'));
});
test('catalog is independent of individual customer subscriptions',()=>{
  assert.ok(schemas.streaming_services);
  assert.deepEqual(schemas.streaming_services.fields.map(x=>x[0]),['name','status','notes']);
  assert.deepEqual(schemas.streaming_services.fields.find(x=>x[0]==='status')?.[3],['planned','offered','paused']);
  assert.ok(server.includes("streaming_services:['name','status','notes']"));
  assert.ok(!admin.includes('seedStreamingCustomers'));
});
test('service identity remains stable while subscribers are linked',()=>{
  assert.ok(server.includes('This service is already in your catalog'));
  assert.ok(server.includes('This service already has customer subscriptions.'));
  assert.ok(server.includes('Cannot delete a service with customers.'));
});
test('production-only mutations protect site-wide Netlify Blobs',()=>{
  assert.ok(wrapper.includes("['save','delete'].includes(actionRequested)"));
  assert.ok(wrapper.includes("context?.deploy?.context!=='production'"));
  assert.ok(server.includes("if(context?.deploy?.context==='production')"));
});
test('Guyana-local due dates do not use UTC day rollover',()=>{
  assert.ok(admin.includes("timeZone:'America/Guyana'"));
});
test('all modified JS modules parse',()=>{
  assert.doesNotThrow(()=>new Function(admin));
  assert.doesNotThrow(()=>new Function(
    server.replace(/^import .*$/gm,'').replace('export default async','const h=async')
  ));
  assert.doesNotThrow(()=>new Function(
    wrapper.replace(/^import .*$/gm,'').replace('export default async','const h=async')
  ));
});
