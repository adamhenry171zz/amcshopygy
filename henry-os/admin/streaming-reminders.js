const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=v=>v?new Date(v+'T12:00:00').toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'Not set';
const money=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?'GYD $'+Number(v).toLocaleString('en-US',{maximumFractionDigits:2}):'';
const state={data:null,selectedId:'',service:'Netflix',includeUpdate:false,confirmedConsent:false};
const labels={due_today:'Due today',due_soon:'Within 7 days',past_date:'Verify past date',needs_date:'Renewal date missing',upcoming:'Upcoming',inactive:'Paused / cancelled'};
let lastDraft='';
function flash(s,error=false){const n=$('status');n.textContent=s;n.className='status'+(error?' error':'');setTimeout(()=>{if(n.textContent===s)n.classList.add('hidden')},5200)}
async function api(action,method='GET',data){
 const response=await fetch('/.netlify/functions/henry-streaming-reminders?action='+encodeURIComponent(action),{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
 let result={};try{result=await response.json()}catch{}
 if(response.status===401){$('workspace').classList.add('hidden');$('sign-in').classList.remove('hidden');throw Error('Owner session required. Sign in again.')}
 if(!response.ok)throw Error(result.error||'Unable to complete request.');
 return result;
}
const tplContext=s=>{
 const firstName=String(s.customer||'Customer').trim().split(/\s+/)[0];
 return {firstName,customer:s.customer||'Customer',service:s.service||'Netflix',plan:s.plan||'',dueDate:dateLabel(s.dueDate),amountLine:money(s.amount)?'The amount on file is '+money(s.amount)+'. ':''};
};
function renderTemplate(template,record){
 const tokens=tplContext(record);
 return String(template||'').replace(/\{\{(firstName|customer|service|plan|dueDate|amountLine)\}\}/g,(_,key)=>tokens[key]||'');
}
function defaultText(s){
 const key=s.stage==='due_today'?'dayTemplate':s.stage==='follow_up'?'followupTemplate':'friendlyTemplate';
 return renderTemplate(state.data.settings[key],s);
}
function outputText(s){
 const base=$('draft')?.value??defaultText(s);
 const update=state.includeUpdate&&state.confirmedConsent?String(state.data.settings.recommendedUpdate||'').trim():'';
 return (base.trim()+(update?'\n\nAMC Update: '+update:'')).trim();
}
function phone(v){
 let digits=String(v||'').replace(/\D/g,'');
 if(/^[6][0-9]{6}$/.test(digits))digits='592'+digits;
 return /^\d{10,15}$/.test(digits)?digits:'';
}
function logged(s){return state.data.logs.some(l=>l.subscriptionId===s.id&&l.dueDate===s.dueDate&&l.stage===s.stage)}
function filterRows(){
 return state.data.subscriptions.filter(s=>state.service==='*'||s.service.toLowerCase()===state.service.toLowerCase());
}
function renderStats(){
 const s=filterRows();
 const stats=[['Renewals due today',s.filter(r=>r.category==='due_today').length,'Review and prepare messages'],
 ['Within next 7 days',s.filter(r=>r.category==='due_soon').length,'Upcoming renewals'],
 ['Past dates to verify',s.filter(r=>r.category==='past_date').length,'Not confirmed debts'],
 ['Missing renewal date',s.filter(r=>r.category==='needs_date').length,'Set dates in Streaming']];
 $('stats').innerHTML=stats.map(([title,value,desc])=>'<article class="stat"><small>'+esc(title)+'</small><strong>'+value+'</strong><p>'+esc(desc)+'</p></article>').join('');
}
function renderList(){
 const rows=filterRows();
 $('customer-list').innerHTML=rows.map(s=>{
 const sent=s.stage&&logged(s);
 return '<button type="button" class="customer '+(state.selectedId===s.id?'active':'')+'" data-customer="'+esc(s.id)+'"><span><strong>'+esc(s.customer||'(customer name missing)')+'</strong><small>'+esc(s.service)+' · '+esc(s.plan||'Plan not recorded')+' · '+esc(dateLabel(s.dueDate))+'</small></span><span class="tag '+esc(s.category)+'">'+(sent?'Sent ✓':esc(labels[s.category]||'Upcoming'))+'</span></button>';
 }).join('')||'<div class="empty">No streaming records match this filter.</div>';
 document.querySelectorAll('[data-customer]').forEach(b=>b.onclick=()=>{state.selectedId=b.dataset.customer;state.includeUpdate=false;state.confirmedConsent=false;lastDraft='';render()});
}
function renderCompose(){
 const s=state.data.subscriptions.find(x=>x.id===state.selectedId);
 if(!s){$('compose').innerHTML='<div class="empty">Select a customer to prepare a reminder.</div>';return}
 if(s.category==='needs_date'){$('compose').innerHTML='<div class="notice"><strong>No renewal date available.</strong> Open Streaming in HENRY OS and edit this customer’s Payment due date. We will not invent one.</div><a class="light" href="/admin/">Open Streaming →</a>';return}
 if(s.category==='inactive'){$('compose').innerHTML='<div class="notice"><strong>Customer currently paused or cancelled.</strong> Reminders are blocked until their status is updated in Streaming.</div>';return}
 if(s.category==='upcoming'){$('compose').innerHTML='<div class="notice"><strong>Renewal is more than seven days away.</strong> Reminders appear in the seven-day window. Current scheduled date: '+esc(dateLabel(s.dueDate))+'.</div>';return}
 const sent=logged(s),hasPhone=!!phone(s.whatsapp),hasUpdate=!!String(state.data.settings.recommendedUpdate||'').trim();
 const help=s.category==='past_date'?'This date has already passed. The message asks the customer to confirm their renewal; it does not claim a debt.':'Use this draft as a courteous renewal notice, not an invoice or receipt.';
 $('compose').innerHTML='<p class="muted">'+esc(s.customer)+' · '+esc(s.service)+' · '+esc(dateLabel(s.dueDate))+'</p>'+
  '<p class="muted">'+esc(help)+'</p>'+
  (sent?'<div class="notice"><strong>Already recorded as sent for this renewal stage.</strong> Change the renewal date in Streaming when the next verified renewal period is established.</div>':'')+
  '<div class="form"><label>Custom WhatsApp message<textarea id="draft" rows="8" maxlength="2000">'+esc(lastDraft||defaultText(s))+'</textarea></label>'+
  '<label class="checkbox"><input type="checkbox" id="include-update" '+(hasUpdate?'':'disabled')+'> Add the optional AMC service update (only with customer consent)</label>'+
  '<label class="checkbox hidden" id="consent-row"><input type="checkbox" id="consent"> I confirm this customer opted in to promotional updates</label>'+
  (!hasUpdate?'<p class="muted">Set an optional recommended update in the templates section below if needed.</p>':'')+
  (!hasPhone?'<p class="muted">This customer has no valid WhatsApp number on file. Update it in Streaming first.</p>':'')+
  '<div class="btn-row"><button type="button" class="primary" id="open-whatsapp" '+(!hasPhone||sent?'disabled':'')+'>Open WhatsApp draft</button><button type="button" class="light" id="copy-message">Copy message</button></div>'+
  '<label class="checkbox"><input type="checkbox" id="actually-sent" '+(sent?'disabled':'')+'> I have actually sent this message to the customer</label>'+
  '<button type="button" class="light" id="mark-sent" disabled>Record as sent</button></div>';
 $('draft')?.addEventListener('input',e=>{lastDraft=e.target.value});
 $('include-update')?.addEventListener('change',e=>{state.includeUpdate=e.target.checked;$('consent-row').classList.toggle('hidden',!state.includeUpdate);if(!state.includeUpdate){state.confirmedConsent=false;$('consent').checked=false}});
 $('consent')?.addEventListener('change',e=>{state.confirmedConsent=e.target.checked});
 $('copy-message')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(outputText(s));flash('Message copied.')}catch{flash('Copy was blocked; select the text manually.',true)}});
 $('open-whatsapp')?.addEventListener('click',()=>{
   if(state.includeUpdate&&!state.confirmedConsent){flash('Confirm marketing consent or leave the optional update unchecked.',true);return}
   const message=outputText(s);if(message.length<10){flash('Please finish the message first.',true);return}
   window.open('https://wa.me/'+phone(s.whatsapp)+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
   flash('WhatsApp draft opened. Only mark it sent after you actually send it.');
 });
 $('actually-sent')?.addEventListener('change',e=>{$('mark-sent').disabled=!e.target.checked});
 $('mark-sent')?.addEventListener('click',async()=>{
   if(state.includeUpdate&&!state.confirmedConsent){flash('Marketing consent must be confirmed before recording a promotional update.',true);return}
   const message=outputText(s);if(message.length<10){flash('Message is too short.',true);return}
   if(!confirm('Confirm you already SENT this exact reminder via WhatsApp? Opening WhatsApp alone does not count.'))return;
   try{await api('mark_sent','POST',{subscriptionId:s.id,dueDate:s.dueDate,stage:s.stage,message,confirmedSent:true,includedRecommendation:state.includeUpdate,marketingConsentConfirmed:state.confirmedConsent});flash('Reminder recorded as sent.');lastDraft='';await reload()}catch(e){flash(e.message,true)}
 });
}
function fillSettings(){
 const form=$('settings-form');for(const key of ['friendlyTemplate','dayTemplate','followupTemplate','recommendedUpdate'])form.elements[key].value=state.data.settings[key]||'';
}
function render(){if(!state.data)return;renderStats();renderList();renderCompose();fillSettings()}
async function reload(){
 $('loading').classList.remove('hidden');
 try{
  const res=await fetch('/.netlify/functions/henry-auth?action=session',{credentials:'same-origin',cache:'no-store'});
  const auth=await res.json();if(!auth.authenticated){$('sign-in').classList.remove('hidden');$('workspace').classList.add('hidden');return}
  $('sign-in').classList.add('hidden');
  state.data=await api('overview');$('workspace').classList.remove('hidden');
  if(state.selectedId&&!state.data.subscriptions.some(s=>s.id===state.selectedId))state.selectedId='';
  render();
 }catch(e){flash(e.message,true)}finally{$('loading').classList.add('hidden')}
}
$('service-filter').addEventListener('change',e=>{state.service=e.target.value;state.selectedId='';lastDraft='';render()});
$('settings-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const body=Object.fromEntries(new FormData(e.currentTarget).entries());
 try{const res=await api('save_settings','POST',body);state.data.settings=res.settings;lastDraft='';render();flash('Saved templates. New drafts use your updated wording.')}catch(e){flash(e.message,true)}
});
$('reload').addEventListener('click',reload);reload();
