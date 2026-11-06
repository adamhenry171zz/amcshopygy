// HENRY OS — Netflix provider-side payment & account-update planner.
// Uses imported ACCOUNT PAYMENT DATE from owner-private subscription notes via the
// existing authenticated reminder API. No customer payments or supplier expenses
// are automatically created, and nothing sends external messages.
const node=id=>document.getElementById(id);
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validDay=value=>{
 const s=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T12:00:00Z');
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s;
};
const addDays=(s,n)=>{
 if(!validDay(s))return '';
 const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);
 return d.toISOString().slice(0,10);
};
const showDate=value=>validDay(value)?new Date(value+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not recorded';
const modeState={view:'accounts',rows:[],today:'',dateFilter:'days7',statusFilter:'all',search:'',
 specific:'',from:'',to:'',selectedId:'',busy:false};
function accountFlash(msg,error=false){
 const n=node('status');if(!n)return;
 n.textContent=msg;n.className='status'+(error?' error':'');
}
function plannerMode(view){
 modeState.view=view;
 node('accounts-mode').classList.toggle('hidden',view!=='accounts');
 node('customer-mode').classList.toggle('hidden',view!=='customers');
 for(const [id,on] of [['show-accounts',view==='accounts'],['show-customers',view==='customers']]){
  node(id).classList.toggle('active',on);
  node(id).setAttribute('aria-pressed',String(on));
 }
}
async function accountApi(action,body){
 const response=await fetch('/.netlify/functions/henry-streaming-reminders?action='+encodeURIComponent(action),{
  method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',
  headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined
 });
 let payload={};try{payload=await response.json()}catch{}
 if(!response.ok)throw Error(payload.error||'Unable to update the Netflix account task.');
 return payload;
}
function matchAccountDate(a){
 const d=a.accountDueDate,t=modeState.today;
 switch(modeState.dateFilter){
  case 'today':return d===t;
  case 'tomorrow':return d===addDays(t,1);
  case 'days3':return validDay(d)&&d>=t&&d<=addDays(t,2);
  case 'days7':return validDay(d)&&d>=t&&d<=addDays(t,6);
  case 'overdue':return validDay(d)&&d<t;
  case 'specific':return validDay(modeState.specific)&&d===modeState.specific;
  case 'range':return validDay(modeState.from)&&validDay(modeState.to)&&modeState.from<=modeState.to&&validDay(d)&&d>=modeState.from&&d<=modeState.to;
  case 'all':return true;
  default:return false;
 }
}
function filteredAccounts(){
 const q=modeState.search.toLowerCase().trim();
 return modeState.rows.filter(a=>
  matchAccountDate(a)&&
  (modeState.statusFilter==='all'||(modeState.statusFilter==='updated_recently'?a.lastUpdatedAt&&Date.now()-Date.parse(a.lastUpdatedAt)<=7*86400000:a.status===modeState.statusFilter))&&
  (!q||[a.customer,a.plan,a.service,a.subscriptionId].some(v=>String(v||'').toLowerCase().includes(q)))
 ).sort((a,b)=>String(a.accountDueDate||'9999').localeCompare(String(b.accountDueDate||'9999'))||a.customer.localeCompare(b.customer));
}
const statusText={
 payment_to_check:'Provider payment to check',
 update_required:'Paid — account update needed',
 needs_date:'Date requires review',
 inactive:'Paused / cancelled'
};
function counters(){
 const active=modeState.rows.filter(x=>x.status!=='inactive');
 const t=modeState.today,weekEnd=addDays(t,6);
 const nDue=active.filter(x=>validDay(x.accountDueDate)&&x.accountDueDate>=t&&x.accountDueDate<=weekEnd);
 const today=active.filter(x=>x.accountDueDate===t);
 const past=active.filter(x=>validDay(x.accountDueDate)&&x.accountDueDate<t);
 const ready=active.filter(x=>x.status==='update_required');
 const counts=[
  ['Provider dates today',today.length,'Check Netflix accounts'],
  ['Next 7 days',nDue.length,'Includes today'],
  ['Paid, update needed',ready.length,'Provider payment recorded'],
  ['Past dates',past.length,'Verify before assuming unpaid']
 ];
 node('account-stats').innerHTML=counts.map(([label,n,note])=>
  '<article class="stat"><small>'+htmlEscape(label)+'</small><strong>'+n+'</strong><p>'+htmlEscape(note)+'</p></article>').join('');
}
function renderAccountFilters(){
 node('account-date-filter').value=modeState.dateFilter;
 node('account-status-filter').value=modeState.statusFilter;
 node('account-search').value=modeState.search;
 node('account-specific-row').classList.toggle('hidden',modeState.dateFilter!=='specific');
 node('account-range-row').classList.toggle('hidden',modeState.dateFilter!=='range');
 node('account-specific-date').value=modeState.specific;
 node('account-from-date').value=modeState.from;
 node('account-to-date').value=modeState.to;
}
function renderAccountList(){
 const rows=filteredAccounts();
 node('account-count').textContent=rows.length+' account'+(rows.length===1?'':'s')+' matching your filters.';
 node('account-list').innerHTML=rows.map(a=>{
  const selected=a.subscriptionId===modeState.selectedId;
  const date=a.accountDueDate;
  const old=validDay(date)&&date<modeState.today;
  return '<button class="account-row '+(selected?'selected':'')+'" type="button" data-provider-account="'+htmlEscape(a.subscriptionId)+'">'+
   '<span class="account-row-main"><strong>'+htmlEscape(a.customer||'Unnamed account')+'</strong>'+
   '<small>Provider payment: '+htmlEscape(showDate(date))+' · Customer renewal: '+htmlEscape(showDate(a.customerDueDate))+'</small>'+
   '<small>'+htmlEscape(a.plan||'Netflix')+' · '+htmlEscape(statusText[a.status]||a.status)+(old?' · Past date — verify':'')+'</small></span>'+
   '<span class="account-row-arrow">›</span></button>';
 }).join('')||'<div class="empty">No Netflix accounts match these filters. Try All accounts, or check another date.</div>';
 node('account-list').querySelectorAll('[data-provider-account]').forEach(button=>button.addEventListener('click',()=>{
  modeState.selectedId=button.dataset.providerAccount;
  renderAccountList();renderAccountEditor();
 }));
}
function accountItem(){return modeState.rows.find(a=>a.subscriptionId===modeState.selectedId)}
function renderAccountEditor(){
 const a=accountItem();
 if(!a){
  node('account-editor').innerHTML='<div class="empty">Select a Netflix account from the list.</div>';return;
 }
 const inactive=a.status==='inactive';
 const paid=a.status==='update_required';
 const due=a.accountDueDate||'';
 const last=a.lastUpdatedAt?'<p class="muted">Last recorded update: '+htmlEscape(new Date(a.lastUpdatedAt).toLocaleDateString('en-US',{timeZone:'America/Guyana'}))+' · Previous date: '+htmlEscape(showDate(a.lastCompletedDate))+'</p>':'';
 const needsDate=!validDay(due);
 const expectedDue=htmlEscape(due);
 const subId=htmlEscape(a.subscriptionId);
 const locked=modeState.busy?' disabled':'';
 node('account-editor').innerHTML=
  '<div class="account-person"><strong>'+htmlEscape(a.customer||'Netflix account')+'</strong>'+
    '<small>Customer renewal: '+htmlEscape(showDate(a.customerDueDate))+'</small>'+
    '<small>Netflix account payment: '+htmlEscape(showDate(due))+'</small>'+
    '<small>Imported date: '+htmlEscape(showDate(a.importedAccountDate))+' · '+htmlEscape(a.dateSource)+'</small></div>'+
  last+
  (inactive?'<div class="notice">This subscription is paused or cancelled. Update its customer status in Streaming before completing account tasks.</div>':'')+
  (!inactive&&!needsDate?
   '<div class="account-steps"><div><strong>1. Pay / confirm provider</strong><small>'+(paid?'Marked paid · account update still required':'No provider payment confirmed for this date')+'</small></div>'+
   '<div><strong>2. Update Netflix account</strong><small>'+(paid?'Ready to record once service is actually updated':'Confirm provider payment first')+'</small></div></div>':'')+
  (!inactive&&!needsDate&&!paid?
   '<form id="provider-pay-form" class="account-form">'+
   '<label>Internal note (optional)<textarea name="note" rows="2" maxlength="600" placeholder="Payment or supplier reference — not a password"></textarea></label>'+
   '<label class="checkbox"><input name="confirmedPaid" type="checkbox" required> I checked and actually paid the Netflix provider for this account/date</label>'+
   '<button type="submit" class="primary"'+locked+'>Mark provider paid</button></form>':'')+
  (!inactive&&paid?
   '<form id="account-update-form" class="account-form">'+
   '<p class="muted">Provider payment was confirmed. Once the Netflix access is actually updated, record the next provider payment date.</p>'+
   '<label>Next actual provider payment date<input type="date" name="nextAccountDueDate" min="'+htmlEscape(addDays(modeState.today,1))+'" required></label>'+
   '<label>Update note (optional)<textarea name="note" rows="2" maxlength="600" placeholder="What was updated? No passwords."></textarea></label>'+
   '<label class="checkbox"><input name="confirmedUpdated" type="checkbox" required> I confirm the Netflix account has actually been renewed or updated</label>'+
   '<button class="primary" type="submit"'+locked+'>Mark account updated</button></form>':'')+
  (!inactive&&!paid?
   '<details class="account-correct"><summary>'+ (needsDate?'Set missing provider date':'Correct provider payment date')+'</summary>'+
   '<form id="account-date-form" class="account-form">'+
   '<label>Actual Netflix provider payment date<input name="newAccountDueDate" type="date" required></label>'+
   '<label>Reason / source for this date<input name="note" type="text" minlength="8" maxlength="600" required placeholder="Checked Netflix billing page or supplier account"></label>'+
   '<label class="checkbox"><input name="confirmedReview" type="checkbox" required> I checked this provider date against the account</label>'+
   '<button type="submit" class="light"'+locked+'>Save corrected date</button></form></details>':'')+
  '<p class="queue-footnote">These are internal task confirmations only. They do not send customer reminders, charge Netflix, or add amounts to your financial collections.</p>';
 const formActions=[
  ['provider-pay-form','account_payment','confirmedPaid'],
  ['account-update-form','account_updated','confirmedUpdated'],
  ['account-date-form','set_account_date','confirmedReview']
 ];
 for(const [formId,action,check] of formActions){
  const form=node(formId);
  if(!form)continue;
  form.addEventListener('submit',async e=>{
   e.preventDefault();
   if(modeState.busy)return;
   const data=Object.fromEntries(new FormData(form).entries());
   if(data[check]!=='on'){accountFlash('Confirm the actual action first.',true);return}
   const caption=action==='account_payment'?'provider was actually paid':
     action==='account_updated'?'Netflix account was actually updated':'provider date was checked';
   if(!confirm('Confirm the '+caption+' for '+a.customer+'? This records an internal action, not a financial payment.'))return;
   const payload={subscriptionId:a.subscriptionId,accountDueDate:due,note:data.note||'',
    confirmedPaid:action==='account_payment',confirmedUpdated:action==='account_updated',
    confirmedReview:action==='set_account_date'};
   if(action==='account_updated')payload.nextAccountDueDate=data.nextAccountDueDate;
   if(action==='set_account_date')payload.newAccountDueDate=data.newAccountDueDate;
   modeState.busy=true;
   try{
    const result=await accountApi(action,payload);
    const index=modeState.rows.findIndex(row=>row.subscriptionId===a.subscriptionId);
    if(index>=0)modeState.rows[index]=result.account;
    accountFlash(action==='account_payment'?'Provider payment recorded; now update the Netflix account.':
      action==='account_updated'?'Netflix update recorded. The next provider date is now scheduled.':'Provider date corrected.');
    counters();renderAccountList();renderAccountEditor();
   }catch(err){accountFlash(err.message,true);renderAccountEditor()}
   finally{modeState.busy=false}
  });
 }
}
function renderAccountPlanner(){
 renderAccountFilters();counters();renderAccountList();renderAccountEditor();
}
async function accountRefresh(){
 try{
  const data=await accountApi('overview');
  modeState.rows=Array.isArray(data.accountUpdates)?data.accountUpdates:[];
  modeState.today=data.today;
  if(!modeState.specific)modeState.specific=data.today;
  if(!modeState.from)modeState.from=data.today;
  if(!modeState.to)modeState.to=data.today;
  renderAccountPlanner();
 }catch(err){
  node('account-list').innerHTML='<div class="empty">Could not load provider dates. '+htmlEscape(err.message)+'</div>';
 }
}
function bindAccountPlanner(){
 node('show-accounts').onclick=()=>plannerMode('accounts');
 node('show-customers').onclick=()=>plannerMode('customers');
 node('account-date-filter').onchange=e=>{modeState.dateFilter=e.target.value;renderAccountPlanner()};
 node('account-status-filter').onchange=e=>{
  modeState.statusFilter=e.target.value;
  if(['needs_date','update_required','updated_recently'].includes(e.target.value))modeState.dateFilter='all';
  renderAccountPlanner();
 };
 node('account-search').oninput=e=>{modeState.search=e.target.value;renderAccountList()};
 for(const [id,key] of [['account-specific-date','specific'],['account-from-date','from'],['account-to-date','to']]){
  node(id).onchange=e=>{modeState[key]=e.target.value;renderAccountList()};
 }
 // The main page Refresh action already refreshes the customer reminder queue.
 node('reload').addEventListener('click',()=>{void accountRefresh()});
 void accountRefresh();
}
bindAccountPlanner();
