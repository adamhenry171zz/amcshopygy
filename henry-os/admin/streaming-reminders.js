// HENRY OS Streaming Renewal Reminders — owner-operated bulk manual WhatsApp queue.
// Customer renewal records are READ ONLY; only the separate reminder log receives writes.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=v=>v?new Date(v+'T12:00:00').toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'Not set';
const money=v=>{
 const n=Number(String(v??'').replace(/,/g,''));
 return v!==''&&v!==null&&v!==undefined&&Number.isFinite(n)&&n>0?'GYD $'+n.toLocaleString('en-US',{maximumFractionDigits:2}):'';
};
const isDate=v=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return false;
 const d=new Date(v+'T12:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===v;
};
const plusDays=(date,days)=>{
 if(!isDate(date)||!Number.isInteger(days))return '';
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
};
const phone=value=>{
 let digits=String(value||'').replace(/\D/g,'');
 if(/^6\d{6}$/.test(digits))digits='592'+digits;
 return /^\d{10,15}$/.test(digits)?digits:'';
};
const labels={
 due_today:'Due today',due_soon:'Upcoming',past_date:'Past date — verify',
 needs_date:'Date missing',upcoming:'Scheduled',inactive:'Paused / cancelled'
};
const state={
 data:null,service:'Netflix',dateFilter:'today',statusFilter:'not_sent',lifecycleFilter:'active',search:'',
 specific:'',from:'',to:'',dates:new Set(),selected:new Set(),queue:[],index:0,
 drafts:new Map(),prepared:new Map(),includeUpdate:new Set(),consents:new Set(),
 followups:new Set(),sentChecked:new Set(),sentInQueue:new Set(),paidEditingId:'',editorMode:'payment',working:false
};
const isPreview=/(?:^deploy-preview-\d+--|^branch--)/.test(location.hostname);
function flash(message,error=false){
 const node=$('status');node.textContent=message;node.className='status'+(error?' error':'');
 setTimeout(()=>{if(node.textContent===message)node.classList.add('hidden')},5600);
}
async function api(action,method='GET',body){
 const response=await fetch('/.netlify/functions/henry-streaming-reminders?action='+encodeURIComponent(action),{
  method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:body?JSON.stringify(body):undefined
 });
 let data={};try{data=await response.json()}catch{}
 if(response.status===401){$('workspace').classList.add('hidden');$('sign-in').classList.remove('hidden');throw Error('Owner session expired. Sign in to HENRY OS.')}
 if(!response.ok)throw Error(data.error||'Could not complete the reminder request.');
 return data;
}
const tplContext=s=>({
 firstName:String(s.customer||'Customer').trim().split(/\s+/)[0],
 customer:s.customer||'Customer',service:s.service||'Netflix',plan:s.plan||'',
 dueDate:dateLabel(s.dueDate),amountLine:money(s.amount)?'The amount on file is '+money(s.amount)+'. ':''
});
function renderTemplate(template,record){
 const v=tplContext(record);
 return String(template||'').replace(/\{\{(firstName|customer|service|plan|dueDate|amountLine)\}\}/g,(_,k)=>v[k]||'');
}
function defaultDraft(s){
 const key=s.stage==='due_today'?'dayTemplate':s.stage==='follow_up'?'followupTemplate':'friendlyTemplate';
 return renderTemplate(state.data.settings[key],s);
}
const getCustomer=id=>state.data?.subscriptions.find(s=>s.id===id);
const cycleLog=s=>state.data.logs.find(l=>l.subscriptionId===s.id&&l.dueDate===s.dueDate);
const currentStageLog=s=>state.data.logs.find(l=>l.subscriptionId===s.id&&l.dueDate===s.dueDate&&l.stage===s.stage);
const canPrepare=s=>!!(s&&isDate(s.dueDate)&&s.stage&&phone(s.whatsapp)&&!currentStageLog(s)&&s.category!=='inactive');
const matchService=s=>state.service==='*'||String(s.service).toLowerCase()===state.service.toLowerCase();
function matchDate(s){
 const d=s.dueDate,t=state.data.today;
 switch(state.dateFilter){
  case 'today':return d===t;
  case 'tomorrow':return d===plusDays(t,1);
  case 'days3':return isDate(d)&&d>=t&&d<=plusDays(t,2);
  case 'days7':return isDate(d)&&d>=t&&d<=plusDays(t,6);
  case 'overdue':return isDate(d)&&d<t;
  case 'specific':return isDate(state.specific)&&d===state.specific;
  case 'range':return isDate(state.from)&&isDate(state.to)&&state.from<=state.to&&isDate(d)&&d>=state.from&&d<=state.to;
  case 'multiple':return state.dates.has(d);
  case 'all':return true;
  default:return false;
 }
}
function matchStatus(s){
 const sent=!!cycleLog(s);
 const attention=!s.stage||!isDate(s.dueDate)||!phone(s.whatsapp)||s.customerStatus!=='active';
 if(state.statusFilter==='not_sent')return !sent&&!attention;
 if(state.statusFilter==='sent')return sent;
 if(state.statusFilter==='recently_paid')return !!(s.lastPayment&&isDate(s.lastPayment.paidOn)&&s.lastPayment.paidOn>=plusDays(state.data.today,-30));
 if(state.statusFilter==='attention')return attention;
 return true;
}
function matchLifecycle(s){
 const status=s.customerStatus||'active';
 switch(state.lifecycleFilter){
  case 'active':return status==='active';
  case 'inactive':return status==='inactive';
  case 'archive_review':return status==='inactive'&&s.archiveSuggested===true;
  case 'archived':return status==='archived';
  default:return true;
 }
}
function filteredRows(){
 const q=state.search.toLowerCase().trim();
 return state.data.subscriptions.filter(s=>matchLifecycle(s)&&matchService(s)&&matchDate(s)&&matchStatus(s)&&
  (!q||[s.customer,s.plan,s.service,s.whatsapp].some(v=>String(v||'').toLowerCase().includes(q))))
 .sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))||String(a.customer).localeCompare(String(b.customer)));
}
function labelFor(s){
 if(s.customerStatus==='archived')return 'Archived';
 if(s.customerStatus==='inactive')return s.archiveSuggested?'Archive suggested':'Inactive';
 if(s.lastPayment&&s.lastPayment.nextDueDate===s.dueDate&&s.dueDate>plusDays(state.data.today,6))return 'Paid ✓';
 if(currentStageLog(s))return 'Sent ✓';
 if(cycleLog(s))return 'Reminded earlier';
 if(!s.stage||!isDate(s.dueDate))return 'Date needed';
 if(!phone(s.whatsapp))return 'Phone needed';
 return labels[s.category]||'Ready';
}
function reasonFor(s){
 if(s.customerStatus==='archived')return 'Archived — history preserved. Restore to resume.';
 if(s.customerStatus==='inactive')return s.archiveSuggested?'60+ days inactive — archive only with owner approval.':'Inactive — customer reminders are stopped.';
 if(!isDate(s.dueDate))return 'Renewal date missing. Use Edit Customer to set it here.';
 if(s.customerStatus!=='active')return 'Customer is inactive or archived. Reactivate before reminders.';
 if(!phone(s.whatsapp))return 'No valid WhatsApp number. Fix in HENRY OS Streaming.';
 if(currentStageLog(s))return 'Reminder sent. You can still record payment below.';
 return '';
}
function renderFilters(){
 $('service-filter').innerHTML='<option value="Netflix">Netflix</option><option value="*">All services</option>'+
  [...new Set(state.data.subscriptions.map(s=>String(s.service||'').trim()).filter(Boolean))]
  .filter(s=>s.toLowerCase()!=='netflix').sort((a,b)=>a.localeCompare(b))
  .map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
 $('service-filter').value=state.service;
 $('date-filter').value=state.dateFilter;
 $('status-filter').value=state.statusFilter;
 $('lifecycle-filter').value=state.lifecycleFilter;
 $('customer-search').value=state.search;
 $('specific-date').value=state.specific;
 $('date-from').value=state.from;
 $('date-to').value=state.to;
 $('specific-options').classList.toggle('hidden',state.dateFilter!=='specific');
 $('range-options').classList.toggle('hidden',state.dateFilter!=='range');
 $('multiple-options').classList.toggle('hidden',state.dateFilter!=='multiple');
 $('date-chips').innerHTML=[...state.dates].sort().map(d=>
  '<span class="date-chip">'+esc(dateLabel(d))+' <button type="button" data-remove-date="'+esc(d)+'" aria-label="Remove '+esc(dateLabel(d))+'">×</button></span>'
 ).join('')||'<span class="muted">Add one or more dates to find customers due on those days.</span>';
 $('date-chips').querySelectorAll('[data-remove-date]').forEach(b=>b.onclick=()=>{
  state.dates.delete(b.dataset.removeDate);render();
 });
}
function renderStats(){
 const records=state.data.subscriptions.filter(s=>matchService(s)&&s.customerStatus==='active');
 const t=state.data.today;
 const stats=[
  ['Due today',records.filter(s=>s.dueDate===t).length,'Customers due today'],
  ['Next 7 days',records.filter(s=>s.dueDate>=t&&s.dueDate<=plusDays(t,6)).length,'Includes today'],
  ['Past dates',records.filter(s=>isDate(s.dueDate)&&s.dueDate<t).length,'Review — not confirmed debts'],
  ['Not yet reminded',records.filter(s=>s.stage&&!cycleLog(s)&&phone(s.whatsapp)).length,'Across all due dates']
 ];
 $('stats').innerHTML=stats.map(([title,n,desc])=>
  '<article class="stat"><small>'+esc(title)+'</small><strong>'+n+'</strong><p>'+esc(desc)+'</p></article>').join('');
}
function selectionSummary(){
 const count=state.selected.size;
 $('select-count').textContent=count+' selected';
 $('selection-caption').textContent=count?count+' customer'+(count===1?'':'s')+' selected across your date filters.':'No customers selected.';
 $('build-queue').disabled=count===0||state.working;
}
function renderList(){
 const rows=filteredRows();
 $('result-caption').textContent=rows.length+' matching customer'+(rows.length===1?'':'s')+'. Edit details, fix renewal dates, or record verified payments here.';
 $('customer-list').innerHTML=rows.map(s=>{
  const eligible=canPrepare(s),reason=reasonFor(s);
  const canRecord=s.customerStatus==='active';
  const previous=s.lastPayment;
  return '<div class="customer-choice '+(state.selected.has(s.id)?'selected':'')+'">'+
   '<label class="customer-choice-main">'+
   '<input type="checkbox" data-pick="'+esc(s.id)+'" '+(state.selected.has(s.id)?'checked':'')+(eligible?'':' disabled')+'>'+
   '<span class="customer-main"><strong>'+esc(s.customer||'(unnamed customer)')+'</strong><small>'+
    esc(s.service||'Streaming')+' · '+esc(s.plan||'Plan not recorded')+' · Due '+esc(dateLabel(s.dueDate))+
    (reason?'<span class="customer-reason">'+esc(reason)+'</span>':'')+
    (previous?'<span class="last-paid">Last paid '+esc(dateLabel(previous.paidOn))+
      ' · Next renewal '+esc(dateLabel(previous.nextDueDate))+'</span>':'')+
   '</small></span><span class="tag '+esc(s.category)+'">'+esc(labelFor(s))+'</span></label>'+
   '<div class="customer-actions"><button class="edit-customer-button" type="button" data-edit-customer="'+esc(s.id)+'">Edit Customer</button>'+
   '<button class="record-paid-button" type="button" data-record-paid="'+esc(s.id)+'" '+
    (canRecord?'':' disabled title="Reactivate the customer before recording a new renewal"')+'>Record Paid</button>'+
    (s.customerStatus==='active'
      ?'<button class="customer-status-button" type="button" data-customer-lifecycle="inactive" data-subscription-id="'+esc(s.id)+'">Mark Inactive</button>'
      :'<button class="customer-status-button restore" type="button" data-customer-lifecycle="reactivate" data-subscription-id="'+esc(s.id)+'">Reactivate</button>')+
    (s.archiveSuggested?'<button class="customer-status-button archive" type="button" data-customer-lifecycle="archive" data-subscription-id="'+esc(s.id)+'">Approve Archive</button>':'')+
    '</div>'+
   '</div>';
 }).join('')||'<div class="empty">No matching customers. Try another date or status filter.</div>';
 $('customer-list').querySelectorAll('[data-pick]').forEach(input=>input.addEventListener('change',e=>{
  if(e.target.checked)state.selected.add(e.target.dataset.pick);else state.selected.delete(e.target.dataset.pick);
  renderList();selectionSummary();
 }));
 $('customer-list').querySelectorAll('[data-record-paid]').forEach(button=>button.addEventListener('click',()=>{
  state.paidEditingId=button.dataset.recordPaid;state.editorMode='payment';
  renderPaymentEditor();
  $('customer-payment-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
 }));
 $('customer-list').querySelectorAll('[data-customer-lifecycle]').forEach(button=>button.addEventListener('click',async()=>{
  if(state.working)return;
  const s=getCustomer(button.dataset.subscriptionId),command=button.dataset.customerLifecycle;
  if(!s)return;
  const confirmText=command==='inactive'
   ?'Mark '+s.customer+' INACTIVE? Customer reminders will stop. '+(s.possiblePaidThrough?'The renewal date on file is '+dateLabel(s.possiblePaidThrough)+'; paid service may remain. ':'')+'All payments and provider account dates stay preserved.'
   :command==='archive'
   ?'Archive '+s.customer+' after '+s.daysInactive+' days inactive? This hides the customer from active lists but keeps all history.'
   :'Reactivate '+s.customer+'? Customer renewals and reminders will resume when a valid due date is available.';
  if(!confirm(confirmText))return;
  const note=command==='inactive'?prompt('Optional reason for inactivity (no passwords):','')||'':command==='archive'?'Owner approved archive after 60+ days': 'Customer returned to service';
  // A future renewal date is an advisory warning, never proof of payment.
  const confirmedPaidTime=command==='inactive'&&!!s.possiblePaidThrough;
  state.working=true;
  try{
    await api('set_customer_status','POST',{
      subscriptionId:s.id,revision:s.revision||'',command,confirmed:true,
      acknowledgedPaidThrough:confirmedPaidTime,reason:note
    });
    state.selected.delete(s.id);state.paidEditingId='';
    if(command!=='reactivate'){state.dateFilter='all';state.statusFilter='all';state.lifecycleFilter=command==='archive'?'archived':'inactive'}
    else{state.dateFilter='all';state.statusFilter='all';state.lifecycleFilter='active'}
    await refresh();
    flash(s.customer+' '+(command==='inactive'?'marked inactive':command==='archive'?'archived with your approval':'reactivated')+'. Historical payments remain unchanged.');
  }catch(err){flash(err.message,true)}
  finally{state.working=false}
 }));
 $('customer-list').querySelectorAll('[data-edit-customer]').forEach(button=>button.addEventListener('click',()=>{
  state.paidEditingId=button.dataset.editCustomer;state.editorMode='details';
  renderPaymentEditor();
  $('customer-payment-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
 }));
 selectionSummary();
}
function renderCustomerDetailsEditor(s){
 const head=$('customer-payment-heading'),caption=$('customer-payment-caption'),body=$('customer-payment-body');
 head.textContent='Edit Customer — '+s.customer;
 caption.textContent='Update details or correct the customer renewal date. This does NOT record a payment or change AMC’s Netflix provider payment date.';
 body.innerHTML='<form id="customer-edit-form" class="form customer-paid-form">'+
  '<div class="payment-form-grid">'+
   '<label>Customer name<input name="customer" maxlength="160" value="'+esc(s.customer)+'" required></label>'+
   '<label>WhatsApp number<input name="whatsapp" maxlength="40" value="'+esc(s.whatsapp||'')+'" placeholder="+592..."></label>'+
   '<label>Streaming plan<input name="plan" maxlength="120" value="'+esc(s.plan||'')+'" placeholder="PRIVATE / PREMIUM" required></label>'+
   '<label>Monthly customer price (GYD)<input name="amount" type="number" step=".01" min=".01" value="'+
    esc(String(s.amount||'').replace(/,/g,''))+'" placeholder="Enter agreed monthly price"></label>'+
   '<label>Customer renewal due date<input name="dueDate" type="date" value="'+esc(s.dueDate||'')+'" '+
    (isDate(s.dueDate)?'required':'')+'></label>'+
   '</div>'+
   '<p class="muted">Correct missing dates here. Saving will update this customer only; no payment is added to funds collected. If the customer already paid and that money is already recorded elsewhere, use this date edit rather than recording another payment.</p>'+
   '<button type="submit" class="primary" '+(state.working?'disabled':'')+'>Save Customer Details</button></form>';
 $('customer-edit-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if(state.working)return;
  const data=Object.fromEntries(new FormData(event.currentTarget).entries());
  if(!confirm('Save updated details for '+s.customer+'? This does not add or verify a payment.'))return;
  state.working=true;
  const submit=$('customer-edit-form button[type=submit]');if(submit)submit.disabled=true;
  try{
   const result=await api('edit_customer','POST',{
    subscriptionId:s.id,expectedDueDate:s.dueDate,revision:s.revision||'',
    customer:data.customer,whatsapp:data.whatsapp,plan:data.plan,amount:data.amount,dueDate:data.dueDate
   });
   state.paidEditingId='';state.editorMode='payment';
   state.dateFilter='all';state.statusFilter='all';
   await refresh();
   flash(result.changed?'Customer details saved. No payment was added.':'No changes were needed.');
  }catch(error){flash(error.message,true);if(submit)submit.disabled=false}
  finally{state.working=false}
 });
}
function renderPaymentEditor(){
 const panel=$('customer-payment-panel'),body=$('customer-payment-body');
 const s=getCustomer(state.paidEditingId);
 if(!s||(state.editorMode!=='details'&&s.category==='inactive')){
  panel.classList.add('hidden');return;
 }
 panel.classList.remove('hidden');
 if(state.editorMode==='details'){renderCustomerDetailsEditor(s);return}
 $('customer-payment-heading').textContent='Record Paid — '+s.customer;
 $('customer-payment-caption').textContent='Current renewal: '+dateLabel(s.dueDate)+
  (isDate(s.dueDate)?' · Confirm the actual deposit and next renewal date.':' · No previous date is on file. Enter the next real renewal date below.');
 body.innerHTML='<form id="customer-paid-form" class="form customer-paid-form">'+
  '<div class="payment-form-grid">'+
   '<label>Amount received (GYD)<input name="amountGyd" type="number" min="0.01" step="0.01" value="'+
    esc(String(s.amount||'').replace(/,/g,''))+'" required></label>'+
   '<label>Date received<input name="receivedDate" type="date" value="'+esc(state.data.today)+'" max="'+
    esc(state.data.today)+'" required></label>'+
   '<label>Payment method<select name="method"><option value="MMG">MMG</option>'+
    '<option value="Bank transfer">Bank transfer</option><option value="Cash">Cash</option>'+
    '<option value="Other">Other</option></select></label>'+
   '<label>Transaction / cash receipt reference<input name="reference" maxlength="120" minlength="4" '+
     'placeholder="Actual unique reference" required></label>'+
   '<label>Next customer payment due<input name="nextDueDate" type="date" min="'+
    esc(plusDays(isDate(s.dueDate)&&s.dueDate>state.data.today?s.dueDate:state.data.today,1))+'" required></label>'+
   '</div>'+
   '<label>Optional note<textarea name="notes" rows="2" maxlength="700" '+
     'placeholder="MMG statement checked; no passwords or card details"></textarea></label>'+
   '<label class="checkbox"><input name="historical" type="checkbox"> This payment was received before HENRY OS financial go-live</label>'+
   '<label class="checkbox customer-paid-confirm"><input name="confirmedReceived" type="checkbox" required>'+
      ' I verified that AMC actually received this customer payment.</label>'+
   '<p class="muted">This updates the customer renewal date and records one verified payment on your main dashboard. '+
    'Your Netflix provider account payment date stays unchanged. No WhatsApp message will be sent.</p>'+
   '<button type="submit" class="primary" '+(state.working?'disabled':'')+'>Confirm Paid &amp; Update Renewal</button>'+
   '</form>';
 $('customer-paid-form').addEventListener('submit',async e=>{
  e.preventDefault();if(state.working)return;
  const data=Object.fromEntries(new FormData(e.currentTarget).entries());
  if(data.confirmedReceived!=='on'){flash('Confirm the actual payment received first.',true);return}
  if(!confirm('Confirm payment from '+s.customer+' was received and verified?\\n\\n'+
    'This records GYD '+data.amountGyd+' as collected and changes the next customer due date to '+data.nextDueDate+'.'))return;
  state.working=true;
  const submit=$('customer-paid-form button[type=submit]');
  if(submit)submit.disabled=true;
  try{
   await api('record_customer_paid','POST',{
    subscriptionId:s.id,previousDueDate:s.dueDate,nextDueDate:data.nextDueDate,
    amountGyd:data.amountGyd,receivedDate:data.receivedDate,method:data.method,
    reference:data.reference,historical:data.historical==='on',
    notes:data.notes||'',confirmedReceived:true
   });
   state.paidEditingId='';
   state.selected.delete(s.id);
   state.dateFilter='all';state.statusFilter='recently_paid';
   await refresh();
   flash('Payment recorded for '+s.customer+'. Next renewal updated to '+dateLabel(data.nextDueDate)+'.');
  }catch(err){flash(err.message,true);if(submit)submit.disabled=false}
  finally{state.working=false}
 });
}
function queueItem(){
 const snap=state.queue[state.index];
 return snap?getCustomer(snap.id):null;
}
function resetPrepared(id){
 state.prepared.delete(id);state.sentChecked.delete(id);
}
function queueMessage(s){
 const draft=state.drafts.get(s.id)??defaultDraft(s);
 const recommendation=state.includeUpdate.has(s.id)&&state.consents.has(s.id)
   ?String(state.data.settings.recommendedUpdate||'').trim():'';
 return (draft.trim()+(recommendation?'\n\nAMC Update: '+recommendation:'')).trim();
}
function validateQueueMessage(s){
 if(state.includeUpdate.has(s.id)&&!state.consents.has(s.id))throw Error('Confirm this customer opted in to promotional updates or turn off the update.');
 if(cycleLog(s)&&!currentStageLog(s)&&!state.followups.has(s.id))throw Error('This customer was already reminded for this renewal. Confirm the intentional follow-up first.');
 const message=queueMessage(s);
 if(message.length<10||message.length>2000)throw Error('Message must be 10–2,000 characters.');
 return message;
}
function renderQueue(){
 $('queue-count').textContent=state.queue.length?(state.index>=state.queue.length?'Finished':(state.index+1)+' / '+state.queue.length):'No queue';
 if(!state.queue.length){$('queue-body').innerHTML='<div class="empty">Select customers and choose “Build WhatsApp queue” to begin.</div>';return}
 const done=state.sentInQueue.size;
 if(state.index>=state.queue.length){
  $('queue-body').innerHTML='<div class="queue-finished"><strong>Queue review complete</strong><p>'+
   done+' message'+(done===1?' was':'s were')+' recorded as actually sent, out of '+state.queue.length+' queued. Unsent or skipped messages were not marked as sent.</p>'+
   '<button type="button" class="light" id="queue-restart">Close this queue</button></div>';
  $('queue-restart').onclick=()=>{state.queue=[];state.index=0;state.sentInQueue.clear();renderQueue()};
  return;
 }
 const snap=state.queue[state.index],s=queueItem();
 const valid=!!s&&s.dueDate===snap.dueDate&&s.stage===snap.stage&&canPrepare(s);
 if(!valid){
  $('queue-body').innerHTML='<div class="queue-callout"><strong>Record needs review.</strong><p>Customer '+esc(snap.customer)+
   ' was changed, marked as sent, or cannot receive a WhatsApp reminder. Refresh and rebuild the queue if needed.</p></div>'+
   '<button type="button" id="queue-skip" class="light">Skip this record →</button>';
  $('queue-skip').onclick=()=>advanceQueue();
  return;
 }
 const draft=state.drafts.get(s.id)??defaultDraft(s);
 const prepared=state.prepared.get(s.id);
 const cycleSent=!!cycleLog(s);
 const hasUpdate=!!String(state.data.settings.recommendedUpdate||'').trim();
 const checkFollow=cycleSent&&!currentStageLog(s);
 $('queue-body').innerHTML=
  '<div class="queue-head"><div><strong>'+esc(s.customer)+'</strong><small>'+esc(s.service)+' · '+esc(s.plan||'Plan not recorded')+' · Due '+esc(dateLabel(s.dueDate))+'</small></div><span class="tag '+esc(s.category)+'">'+esc(labelFor(s))+'</span></div>'+
  '<div class="queue-step"><small class="muted">Item '+(state.index+1)+' of '+state.queue.length+' · '+done+' recorded sent</small><progress max="'+state.queue.length+'" value="'+state.index+'"></progress></div>'+
  (s.category==='past_date'?'<div class="queue-callout">Past date: ask the customer to confirm their renewal. Do not claim a debt or assume payment was missed.</div>':'')+
  (checkFollow?'<div class="queue-callout"><strong>Previously reminded on this same renewal.</strong> A new-stage follow-up is possible, but must be intentional.<label class="checkbox"><input id="followup-consent" type="checkbox" '+(state.followups.has(s.id)?'checked':'')+'> I intend to send this additional follow-up</label></div>':'')+
  '<div class="form"><label>Personalized message for '+esc(s.customer)+
   '<textarea id="draft" maxlength="2000" rows="7">'+esc(draft)+'</textarea></label>'+
   '<label class="checkbox"><input type="checkbox" id="include-update" '+(state.includeUpdate.has(s.id)?'checked':'')+(hasUpdate?'':' disabled')+'> Add optional AMC service recommendation</label>'+
   (hasUpdate?'<p class="muted">Update preview: '+esc(state.data.settings.recommendedUpdate)+'</p>':'<p class="muted">No recommendation is configured. Renewal-only messages are the default.</p>')+
   '<label class="checkbox '+(state.includeUpdate.has(s.id)?'':'hidden')+'" id="consent-row"><input id="marketing-consent" type="checkbox" '+(state.consents.has(s.id)?'checked':'')+'> I confirm this customer opted in to promotional updates</label>'+
   '<div class="queue-actions"><button type="button" id="open-whatsapp" class="primary btn-emphasis">Open WhatsApp draft</button>'+
   '<button type="button" id="copy-message" class="light">Copy message</button></div>'+
   '<p class="queue-footnote">Opening or copying does not send the message or update the sent log. Send it yourself, then confirm below.</p>'+
   (prepared?'<div class="queue-callout">Message prepared by '+esc(prepared.method)+'. Verify that you actually sent this exact message.</div>':'')+
   '<div class="queue-confirm"><label class="checkbox"><input type="checkbox" id="actually-sent" '+(state.sentChecked.has(s.id)?'checked':'')+(prepared?'':' disabled')+'> I have actually sent this message to '+esc(s.customer)+'</label>'+
   '<button type="button" class="primary" id="mark-sent" '+(state.sentChecked.has(s.id)&&prepared?'':' disabled')+'>Confirm sent &amp; next customer →</button></div>'+
   '<div class="queue-skip"><button class="light" id="queue-previous" type="button" '+(state.index===0?'disabled':'')+'>← Previous</button><button class="light" id="queue-skip" type="button">Skip for now →</button></div>'+
   '</div>';
 const draftInput=$('draft');
 draftInput.addEventListener('input',e=>{
  state.drafts.set(s.id,e.target.value);
  resetPrepared(s.id);
  $('actually-sent').checked=false;$('actually-sent').disabled=true;$('mark-sent').disabled=true;
 });
 $('include-update').onchange=e=>{
  if(e.target.checked)state.includeUpdate.add(s.id);else{state.includeUpdate.delete(s.id);state.consents.delete(s.id)}
  resetPrepared(s.id);renderQueue();
 };
 $('marketing-consent')?.addEventListener('change',e=>{
  if(e.target.checked)state.consents.add(s.id);else state.consents.delete(s.id);
  resetPrepared(s.id);renderQueue();
 });
 $('followup-consent')?.addEventListener('change',e=>{
  if(e.target.checked)state.followups.add(s.id);else state.followups.delete(s.id);
  resetPrepared(s.id);renderQueue();
 });
 $('open-whatsapp').onclick=()=>{
  try{
   const message=validateQueueMessage(s);
   const number=phone(s.whatsapp);
   if(!number)throw Error('No valid WhatsApp number is saved for this customer.');
   const popup=window.open('https://wa.me/'+number+'?text='+encodeURIComponent(message),'_blank');
   if(!popup)throw Error('WhatsApp window was blocked. Allow popups or use Copy message.');
   try{popup.opener=null}catch{}
   state.prepared.set(s.id,{method:'WhatsApp draft',message,update:state.includeUpdate.has(s.id),consent:state.consents.has(s.id)});
   state.sentChecked.delete(s.id);renderQueue();
   flash('WhatsApp draft opened. Send it there, then confirm here.');
  }catch(err){flash(err.message,true)}
 };
 $('copy-message').onclick=async()=>{
  try{
   const message=validateQueueMessage(s);
   await navigator.clipboard.writeText(message);
   state.prepared.set(s.id,{method:'copying',message,update:state.includeUpdate.has(s.id),consent:state.consents.has(s.id)});
   state.sentChecked.delete(s.id);renderQueue();
   flash('Message copied. Paste and send it yourself before confirming.');
  }catch(err){flash(err.message||'Copy failed. Please try again.',true)}
 };
 $('actually-sent').onchange=e=>{if(e.target.checked)state.sentChecked.add(s.id);else state.sentChecked.delete(s.id);$('mark-sent').disabled=!e.target.checked};
 $('mark-sent').onclick=async()=>{
  const snapshot=state.prepared.get(s.id);
  if(!snapshot||!state.sentChecked.has(s.id)||state.working)return;
  if(!confirm('Have you actually SENT this message to '+s.customer+'?\n\nOpening WhatsApp or copying alone does not count.'))return;
  state.working=true;$('mark-sent').disabled=true;
  try{
   const result=await api('mark_sent','POST',{
    subscriptionId:s.id,dueDate:snap.dueDate,stage:snap.stage,
    message:snapshot.message,confirmedSent:true,
    includedRecommendation:snapshot.update,marketingConsentConfirmed:snapshot.consent
   });
   state.data.logs.push(result.item);
   state.sentInQueue.add(s.id+'|'+snap.dueDate+'|'+snap.stage);
   state.selected.delete(s.id);
   resetPrepared(s.id);
   state.index++;
   flash('Recorded as sent to '+s.customer+'.');
   renderList();renderQueue();renderStats();
  }catch(err){flash(err.message,true);$('mark-sent').disabled=false}
  finally{state.working=false}
 };
 $('queue-previous').onclick=()=>{if(state.index>0){state.index--;renderQueue()}};
 $('queue-skip').onclick=advanceQueue;
}
function advanceQueue(){state.index++;renderQueue()}
function dedupeRecipients(rows){
 const seen=new Set(),unique=[];let duplicates=0;
 for(const s of rows){
  const key=[phone(s.whatsapp),String(s.service||'').trim().toLowerCase(),s.dueDate].join('|');
  if(seen.has(key)){duplicates++;continue}
  seen.add(key);unique.push(s);
 }
 return {unique,duplicates};
}
function buildQueue(){
 if(state.working||!state.data)return;
 const eligible=state.data.subscriptions.filter(s=>state.selected.has(s.id)&&canPrepare(s));
 eligible.sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))||String(a.customer).localeCompare(String(b.customer)));
 if(!eligible.length){flash('No eligible unsent reminders are selected. Check phone numbers, dates and reminder status.',true);return}
 // Same recipient + service + renewal date may represent duplicate imported accounts.
 // Suppress duplicate outbound drafts in this batch, without deleting source records.
 const {unique,duplicates}=dedupeRecipients(eligible);
 if(unique.length>100){flash('Prepare at most 100 customers per queue. Narrow your filters.',true);return}
 state.queue=unique.map(s=>({id:s.id,dueDate:s.dueDate,stage:s.stage,customer:s.customer}));
 state.index=0;state.sentInQueue.clear();
 renderQueue();
 flash('Prepared '+state.queue.length+' individual message(s). '+(duplicates?duplicates+' possible duplicate recipient record(s) were excluded. ':'')+'Nothing has been sent.');
}
function fillSettings(){
 const form=$('settings-form');
 for(const key of ['friendlyTemplate','dayTemplate','followupTemplate','recommendedUpdate'])
  form.elements[key].value=state.data.settings[key]||'';
}
function render(){
 if(!state.data)return;
 renderFilters();renderStats();renderList();renderQueue();renderPaymentEditor();
}
async function refresh(){
 $('loading').classList.remove('hidden');
 try{
  const auth=await fetch('/.netlify/functions/henry-auth?action=session',{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
  if(!auth.authenticated){$('sign-in').classList.remove('hidden');$('workspace').classList.add('hidden');return}
  $('sign-in').classList.add('hidden');
  const firstLoad=!state.data;
  state.data=await api('overview');
  state.selected=new Set([...state.selected].filter(id=>state.data.subscriptions.some(s=>s.id===id)));
  $('workspace').classList.remove('hidden');
  if(firstLoad){state.specific=state.data.today;state.from=state.data.today;state.to=state.data.today;fillSettings()}
  render();
 }catch(err){flash(err.message||'Failed to refresh reminder data.',true)}
 finally{$('loading').classList.add('hidden')}
}
$('reload').addEventListener('click',refresh);
$('close-customer-payment').addEventListener('click',()=>{state.paidEditingId='';state.editorMode='payment';renderPaymentEditor()});
$('service-filter').addEventListener('change',e=>{state.service=e.target.value;render()});
$('date-filter').addEventListener('change',e=>{state.dateFilter=e.target.value;render()});
$('status-filter').addEventListener('change',e=>{state.statusFilter=e.target.value;if(e.target.value==='recently_paid')state.dateFilter='all';render()});
$('lifecycle-filter').addEventListener('change',e=>{state.lifecycleFilter=e.target.value;state.dateFilter='all';state.statusFilter='all';render()});
$('customer-search').addEventListener('input',e=>{
 state.search=e.target.value;renderStats();renderList();
});
$('specific-date').addEventListener('change',e=>{state.specific=e.target.value;renderList()});
$('date-from').addEventListener('change',e=>{state.from=e.target.value;renderList()});
$('date-to').addEventListener('change',e=>{state.to=e.target.value;renderList()});
$('add-date').addEventListener('click',()=>{
 const v=$('multi-date-input').value;
 if(!isDate(v)){flash('Choose a valid date before adding it.',true);return}
 if(state.dates.size>=31&&!state.dates.has(v)){flash('Choose up to 31 dates per filter.',true);return}
 state.dates.add(v);render();
});
$('select-visible').addEventListener('click',()=>{
 const s=filteredRows().filter(canPrepare);
 s.forEach(row=>state.selected.add(row.id));
 renderList();flash('Selected '+s.length+' eligible customer'+(s.length===1?'':'s')+' from the filtered list.');
});
$('clear-selection').addEventListener('click',()=>{state.selected.clear();renderList()});
$('build-queue').addEventListener('click',buildQueue);
$('settings-form').addEventListener('submit',async e=>{
 e.preventDefault();if(state.working)return;state.working=true;
 try{
  const response=await api('save_settings','POST',Object.fromEntries(new FormData(e.currentTarget).entries()));
  state.data.settings=response.settings;
  flash('Templates saved. Existing manually edited drafts were kept.');
  renderQueue();
 }catch(err){flash(err.message,true)}
 finally{state.working=false}
});
refresh();
