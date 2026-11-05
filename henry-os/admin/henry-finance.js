const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'GYD $'+(Number(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const text=v=>String(v??'').trim();
const today=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(v=>v.type===k)?.value).join('-')};
const pill=s=>'<span class="chip '+esc(s)+'">'+esc(String(s||'—').replaceAll('_',' '))+'</span>';
const preview=/^(deploy-preview-\d+--|agent-)/.test(location.hostname)||location.hostname.includes('netlify.app')&&!location.hostname.startsWith('preeminent-blancmange-');
const state={data:null,tab:'suppliers',working:false};
const opts=(items,value='id',label='name',placeholder='Select…')=>'<option value="">'+esc(placeholder)+'</option>'+items.map(o=>'<option value="'+esc(o[value])+'">'+esc(o[label]||'Unnamed')+'</option>').join('');
const formatDate=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
const showMessage=(s,error=false)=>{const node=$('flash');node.textContent=s;node.className='flash'+(error?' error':'');setTimeout(()=>{if(node.textContent===s)node.classList.add('hidden')},5000)};
async function api(action,method='GET',body){
  const response=await fetch('/.netlify/functions/henry-finance?action='+encodeURIComponent(action),{
    method,credentials:'same-origin',headers:{'Content-Type':'application/json'},cache:'no-store',
    body:body?JSON.stringify(body):undefined
  });
  let data={};try{data=await response.json()}catch{}
  if(response.status===401){$('finance-app').classList.add('hidden');$('login-notice').classList.remove('hidden');throw Error('Owner session expired. Sign in again.')}
  if(!response.ok)throw Error(data.error||'Unable to complete request');
  return data;
}
async function reload(){
  $('loading').classList.remove('hidden');
  try{
    const response=await fetch('/.netlify/functions/henry-auth?action=session',{credentials:'same-origin',cache:'no-store'});
    const status=await response.json();
    if(!status.authenticated){$('login-notice').classList.remove('hidden');$('finance-app').classList.add('hidden');return;}
    $('login-notice').classList.add('hidden');
    state.data=await api('bootstrap');$('finance-app').classList.remove('hidden');$('refresh').disabled=false;
    render();
  }catch(e){showMessage(e.message,true)}finally{$('loading').classList.add('hidden')}
}
function render(){
  const d=state.data;if(!d)return;
  const verified=d.receipts.filter(r=>r.status==='verified').reduce((n,r)=>n+Number(r.amountGyd),0);
  const paidBills=d.bills.reduce((n,b)=>n+Number(b.paidGyd),0);
  const billsDue=d.bills.reduce((n,b)=>n+Number(b.balanceGyd),0);
  const upcoming=d.suppliers.filter(s=>s.status==='active'&&s.nextExpectedBillDates?.length).length;
  $('metrics').innerHTML=[
    ['Verified receipts (this module)',money(verified),'Not total AMC revenue'],
    ['Supplier payments confirmed',money(paidBills),'This Phase 1 workspace only'],
    ['Confirmed supplier bills unpaid',money(billsDue),'Does not include estimates'],
    ['Accounts with scheduled bills',String(upcoming),'Schedules are projections']
  ].map(([name,value,sub])=>'<article class="metric"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong><p>'+esc(sub)+'</p></article>').join('');
  document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===state.tab));
  $('tab-body').innerHTML=state.tab==='suppliers'?renderSuppliers():state.tab==='memberships'?renderMemberships():renderReceipts();
  if(preview){
    $('tab-body').querySelectorAll('form button[type=submit]').forEach(el=>{el.disabled=true;el.title='Preview is read-only'});
    if(!$('preview-message'))$('tab-body').insertAdjacentHTML('afterbegin','<div class="notice" id="preview-message"><strong>Read-only deployment preview.</strong> You can inspect the interface, but changes can be made only on the approved production site.</div>');
  }
  wireForms();
}
function renderSuppliers(){
  const d=state.data;const accounts=d.suppliers, bills=d.bills;
  const supplierOptions=opts(accounts.filter(s=>s.status==='active'),'id','accountLabel','Select supplier account…');
  const billOptions=opts(bills.filter(b=>Number(b.balanceGyd)>0),'id','accountLabel','Select unpaid bill…');
  return '<div class="section-title"><div><h2>Supplier Accounts</h2><p>Netflix and future provider billing is separate from customer renewal dates.</p></div></div>'+
    '<div class="two-col"><section class="card"><h3>Add supplier account</h3><p class="sub">Use an account label only. Never enter passwords, card numbers or account PINs.</p>'+
    '<form class="form" data-form="supplier"><label>Supplier / provider<input name="name" required maxlength="120" placeholder="Netflix"></label><label>Service<input name="service" required maxlength="80" placeholder="Netflix"></label><label>Account label<input name="accountLabel" required maxlength="120" placeholder="Account A"></label>'+
    '<div class="grid-fields"><label>Estimated charge<input name="estimatedAmount" type="number" min="0.01" step=".01" required placeholder="15.00"></label><label>Currency<select name="currency" id="supplier-currency"><option>USD</option><option>GYD</option></select></label></div>'+
    '<div class="grid-fields"><label>GYD per USD rate<input name="exchangeRate" type="number" step=".01" min=".01" placeholder="Confirm actual exchange rate"></label><label>First expected bill date<input name="firstDueDate" type="date" required></label></div>'+
    '<label>Billing cycle<select name="recurrence"><option value="monthly">Monthly</option><option value="one_time">One-time</option></select></label>'+
    '<label>Link existing customer subscriptions (optional)<select name="linkedSubscriptionIds" multiple size="4">'+d.streaming.map(s=>'<option value="'+esc(s.id)+'">'+esc((s.customer||'Customer')+' · '+(s.service||'Streaming'))+'</option>').join('')+'</select></label>'+
    '<label>Internal notes<textarea name="notes" placeholder="No login credentials here"></textarea></label><button class="btn wide" type="submit">Add supplier account</button></form></section>'+
    '<section class="card"><h3>Recurring billing schedule</h3><p class="sub">Upcoming expected charges are calculated automatically; no bill or expense is created until you confirm an actual charge.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Account</th><th>Estimated cost</th><th>Next scheduled dates</th><th>Status</th></tr></thead><tbody>'+
    (accounts.length?accounts.map(s=>'<tr><td><strong>'+esc(s.accountLabel)+'</strong><small>'+esc(s.name)+' · '+esc(s.service)+' · '+esc(s.recurrence.replaceAll('_',' '))+' · '+(s.linkedSubscriptionIds?.length||0)+' linked subscription(s)</small></td><td>'+esc(s.estimate.originalAmount)+' '+esc(s.estimate.currency)+'<small>'+money(s.estimate.gydAmount)+' estimate</small></td><td>'+((s.nextExpectedBillDates||[]).slice(0,3).map(formatDate).join(' · ')||'No upcoming dates')+'</td><td>'+pill(s.status)+'<div class="action-inline" style="margin-top:8px"><button type="button" class="outline" data-pause="'+esc(s.id)+'" data-status="'+(s.status==='active'?'paused':'active')+'">'+(s.status==='active'?'Pause':'Resume')+'</button><button type="button" class="outline" data-edit-supplier="'+esc(s.id)+'">Edit schedule</button></div></td></tr>').join(''):'<tr><td colspan="4" class="empty">No supplier accounts entered yet.</td></tr>')+
    '</tbody></table></div></section></div>'+
    '<div class="two-col"><section class="card"><h3>Confirm an actual supplier bill</h3><p class="sub">A scheduled estimate becomes an unpaid supplier obligation only when you confirm the charge.</p>'+
    '<form class="form" data-form="bill"><label>Supplier account<select id="supplier-bill-select" name="supplierId" required>'+supplierOptions+'</select></label>'+
    '<div class="grid-fields"><label>Bill date<input name="dueDate" type="date" required></label><label>Actual supplier charge<input name="actualAmount" type="number" step=".01" min=".01" required></label></div>'+
    '<label>Actual exchange rate (if USD)<input name="exchangeRate" type="number" min=".01" step=".01" placeholder="GYD per USD"></label>'+
    '<label>Notes<textarea name="notes"></textarea></label><button class="btn wide" type="submit">Confirm supplier charge (unpaid)</button></form></section>'+
    '<section class="card"><h3>Record confirmed supplier payment</h3><p class="sub">You must check the outgoing payment before recording it. Partial payments are supported.</p>'+
    '<form class="form" data-form="billpayment"><label>Unpaid supplier bill<select name="billId" id="supplier-pay-select" required>'+billOptions+'</select></label>'+
    '<div class="grid-fields"><label>Amount paid (GYD)<input name="amountGyd" type="number" min=".01" step=".01" required></label><label>Payment date<input name="paidDate" type="date" value="'+today()+'" required></label></div>'+
    '<div class="grid-fields"><label>Payment method<select name="method"><option>MMG</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></label><label>Transaction / receipt reference<input name="reference" minlength="3" required></label></div>'+
    '<label class="subnote"><input type="checkbox" name="confirmed" required style="width:auto"> I have verified that AMC paid this amount.</label><button class="btn wide" type="submit">Record verified supplier payment</button></form></section></div>'+
    '<section class="card"><h3>Confirmed supplier bills</h3><p class="sub">These are real charges you entered, not automatically generated projections.</p><div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Bill date</th><th>Actual charge</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>'+
    (bills.length?bills.map(b=>'<tr><td>'+esc(b.supplier)+'<small>'+esc(b.accountLabel)+'</small></td><td>'+formatDate(b.dueDate)+'</td><td>'+esc(b.actual.originalAmount)+' '+esc(b.actual.currency)+'<small>'+money(b.actualGyd)+'</small></td><td>'+money(b.paidGyd)+'</td><td>'+money(b.balanceGyd)+'</td><td>'+pill(b.status)+'</td></tr>').join(''):'<tr><td colspan="6" class="empty">No confirmed supplier bills yet.</td></tr>')+
    '</tbody></table></div></section>';
}
function renderMemberships(){
  const d=state.data;const members=d.memberships,old=d.legacyMembers;
  return '<div class="section-title"><div><h2>Membership Billing</h2><p>Monthly fee defaults to GYD $950 but can differ by member. No automatic membership debt.</p></div></div>'+
    '<div class="notice"><strong>Legacy Members Club remains unchanged:</strong> Existing shipping allowance plans may have their own pricing and status. The billing records here do not change shipping discounts or reprice legacy plans. Reconcile member coverage and opening positions before linking those benefits.</div>'+
    '<div class="two-col"><section class="card"><h3>Add a membership billing profile</h3><p class="sub">Creating a profile does not activate membership. Only an owner-verified membership payment creates paid coverage.</p>'+
    '<form class="form" data-form="member"><label>Member name<input name="customer" required maxlength="160"></label><div class="grid-fields"><label>WhatsApp<input name="whatsapp" maxlength="40"></label><label>Mailbox code<input name="mailboxCode" maxlength="60" placeholder="AMC203"></label></div>'+
    '<label>Monthly fee (GYD)<input name="monthlyFee" type="number" min=".01" step=".01" value="950" required></label><label>Internal notes<textarea name="notes" placeholder="Historical membership details can be reviewed later"></textarea></label>'+
    '<button class="btn wide" type="submit">Create membership profile</button></form></section>'+
    '<section class="card"><h3>Membership coverage</h3><p class="sub">Coverage is calculated from verified membership payments. Existing older memberships without reconciled payments are marked for review, not automatically expired.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Monthly fee</th><th>Paid-through</th><th>Status</th><th>Verified payments</th></tr></thead><tbody>'+
    (members.length?members.map(m=>'<tr><td><strong>'+esc(m.customer)+'</strong><small>'+esc(m.mailboxCode||'No mailbox code')+'</small></td><td>'+money(m.monthlyFee)+'<div class="action-inline"><button type="button" class="outline" data-member-fee="'+esc(m.id)+'">Edit fee</button></div></td><td>'+formatDate(m.paidThrough)+'</td><td>'+pill(m.status)+'</td><td>'+m.verifiedPaymentCount+'</td></tr>').join(''):'<tr><td colspan="5" class="empty">No new billing profiles yet.</td></tr>')+'</tbody></table></div></section></div>'+
    '<section class="card"><h3>Existing Members Club usage registry (read-only reference)</h3><p class="sub">These existing plan fees and allowances are preserved. Do not assume a legacy Active status proves payment.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Legacy member</th><th>Mailbox</th><th>Existing plan</th><th>Legacy plan fee</th><th>Shipping allowance</th></tr></thead><tbody>'+
    (old.length?old.map(m=>'<tr><td>'+esc(m.customer)+'</td><td>'+esc(m.mailboxCode||'—')+'</td><td>'+esc(m.planName||'—')+'</td><td>'+money(m.monthlyFee)+'</td><td>'+esc(m.allowanceLb||'—')+' lb</td></tr>').join(''):'<tr><td colspan="5" class="empty">No legacy member profiles found.</td></tr>')+
    '</tbody></table></div><p class="subnote">Review legacy usage in <a href="/admin/#members-club">Members Club →</a>. Neither module overwrites the other.</p></section>';
}
function renderReceipts(){
  const d=state.data;const receipts=d.receipts;
  return '<div class="section-title"><div><h2>Owner Payment Verification</h2><p>All new customer receipts begin Pending. Only your authenticated owner account can verify or reject them.</p></div></div>'+
    '<div class="notice"><strong>Financial foundation only:</strong> Verified receipts here track actual cash received in this new workspace. Streaming renewals and old shipping invoices are NOT automatically settled; allocating mixed payments, customer credit and unified profit reporting require the later ledger upgrade. Membership receipts must exactly equal the selected fee × number of months.</div>'+
    '<div class="two-col"><section class="card"><h3>Record payment for review</h3><form class="form" data-form="receipt">'+
    '<label>Payment relates to<select name="relatedType" id="receipt-type"><option value="membership">Members Club fee</option><option value="streaming">Streaming subscription (reference only)</option><option value="unallocated">Unallocated customer payment</option></select></label>'+
    '<label id="receipt-member-row">Member<select name="membershipId" id="receipt-member">'+opts(d.memberships,'id','customer','Choose member…')+'</select></label>'+
    '<label id="receipt-stream-row" class="hidden">Existing streaming subscription<select name="streamingId" id="receipt-stream">'+opts(d.streaming,'id','customer','Choose subscription…')+'</select></label>'+
    '<div class="grid-fields"><label id="receipt-months-row">Months purchased<input name="months" id="receipt-months" type="number" min="1" max="24" value="1"></label><label>Payment amount (GYD)<input name="amountGyd" id="receipt-amount" type="number" min=".01" step=".01" required></label></div>'+
    '<label>Customer (used for unallocated receipts)<input name="customer" placeholder="Customer name"></label>'+
    '<div class="grid-fields"><label>Payment method<select name="method"><option>MMG</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></label><label>Date received<input name="receivedDate" type="date" value="'+today()+'" required></label></div>'+
    '<label>MMG / bank reference or cash receipt number<input name="reference" minlength="3" required maxlength="120"></label>'+
    '<label>Notes (not passwords)<textarea name="notes"></textarea></label><button class="btn wide" type="submit">Record as pending verification</button></form></section>'+
    '<section class="card"><h3>Pending your decision</h3><p class="sub">Before clicking Verify, check the payment with your MMG, bank or cash records. A screenshot alone is not confirmation.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Payer / category</th><th>Amount</th><th>Reference</th><th>Received</th><th>Actions</th></tr></thead><tbody>'+
    (receipts.filter(r=>r.status==='pending').length?receipts.filter(r=>r.status==='pending').map(r=>'<tr><td>'+esc(r.customer)+'<small>'+esc(r.relatedType)+'</small></td><td>'+money(r.amountGyd)+'</td><td>'+esc(r.method)+'<small>'+esc(r.reference)+'</small></td><td>'+formatDate(r.receivedDate)+'</td><td><div class="action-inline"><button type="button" class="btn secondary" data-verify="'+esc(r.id)+'">Verify</button><button type="button" class="btn danger" data-reject="'+esc(r.id)+'">Reject</button></div></td></tr>').join(''):'<tr><td colspan="5" class="empty">No payments awaiting verification.</td></tr>')+
    '</tbody></table></div></section></div>'+
    '<section class="card"><h3>Payment register</h3><p class="sub">Verified and rejected decisions are retained. Entries from legacy HENRY OS are not rewritten or automatically counted here.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Amount</th><th>Method / reference</th><th>Category</th><th>Date</th><th>Status</th></tr></thead><tbody>'+
    (receipts.length?receipts.map(r=>'<tr><td>'+esc(r.customer)+'</td><td>'+money(r.amountGyd)+'</td><td>'+esc(r.method)+'<small>'+esc(r.reference)+'</small></td><td>'+esc(r.relatedType)+(r.months?' · '+r.months+' month(s)':'')+'</td><td>'+formatDate(r.receivedDate)+'</td><td>'+pill(r.status)+'</td></tr>').join(''):'<tr><td colspan="6" class="empty">No Phase 1 payments recorded yet.</td></tr>')+
    '</tbody></table></div></section>';
}
function changeReceiptFields(){
  const type=$('receipt-type')?.value; if(!type)return;
  $('receipt-member-row')?.classList.toggle('hidden',type!=='membership');
  $('receipt-stream-row')?.classList.toggle('hidden',type!=='streaming');
  $('receipt-months-row')?.classList.toggle('hidden',type!=='membership');
  const amount=$('receipt-amount');if(amount)amount.readOnly=type==='membership';
  if(type==='membership')updateMembershipAmount();
}
function updateMembershipAmount(){
  const m=state.data?.memberships.find(m=>m.id===$('receipt-member')?.value);
  const months=Number($('receipt-months')?.value)||0;
  if($('receipt-amount'))$('receipt-amount').value=m&&months>0?(Number(m.monthlyFee)*months).toFixed(2):'';
}
function fillBill(){
  const s=state.data?.suppliers.find(s=>s.id===$('supplier-bill-select')?.value);
  const form=document.querySelector('[data-form="bill"]');if(!s||!form)return;
  form.elements.dueDate.value=s.nextExpectedBillDates?.[0]||s.firstDueDate;
  form.elements.actualAmount.value=s.estimate.originalAmount;
  form.elements.exchangeRate.value=s.estimate.currency==='USD'?s.estimate.exchangeRate:'';
}
function fillSupplierPayment(){
  const bill=state.data?.bills.find(b=>b.id===$('supplier-pay-select')?.value);
  const form=document.querySelector('[data-form="billpayment"]');if(bill&&form)form.elements.amountGyd.value=bill.balanceGyd;
}
const handlers={
  supplier:fd=>({name:fd.get('name'),service:fd.get('service'),accountLabel:fd.get('accountLabel'),estimatedAmount:fd.get('estimatedAmount'),currency:fd.get('currency'),exchangeRate:fd.get('exchangeRate'),firstDueDate:fd.get('firstDueDate'),recurrence:fd.get('recurrence'),linkedSubscriptionIds:fd.getAll('linkedSubscriptionIds'),notes:fd.get('notes')}),
  bill:fd=>({supplierId:fd.get('supplierId'),dueDate:fd.get('dueDate'),actualAmount:fd.get('actualAmount'),exchangeRate:fd.get('exchangeRate'),notes:fd.get('notes')}),
  billpayment:fd=>({billId:fd.get('billId'),amountGyd:fd.get('amountGyd'),paidDate:fd.get('paidDate'),method:fd.get('method'),reference:fd.get('reference')}),
  member:fd=>({customer:fd.get('customer'),whatsapp:fd.get('whatsapp'),mailboxCode:fd.get('mailboxCode'),monthlyFee:fd.get('monthlyFee'),notes:fd.get('notes')}),
  receipt:fd=>({relatedType:fd.get('relatedType'),membershipId:fd.get('membershipId'),streamingId:fd.get('streamingId'),months:fd.get('months'),customer:fd.get('customer'),amountGyd:fd.get('amountGyd'),method:fd.get('method'),reference:fd.get('reference'),receivedDate:fd.get('receivedDate'),notes:fd.get('notes')})
};
const actions={supplier:'add_supplier',bill:'add_bill',billpayment:'pay_bill',member:'add_membership',receipt:'add_receipt'};
async function submit(e){
  e.preventDefault();if(state.working||preview)return;
  const type=e.currentTarget.dataset.form;if(!handlers[type])return;
  const data=handlers[type](new FormData(e.currentTarget));
  const question=type==='billpayment'?'I confirm that I checked this outgoing payment against AMC records. Record it as paid?':type==='bill'?'Confirm this supplier charge as an actual unpaid obligation?':null;
  if(question&&!confirm(question))return;
  state.working=true;
  try{await api(actions[type],'POST',data);await reload();showMessage(type==='receipt'?'Payment saved as pending. Verify it after checking your account.':'Record saved successfully.')}
  catch(err){showMessage(err.message,true)}
  finally{state.working=false;}
}
function wireForms(){
  document.querySelectorAll('form[data-form]').forEach(f=>f.addEventListener('submit',submit));
  $('receipt-type')?.addEventListener('change',changeReceiptFields);
  $('receipt-member')?.addEventListener('change',updateMembershipAmount);
  $('receipt-months')?.addEventListener('change',updateMembershipAmount);
  $('supplier-bill-select')?.addEventListener('change',fillBill);
  $('supplier-pay-select')?.addEventListener('change',fillSupplierPayment);
  fillBill();fillSupplierPayment();changeReceiptFields();
  document.querySelectorAll('[data-pause]').forEach(b=>b.onclick=async()=>{
    if(preview||state.working)return;
    if(!confirm('Change the supplier scheduling status? Existing bills will remain unchanged.'))return;
    try{await api('pause_supplier','POST',{id:b.dataset.pause,status:b.dataset.status});await reload();showMessage('Supplier scheduling updated.')}catch(e){showMessage(e.message,true)}
  });
  document.querySelectorAll('[data-edit-supplier]').forEach(b=>b.onclick=async()=>{
    if(preview||state.working)return;
    const old=state.data.suppliers.find(s=>s.id===b.dataset.editSupplier);if(!old)return;
    const estimatedAmount=prompt('Future estimated charge for '+old.accountLabel+' ('+old.estimate.currency+'): ',old.estimate.originalAmount);
    if(estimatedAmount===null)return;
    const exchangeRate=old.estimate.currency==='USD'?prompt('Expected GYD per USD exchange rate (for future estimates only):',old.estimate.exchangeRate):'1';
    if(exchangeRate===null)return;
    const firstDueDate=prompt('Expected billing schedule anchor (YYYY-MM-DD):',old.firstDueDate);
    if(firstDueDate===null)return;
    if(!confirm('Update future estimates for '+old.accountLabel+'? Confirmed historical bills will not change.'))return;
    try{await api('update_supplier_schedule','POST',{id:old.id,estimatedAmount,exchangeRate,firstDueDate,recurrence:old.recurrence});await reload();showMessage('Supplier forecast updated; actual prior bills are unchanged.')}catch(e){showMessage(e.message,true)}
  });
  document.querySelectorAll('[data-member-fee]').forEach(b=>b.onclick=async()=>{
    if(preview||state.working)return;
    const old=state.data.memberships.find(m=>m.id===b.dataset.memberFee);if(!old)return;
    const fee=prompt('New monthly fee for '+old.customer+' (GYD). Past payments will keep their original amounts.',old.monthlyFee);
    if(fee===null)return;
    if(!confirm('Apply the new membership fee for future payments only?'))return;
    try{await api('update_member_fee','POST',{id:old.id,monthlyFee:fee});await reload();showMessage('Future membership fee updated.')}catch(e){showMessage(e.message,true)}
  });
  document.querySelectorAll('[data-verify]').forEach(b=>b.onclick=async()=>{
    if(preview||state.working)return;
    const rec=state.data.receipts.find(r=>r.id===b.dataset.verify);if(!rec)return;
    if(!confirm('OWNER PAYMENT VERIFICATION\n\nConfirm you checked the '+rec.method+' record and received '+money(rec.amountGyd)+' from '+rec.customer+'?\n\nThis decision is permanent and cannot be silently edited.'))return;
    try{await api('decide_receipt','POST',{id:rec.id,decision:'verified'});await reload();showMessage('Payment verified. This cash receipt is now included in the Phase 1 register.')}catch(e){showMessage(e.message,true)}
  });
  document.querySelectorAll('[data-reject]').forEach(b=>b.onclick=async()=>{
    if(preview||state.working)return;
    const reason=prompt('Reason for rejecting this payment:');if(reason===null)return;
    if(reason.trim().length<4){showMessage('A rejection reason is required.',true);return;}
    try{await api('decide_receipt','POST',{id:b.dataset.reject,decision:'rejected',reason});await reload();showMessage('Payment rejected and retained in the audit register.')}catch(e){showMessage(e.message,true)}
  });
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;render();}));
$('refresh').addEventListener('click',reload);
reload();
