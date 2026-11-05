const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>'GYD $'+(Number(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const text=v=>String(v??'').trim();
const today=()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Guyana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(v=>v.type===k)?.value).join('-')};
const pill=s=>'<span class="chip '+esc(s)+'">'+esc(String(s||'—').replaceAll('_',' '))+'</span>';
const preview=/^(deploy-preview-\d+--|agent-)/.test(location.hostname)||location.hostname.includes('netlify.app')&&!location.hostname.startsWith('preeminent-blancmange-');
const state={data:null,tab:'summary',working:false,deepLinkApplied:false,quickMemberId:''};
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
    if(!state.deepLinkApplied){
      state.deepLinkApplied=true;
      const member=new URLSearchParams(location.search).get('member')||'';
      const valid=member.startsWith('legacy:')
        ?state.data.legacyMembers.some(x=>'legacy:'+x.id===member)
        :state.data.memberships.some(x=>x.id===member);
      if(valid){
        state.tab='receipts';
        render();
        const chooser=$('receipt-member');
        if(chooser){
          $('receipt-type').value='membership';
          changeReceiptFields();
          chooser.value=member;
          updateMembershipAmount();
        }
        return;
      }
    }
    render();
  }catch(e){showMessage(e.message,true)}finally{$('loading').classList.add('hidden')}
}
function render(){
  const d=state.data;if(!d)return;
  const report=globalThis.HenryFinanceReport.summarize(d);
  const monthly=globalThis.HenryFinanceReport.monthlyCollected(d);
  const paidBills=d.bills.reduce((n,b)=>n+Number(b.paidGyd),0);
  const billsDue=d.bills.reduce((n,b)=>n+Number(b.balanceGyd),0);
  const upcoming=d.suppliers.filter(s=>s.status==='active'&&s.nextExpectedBillDates?.length).length;
  $('metrics').innerHTML=[
    ['Total Collected This Month',money(monthly.total),'Verified recorded receipts in both registers; duplicates removed'],
    ['Verified Cash Collected Today',money(report.receivedToday),'Phase 1 receipts only, excludes historical'],
    ['Membership Collected This Month',money(report.memberReceivedMonth),'Verified new membership fee payments'],
    ['Supplier Bills Outstanding',money(billsDue),'Confirmed charges — not forecast expenses']
  ].map(([name,value,sub])=>'<article class="metric"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong><p>'+esc(sub)+'</p></article>').join('');
  document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('active',el.dataset.tab===state.tab));
  $('tab-body').innerHTML=state.tab==='summary'?renderSummary():state.tab==='suppliers'?renderSuppliers():state.tab==='memberships'?renderMemberships():renderReceipts();
  if(preview){
    $('tab-body').querySelectorAll('form button[type=submit]').forEach(el=>{el.disabled=true;el.title='Preview is read-only'});
    if(!$('preview-message'))$('tab-body').insertAdjacentHTML('afterbegin','<div class="notice" id="preview-message"><strong>Read-only deployment preview.</strong> You can inspect the interface, but changes can be made only on the approved production site.</div>');
  }
  wireForms();
}
function renderSummary(){
  const d=state.data,r=globalThis.HenryFinanceReport.summarize(d),entries=d.receipts||[],streaming=d.streaming||[];
  const monthly=globalThis.HenryFinanceReport.monthlyCollected(d);
  const verifiedMembership=entries.filter(x=>x.relatedType==='membership'&&x.status==='verified');
  const pending=entries.filter(x=>x.status==='pending');
  const expectedToday=streaming.filter(x=>x.dueDate===d.asOf&&!['paused','cancelled','inactive'].includes(String(x.status||'').toLowerCase()));
  const legacyVerified=(d.legacyPayments||[]).filter(x=>['verified','paid'].includes(String(x.status||'').toLowerCase()));
  const head=(title,sub)=>'<div class="card-head"><div><h3>'+esc(title)+'</h3><p class="sub">'+esc(sub)+'</p></div></div>';
  const stat=(name,value,note)=>'<article class="finance-stat"><small>'+esc(name)+'</small><strong>'+money(value)+'</strong><p>'+esc(note)+'</p></article>';
  const memberRows=verifiedMembership.slice().sort((a,b)=>String(b.receivedDate).localeCompare(String(a.receivedDate)));
  return '<div class="section-title"><div><h2>Financial Collections Overview</h2><p>As of '+esc(formatDate(r.today))+' · Week: '+esc(formatDate(r.weekStart))+' – '+esc(formatDate(r.weekEnd))+' (Guyana time)</p></div></div>'+
    '<div class="notice"><strong>Accounting distinction:</strong> The calendar-month total combines recorded, verified receipts from both HENRY OS payment registers after duplicate-reference checks. It can include verified pre-launch receipts dated this month. The separate Phase 1 cash figures exclude historical receipts. Neither due dates nor active memberships establish actual collection. This is cash received, not earned revenue or profit.</div>'+
    '<section class="card" style="margin-bottom:22px"><h3>Total Verified Collected This Month</h3>'+
      '<div class="finance-hero-total">'+money(monthly.total)+'</div>'+
      '<p class="sub">GYD · '+esc(monthly.month)+' · '+monthly.distinctTransactions+' distinct verified payment(s) recorded between the 1st and today.</p>'+
      '<div class="finance-month-sources">'+
      '<div><small>Legacy-only receipts</small><strong>'+money(monthly.legacyOnly)+'</strong></div>'+
      '<div><small>Finance-only receipts</small><strong>'+money(monthly.financeOnly)+'</strong></div>'+
      '<div><small>Found in both registers — counted once</small><strong>'+money(monthly.duplicatesAcrossRegisters)+'</strong></div>'+
      '</div>'+
      (monthly.needsReview?'<p class="finance-alert">⚠ '+monthly.needsReview+' verified record(s) need review because of missing references, invalid data, or conflicting entries. They are excluded rather than guessed.</p>':'')+
      (monthly.duplicateRecords?'<p class="subnote">'+monthly.duplicateRecords+' duplicate payment record(s) were detected and not counted twice.</p>':'')+
      '<p class="subnote">Only payments recorded in HENRY OS are included. Unentered MMG or bank deposits will not appear automatically. Opening balances are not new receipts.</p></section>'+
    '<div class="section-title"><div><h2>Expected streaming renewals</h2><p>Estimated GYD based on the existing Streaming amount and next renewal date.</p></div></div>'+
    '<div class="finance-stat-grid">'+
      stat('Due today',r.expectedToday,r.expectedSubscriptionsToday+' subscription(s) with a scheduled due date today')+
      stat('Next 7 days',r.expectedNext7,'Includes today')+
      stat('This calendar week',r.expectedCalendarWeek,'Monday–Sunday')+
      stat('This month',r.expectedMonth,'Scheduled due dates during '+r.month)+
    '</div>'+
    '<p class="subnote">'+(r.missingStreamingAmounts||0)+' active streaming record(s) have a due date but no valid amount; '+(r.missingStreamingDates||0)+' have no valid due date. They are excluded from forecast totals. <a href="/admin/streaming-reminders.html?v=20261105e">Open exact-date reminder filters →</a></p>'+
    '<div class="notice"><strong>Missing Members Club collections?</strong> Open <button type="button" class="outline" data-open-tab="memberships">Membership Billing</button>, find the existing member, and select <strong>Record fee</strong>. Check your MMG or bank history and verify each payment. Do not invent payment references or duplicate profiles.</div>'+ 
    '<div class="section-title"><div><h2>Money actually received — verified</h2><p>GYD received from new verified payment records, grouped by original receipt date.</p></div></div>'+
    '<div class="finance-stat-grid">'+
      stat('Collected today',r.receivedToday,'All verified new Phase 1 customer cash')+
      stat('Collected this week',r.receivedWeek,'Calendar week, Guyana time')+
      stat('Collected this month',r.receivedMonth,'All customer receipt categories')+
      stat('Membership fees this month',r.memberReceivedMonth,'Verified fees only, no assumed renewals')+
    '</div>'+
    '<div class="finance-breakdown"><div class="card"><h3>Monthly verified cash breakdown</h3>'+
      '<div class="finance-detail"><span>Membership subscriptions</span><strong>'+money(r.memberReceivedMonth)+'</strong></div>'+
      '<div class="finance-detail"><span>Streaming payments</span><strong>'+money(r.streamingReceivedMonth)+'</strong></div>'+
      '<div class="finance-detail"><span>Unallocated customer receipts</span><strong>'+money(r.unallocatedReceivedMonth)+'</strong></div>'+
      '<div class="finance-detail total"><span>Verified cash this month</span><strong>'+money(r.receivedMonth)+'</strong></div>'+
      '<p class="subnote">Unallocated receipts are cash received but may remain customer liabilities until allocated. This breakdown is not a profit report.</p>'+
      '<button type="button" class="btn" data-open-tab="receipts">Record or verify a payment →</button></div>'+
    '<div class="card"><h3>Existing records still to reconcile</h3>'+
      '<div class="finance-detail"><span>Verified historical member fees in Phase 1</span><strong>'+money(r.historicalMemberVerified)+'</strong></div>'+
      '<div class="finance-detail"><span>Old HENRY OS verified-payment register</span><strong>'+money(r.legacyVerifiedAmount)+'</strong></div>'+
      '<div class="finance-detail"><span>Existing legacy member profiles</span><strong>'+r.legacyMemberCount+'</strong></div>'+
      '<div class="finance-detail"><span>Pending new receipts to check</span><strong>'+pending.length+'</strong></div>'+
      '<p class="subnote"><strong>Do not add these two historical amounts to new collections.</strong> They may include older cash or overlapping transactions. Legacy profiles are not proof that a subscription fee was collected.</p>'+
      '<button type="button" class="outline" data-open-tab="memberships">Review Members Club →</button></div></div>'+
    '<section class="card"><h3>Member fees received — verified register</h3><p class="sub">These are payment records, not merely membership plans. Historical entries are shown but excluded from new cash totals.</p>'+
      '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Amount</th><th>Received</th><th>Fee / coverage</th><th>Accounting</th></tr></thead><tbody>'+
      (memberRows.length?memberRows.map(p=>'<tr><td>'+esc(p.customer)+'</td><td>'+money(p.amountGyd)+'</td><td>'+formatDate(p.receivedDate)+'</td><td>'+esc(p.months||'—')+' month(s)<small>'+esc(p.method||'')+' · '+esc(p.reference||'')+'</small></td><td>'+pill(p.historical?'historical':'verified')+'</td></tr>').join(''):'<tr><td colspan="5" class="empty">No verified Members Club fee payments are recorded in the new ledger. Existing WhatsApp or MMG receipts must be reviewed and entered first.</td></tr>')+
      '</tbody></table></div></section>'+
    '<section class="card"><h3>Netflix &amp; streaming due today</h3><p class="sub">Schedule only — payment status is not established by these dates.</p><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Service</th><th>Amount scheduled</th><th>Renewal date</th></tr></thead><tbody>'+
      (expectedToday.length?expectedToday.map(x=>'<tr><td>'+esc(x.customer)+'</td><td>'+esc(x.service)+'<small>'+esc(x.plan||'')+'</small></td><td>'+(Number(x.amount)>0?money(String(x.amount).replace(/,/g,'')):'Amount missing')+'</td><td>'+formatDate(x.dueDate)+'</td></tr>').join(''):'<tr><td colspan="4" class="empty">No subscriptions with renewal dates today.</td></tr>')+
      '</tbody></table></div></section>'+
    '<section class="card"><h3>Older payment register — read-only</h3><p class="sub">Existing HENRY OS verified entries are visible for reconciliation. They are NOT automatically counted again in new collections.</p>'+
      '<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Amount</th><th>Category</th><th>Payment date</th><th>Reference</th></tr></thead><tbody>'+
      (legacyVerified.length?legacyVerified.slice(0,100).map(x=>'<tr><td>'+esc(x.customer||'')+'</td><td>'+money(x.amount)+'</td><td>'+esc(x.relatedType||'Other')+'</td><td>'+formatDate(x.paymentDate)+'</td><td>'+esc(x.reference||'')+'</td></tr>').join(''):'<tr><td colspan="5" class="empty">No verified legacy payment records to display.</td></tr>')+
      '</tbody></table></div>'+(legacyVerified.length>100?'<p class="subnote">Showing the first 100 older verified payments; more require reconciliation.</p>':'')+'</section>';
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
function renderQuickMemberForm(){
  if(!state.quickMemberId)return '';
  const id=state.quickMemberId;
  const member=id.startsWith('legacy:')?
    state.data.legacyMembers.find(m=>'legacy:'+m.id===id):
    state.data.memberships.find(m=>m.id===id);
  if(!member)return '';
  const fee=Number(member.monthlyFee)||0;
  const pending=state.data.receipts.filter(r=>r.status==='pending'&&(
    id.startsWith('legacy:')?r.legacyMembershipId===id.slice(7):r.membershipId===id));
  return '<section class="card member-quick-pay" id="member-quick-pay">'+
    '<div class="section-title"><div><h3>Record payment received: '+esc(member.customer)+'</h3>'+
    '<p>Recorded fee: '+money(fee)+'/month · A monthly fee is not proof of money received.</p></div>'+
    '<button type="button" class="outline" data-close-quick-member>Close</button></div>'+
    (pending.length?'<div class="notice"><strong>'+pending.length+' existing pending payment(s).</strong> If you already recorded the receipt, verify it here instead of entering it again.'+
      pending.map(r=>'<p>'+money(r.amountGyd)+' · '+esc(r.method)+' · '+esc(r.reference)+' · '+formatDate(r.receivedDate)+
        ' <button type="button" class="btn secondary" data-quick-verify="'+esc(r.id)+'">Verify existing payment</button></p>').join('')+'</div>':'')+
    '<form class="form" data-form="quickmember">'+
    '<input type="hidden" name="membershipId" value="'+esc(id)+'">'+
    '<div class="grid-fields"><label>Money received (GYD)<input name="amountGyd" id="quick-member-amount" type="number" step=".01" min=".01" value="'+fee.toFixed(2)+'" readonly required></label>'+
    '<label>Months covered<input name="months" id="quick-member-months" type="number" min="1" max="24" value="1" required></label></div>'+
    '<div class="grid-fields"><label>Actual payment date<input name="receivedDate" type="date" max="'+esc(state.data.asOf)+'" value="'+esc(state.data.asOf)+'" required></label>'+
    '<label>Payment method<select name="method"><option>MMG</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></label></div>'+
    '<label>Actual MMG/bank reference or cash receipt ID<input name="reference" type="text" maxlength="120" minlength="3" required placeholder="Unique payment reference"></label>'+
    '<label class="member-check"><input type="checkbox" name="historical" id="quick-member-historical"> Payment was received before the HENRY OS financial go-live date</label>'+
    '<div id="quick-historical-fee" class="hidden"><label>Historical monthly fee, if different (GYD)<input name="historicalMonthlyFee" id="quick-member-old-fee" type="number" min=".01" step=".01"></label></div>'+
    '<label>Evidence note (MMG, bank, cash receipt)<textarea name="notes" placeholder="What record did you check? Do not enter bank credentials."></textarea></label>'+
    '<label class="member-check member-check-critical"><input name="confirmedReceived" type="checkbox" required> I checked the payment record and confirm that AMC actually received these funds.</label>'+
    '<button type="submit" class="btn wide">Confirm paid &amp; update dashboard</button>'+
    '<p class="subnote">One step: after your explicit confirmation, this saves a verified payment. It updates the verified-payment count and the main dashboard total for the actual receipt month. Duplicate references are blocked.</p></form></section>';
}
function renderMemberships(){
  const d=state.data;const members=d.memberships,old=d.legacyMembers;
  const summary=globalThis.HenryFinanceReport.summarize(d);
  const pendingFor=(id,legacy=false)=>d.receipts.filter(r=>r.status==='pending'&&(legacy?r.legacyMembershipId===id:r.membershipId===id));
  return '<div class="section-title"><div><h2>Membership Billing</h2><p>New billing profiles default to GYD $950. Existing shipping Members Club profiles retain their own plan fee, and can now have payments verified directly. No automatic membership debt.</p></div></div>'+
    '<div class="finance-stat-grid" style="margin-bottom:18px">'+
    '<article class="finance-stat"><small>Member fees today</small><strong>'+money(summary.memberReceivedToday)+'</strong><p>Verified cash collected today</p></article>'+
    '<article class="finance-stat"><small>Member fees this month</small><strong>'+money(summary.memberReceivedMonth)+'</strong><p>New verified collections</p></article>'+
    '<article class="finance-stat"><small>Verified historical member fees</small><strong>'+money(summary.historicalMemberVerified)+'</strong><p>NOT current cash collections</p></article>'+
    '<article class="finance-stat"><small>Legacy member profiles</small><strong>'+old.length+'</strong><p>Payment evidence still requires review</p></article>'+
    '</div>'+
    '<div class="notice"><strong>What happened:</strong> A monthly fee is not a cash receipt. Click <strong>Record payment</strong>, confirm the actual MMG, bank, or cash receipt, and it will appear on the dashboard. Pending receipts can be verified here without re-entering them.</div>'+renderQuickMemberForm()+
    '<div class="notice"><strong>Legacy Members Club remains unchanged:</strong> Existing shipping allowance plans may have their own pricing and status. The billing records here do not change shipping discounts or reprice legacy plans. Reconcile member coverage and opening positions before linking those benefits.</div>'+
    '<div class="two-col"><details class="card"><summary class="member-collapsible-title">Add a new membership profile (only if not already listed)</summary><div style="margin-top:12px"><h3>New membership profile</h3><p class="sub">Creating a profile does not activate membership. Only an owner-verified payment creates coverage in the new Finance membership tracker. The existing shipping usage tracker remains independent.</p>'+
    '<form class="form" data-form="member"><label>Member name<input name="customer" required maxlength="160"></label><div class="grid-fields"><label>WhatsApp<input name="whatsapp" maxlength="40"></label><label>Mailbox code<input name="mailboxCode" maxlength="60" placeholder="AMC203"></label></div>'+
    '<label>Monthly fee (GYD)<input name="monthlyFee" type="number" min=".01" step=".01" value="950" required></label><label>Internal notes<textarea name="notes" placeholder="Historical membership details can be reviewed later"></textarea></label>'+
    '<button class="btn wide" type="submit">Create membership profile</button></form></div></details>'+
    '<section class="card"><h3>Membership coverage</h3><p class="sub">Coverage is calculated from verified membership payments. Existing older memberships without reconciled payments are marked for review, not automatically expired.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Member</th><th>Monthly fee</th><th>Paid-through</th><th>Status</th><th>Verified payments</th></tr></thead><tbody>'+
    (members.length?members.map(m=>'<tr><td><strong>'+esc(m.customer)+'</strong><small>'+esc(m.mailboxCode||'No mailbox code')+'</small></td><td>'+money(m.monthlyFee)+'<div class="action-inline"><button type="button" class="outline" data-member-fee="'+esc(m.id)+'">Edit fee</button></div></td><td>'+formatDate(m.paidThrough)+'</td><td>'+pill(m.status)+'</td><td>'+m.verifiedPaymentCount+' verified'+(pendingFor(m.id).length?'<small>'+pendingFor(m.id).length+' pending</small>':'')+'<div class="action-inline"><button type="button" class="btn secondary" data-record-member="'+esc(m.id)+'">Record payment</button></div></td></tr>').join(''):'<tr><td colspan="5" class="empty">No new billing profiles yet.</td></tr>')+'</tbody></table></div></section></div>'+
    '<section class="card"><h3>Existing Members Club usage registry (read-only reference)</h3><p class="sub">Existing plan fees and allowances are preserved. Record a real MMG, bank or cash payment against the member, then verify it. Active status alone does not prove payment.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Existing member</th><th>Mailbox</th><th>Existing plan</th><th>Plan fee</th><th>Shipping allowance</th><th>Verified membership receipts</th><th>Action</th></tr></thead><tbody>'+
    (old.length?old.map(m=>'<tr><td>'+esc(m.customer)+'</td><td>'+esc(m.mailboxCode||'—')+'</td><td>'+esc(m.planName||'—')+'</td><td>'+money(m.monthlyFee)+'</td><td>'+esc(m.allowanceLb||'—')+' lb</td><td>'+money(d.receipts.filter(p=>p.status==='verified'&&p.legacyMembershipId===m.id).reduce((total,p)=>total+Number(p.amountGyd),0))+'<small>Historical and current receipts</small></td><td><button type="button" class="btn secondary" data-record-member="legacy:'+esc(m.id)+'">Record payment</button>'+(pendingFor(m.id,true).length?'<small>'+pendingFor(m.id,true).length+' pending</small>':'')+'</td></tr>').join(''):'<tr><td colspan="7" class="empty">No legacy member profiles found.</td></tr>')+
    '</tbody></table></div><p class="subnote">Review legacy usage in <a href="/admin/#members-club">Members Club →</a>. Neither module overwrites the other.</p></section>';
}
function renderReceipts(){
  const d=state.data;const receipts=d.receipts;
  const existingChoices=(d.legacyMembers||[]).map(m=>'<option value="legacy:'+esc(m.id)+'">'+esc(m.customer)+' · '+esc(m.planName||'Members Club')+' · '+money(m.monthlyFee)+'/month</option>').join('');
  const newChoices=(d.memberships||[]).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.customer)+' · '+money(m.monthlyFee)+'/month</option>').join('');
  return '<div class="section-title"><div><h2>Owner Payment Verification</h2><p>All new customer receipts begin Pending. Only your authenticated owner account can verify or reject them.</p></div></div>'+
    '<div class="notice"><strong>Financial foundation only:</strong> Verified receipts here track actual cash received in this new workspace. Streaming renewals and old shipping invoices are NOT automatically settled; allocating mixed payments, customer credit and unified profit reporting require the later ledger upgrade. Membership receipts must exactly equal the selected fee × number of months.</div>'+
    '<div class="two-col"><section class="card"><h3>Record payment for review</h3><form class="form" data-form="receipt">'+
    '<label>Payment relates to<select name="relatedType" id="receipt-type"><option value="membership">Members Club fee</option><option value="streaming">Streaming subscription (reference only)</option><option value="unallocated">Unallocated customer payment</option></select></label>'+
    '<label id="receipt-member-row">Member<select name="membershipId" id="receipt-member" required><option value="">Choose a member…</option><optgroup label="Existing Members Club">'+existingChoices+'</optgroup><optgroup label="New Finance billing profiles">'+newChoices+'</optgroup></select><small>Existing members use their existing plan fee. No duplicate profile is created.</small></label>'+
    '<label id="receipt-stream-row" class="hidden">Existing streaming subscription<select name="streamingId" id="receipt-stream">'+opts(d.streaming,'id','customer','Choose subscription…')+'</select></label>'+
    '<div class="grid-fields"><label id="receipt-months-row">Months purchased<input name="months" id="receipt-months" type="number" min="1" max="24" value="1"></label><label>Payment amount (GYD)<input name="amountGyd" id="receipt-amount" type="number" min=".01" step=".01" required></label></div>'+
    '<label>Customer (used for unallocated receipts)<input name="customer" placeholder="Customer name"></label>'+
    '<div class="grid-fields"><label>Payment method<select name="method"><option>MMG</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></label><label>Date received<input name="receivedDate" type="date" value="'+today()+'" required></label></div>'+
    '<label>MMG / bank reference or cash receipt number<input name="reference" minlength="3" required maxlength="120"></label>'+
    '<label class="subnote"><input type="checkbox" id="receipt-historical" name="historical" style="width:auto"> Collected BEFORE HENRY OS 2.0 go-live (historical payment)</label>'+
    '<div id="receipt-historical-rate" class="hidden"><label>Historical monthly member fee (GYD)<input name="historicalMonthlyFee" id="receipt-old-fee" type="number" min=".01" step=".01" placeholder="Enter original rate, if different"></label></div>'+
    '<label>Notes / receipt evidence (no passwords)<textarea name="notes" placeholder="MMG receipt / bank history / owner verification"></textarea></label><button class="btn wide" type="submit">Record as pending verification</button></form></section>'+
    '<section class="card"><h3>Pending your decision</h3><p class="sub">Before clicking Verify, check the payment with your MMG, bank or cash records. A screenshot alone is not confirmation.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Payer / category</th><th>Amount</th><th>Reference</th><th>Received</th><th>Actions</th></tr></thead><tbody>'+
    (receipts.filter(r=>r.status==='pending').length?receipts.filter(r=>r.status==='pending').map(r=>'<tr><td>'+esc(r.customer)+'<small>'+esc(r.relatedType)+'</small></td><td>'+money(r.amountGyd)+'</td><td>'+esc(r.method)+'<small>'+esc(r.reference)+'</small></td><td>'+formatDate(r.receivedDate)+'</td><td><div class="action-inline"><button type="button" class="btn secondary" data-verify="'+esc(r.id)+'">Verify</button><button type="button" class="btn danger" data-reject="'+esc(r.id)+'">Reject</button></div></td></tr>').join(''):'<tr><td colspan="5" class="empty">No payments awaiting verification.</td></tr>')+
    '</tbody></table></div></section></div>'+
    '<section class="card"><h3>Payment register</h3><p class="sub">Verified and rejected decisions are retained. Entries from legacy HENRY OS are not rewritten or automatically counted here.</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Amount</th><th>Method / reference</th><th>Category</th><th>Date</th><th>Status</th></tr></thead><tbody>'+
    (receipts.length?receipts.map(r=>'<tr><td>'+esc(r.customer)+'</td><td>'+money(r.amountGyd)+'</td><td>'+esc(r.method)+'<small>'+esc(r.reference)+'</small></td><td>'+esc(r.relatedType)+(r.months?' · '+r.months+' month(s)':'')+'</td><td>'+formatDate(r.receivedDate)+'</td><td>'+pill(r.status)+(r.historical?' <small>Historical, not current cash</small>':'')+'</td></tr>').join(''):'<tr><td colspan="6" class="empty">No Phase 1 payments recorded yet.</td></tr>')+
    '</tbody></table></div></section>';
}
function changeReceiptFields(){
  const type=$('receipt-type')?.value; if(!type)return;
  $('receipt-member-row')?.classList.toggle('hidden',type!=='membership');
  if($('receipt-member'))$('receipt-member').required=type==='membership';
  $('receipt-stream-row')?.classList.toggle('hidden',type!=='streaming');
  $('receipt-months-row')?.classList.toggle('hidden',type!=='membership');
  $('receipt-historical-rate')?.classList.toggle('hidden',type!=='membership'||!$('receipt-historical')?.checked);
  const amount=$('receipt-amount');if(amount)amount.readOnly=type==='membership';
  if(type==='membership')updateMembershipAmount();
}
function updateMembershipAmount(){
  const selection=$('receipt-member')?.value||'';
  const m=selection.startsWith('legacy:')?state.data?.legacyMembers.find(m=>m.id===selection.slice(7)):state.data?.memberships.find(m=>m.id===selection);
  const months=Number($('receipt-months')?.value)||0;
  const special=$('receipt-historical')?.checked?Number($('receipt-old-fee')?.value):0;
  if($('receipt-amount'))$('receipt-amount').value=m&&months>0?((special>0?special:Number(m.monthlyFee))*months).toFixed(2):'';
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
  receipt:fd=>({relatedType:fd.get('relatedType'),membershipId:fd.get('membershipId'),streamingId:fd.get('streamingId'),months:fd.get('months'),customer:fd.get('customer'),amountGyd:fd.get('amountGyd'),method:fd.get('method'),reference:fd.get('reference'),receivedDate:fd.get('receivedDate'),historical:fd.get('historical')==='on',historicalMonthlyFee:fd.get('historicalMonthlyFee'),notes:fd.get('notes')})
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
  document.querySelectorAll('[data-open-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.openTab;render()}));
  document.querySelectorAll('[data-record-member]').forEach(b=>b.addEventListener('click',()=>{state.tab='receipts';render();$('receipt-type').value='membership';changeReceiptFields();$('receipt-member').value=b.dataset.recordMember;updateMembershipAmount();document.querySelector('[data-form="receipt"]')?.scrollIntoView({behavior:'smooth',block:'start'})}));
  $('receipt-type')?.addEventListener('change',changeReceiptFields);
  $('receipt-member')?.addEventListener('change',updateMembershipAmount);
  $('receipt-months')?.addEventListener('change',updateMembershipAmount);
  $('receipt-historical')?.addEventListener('change',e=>{ $('receipt-historical-rate')?.classList.toggle('hidden',!e.target.checked||$('receipt-type')?.value!=='membership');if(!e.target.checked&&$('receipt-old-fee'))$('receipt-old-fee').value='';updateMembershipAmount(); });
  $('receipt-old-fee')?.addEventListener('input',updateMembershipAmount);
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
