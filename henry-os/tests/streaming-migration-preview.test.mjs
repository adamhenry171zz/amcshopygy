import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser ESM as an isolated data module, without changing project package type.
const source = await readFile(new URL('../admin/streaming-migration-preview.js', import.meta.url), 'utf8');
const { parseCSV, strictDate, parseAmount, prepareMigration } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const headers = ['NAME','EMAIL','WHATSAPP NUMBER','ACCOUNT TYPE','DATE','AMOUNT',
  'Netflix Password','Gmail Password','ACCOUNT PAYMENT DATE','Payments',
  'DISCONNECT REQUIRED','DISCONNECTED','DISCONNECTED DATE','DISCONNECT NOTES',
  'SUBSCRIPTION ID','SERVICE','EXPIRY DATE'];
const make = (name,date,id,opts={}) => {
  const row=Array(headers.length).fill('');
  row[0]=name; row[1]='customer@example.invalid';
  row[2]=opts.noIdentity?'':'5926001234'; row[3]='PRIVATE'; row[4]=date||'';
  row[5]=opts.amount===undefined?'$ 5,000.00':opts.amount;
  row[6]='UNSAFE_SECRET_1';row[7]='UNSAFE_SECRET_2';
  row[8]=opts.provider||'2026/11/08';row[14]=id;row[16]=opts.expiry||'';
  if(opts.noIdentity){row[0]='';row[1]='';row[2]='';}
  return row;
};
const quote = row => row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',');

const dataset = [
  headers,
  make('October customer','2026/10/05','aaaaaaaa'),
  Array(headers.length).fill(''),
  make('December, prepaid','2026/12/15','bbbbbbbb'),
  make('September old','2026/09/20','cccccccc'),
  make('','', 'dddddddd',{noIdentity:true}),
  make('Future expiry only','','eeeeeeee',{expiry:'2027/01/10'}),
  make('November customer','2026/11/20','ffffffff'),
  make('Duplicate in CSV','2026/11/22','ffffffff'),
  make('Provider due only','','gggggggg',{provider:'2026/11/05'}),
  make('Missing amount','2026/10/05','hhhhhhhh',{amount:''})
].map(quote).join('\r\n');

test('CSV parser respects blank sheet rows and quoted commas',()=>{
  const parsed=parseCSV(dataset);
  assert.equal(parsed.length,11);
  assert.equal(parsed[2].every(x=>x===''),true);
  assert.equal(parsed[3][0],'December, prepaid');
});
test('year-first dates never misread November as February',()=>{
  assert.equal(strictDate('2026/11/02'),'2026-11-02');
  assert.equal(strictDate('2026/02/30'),'');
  assert.equal(strictDate('11/02/2026'),'');
});
test('amount formatting and bad-value protection',()=>{
  assert.equal(parseAmount('$ 5,000.00'),'5000.00');
  assert.equal(parseAmount('GYD 1,800.00'),'1800.00');
  assert.equal(parseAmount(''), '');
});
test('qualify Oct/Nov and future prepaid, do not use provider date as customer payment date',()=>{
  const v=prepareMigration(dataset, [], '2026-11-05');
  assert.deepEqual({ready:v.ready.length,review:v.review.length,ignored:v.ignored.length},
    {ready:4,review:4,ignored:1});
  assert.deepEqual(v.ready.map(x=>x.row),[2,4,7,8]);
  const expiry=v.ready.find(x=>x.customer==='Future expiry only');
  assert.equal(expiry.record.dueDate,'');
  assert.equal(v.ready.find(x=>x.customer==='October customer').record.status,'active');
  assert.equal(v.ready.find(x=>x.customer==='October customer').record.dueDate,'');
  assert.match(v.ready.find(x=>x.customer==='October customer').record.notes,/2026-10-05/);
  assert.equal(v.ready.find(x=>x.customer==='December, prepaid').record.dueDate,'2026-12-15');
  assert.ok(v.review.some(x=>x.customer==='Provider due only'));
});
test('no passwords, PINs, or payment records in payload',()=>{
  const v=prepareMigration(dataset, [], '2026-11-05');
  for(const x of v.ready){
    const packed=JSON.stringify(x.record);
    assert.ok(!packed.includes('UNSAFE_SECRET'));
    assert.deepEqual(Object.keys(x.record).sort(),[
      'accountEmail','amount','customer','dueDate','notes','plan','service','status','whatsapp'
    ].sort());
  }
});
test('idempotent: skip an already imported subscription without overwriting it',()=>{
  const v=prepareMigration(dataset,[{id:'netflix-aaaaaaaa',customer:'October customer',service:'Netflix'}],'2026-11-05');
  assert.equal(v.ready.length,3);
  assert.equal(v.existing.length,1);
});