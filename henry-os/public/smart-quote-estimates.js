(()=>{
 const endpoint='/.netlify/functions/henry-shein-quotes?action=estimate';
 const money=n=>'GYD $'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
 const put=(el,v)=>{if(el)el.textContent=v};
 async function estimate(items){const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items}),cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Estimate unavailable');return d}
 function scheduler(run){let seq=0,timer;return ()=>{const id=++seq;clearTimeout(timer);timer=setTimeout(()=>run(()=>seq===id),350)}}
 const general=document.querySelector('[data-card-service-estimator]');
 if(general){
  const input=general.querySelector('[data-card-usd]'),example=general.querySelector('[data-card-example]'),outputs=['[data-card-downpayment]','[data-card-balance]','[data-card-total]'].map(s=>general.querySelector(s));
  const update=scheduler(async current=>{const n=Number(input.value||0);outputs.forEach(x=>put(x,'—'));put(example,'Calculating current estimate…');try{const t=await estimate([{price:n,weight:0}]);if(!current())return;[t.down,t.balance,t.overall].forEach((v,i)=>put(outputs[i],money(v)));put(example,'Estimate only. Final charges may vary after AMC verifies your order.')}catch(e){if(current())put(example,e.message+' — please try again.')}});
  input.addEventListener('input',update);update();
 }
 const calc=document.querySelector('[data-shein-item-calculator]');if(!calc)return;
 const list=calc.querySelector('[data-shein-items]'),add=calc.querySelector('[data-add-shein-item]');
 const labels=['card-subtotal','downpayment','card-balance','heavy-total','arrival-balance','grand-total'];const outs=labels.map(k=>calc.querySelector('[data-shein-'+k+']'));
 const notice=document.createElement('p');notice.className='notice';notice.setAttribute('role','status');list.after(notice);
 const update=scheduler(async current=>{
  const rows=[...list.children],items=rows.map(r=>({price:Number(r.querySelector('[data-item-usd]').value||0),weight:Number(r.querySelector('[data-item-weight]').value||0)}));
  outs.forEach(x=>put(x,'—'));rows.forEach(r=>put(r.querySelector('[data-item-total]'),'—'));put(notice,'Calculating current estimate…');
  try{const t=await estimate(items);if(!current())return;
   [t.cardSubtotal,t.down,t.cardSubtotal-t.down,t.heavyShippingGyd,t.balance,t.overall].forEach((v,i)=>put(outs[i],money(v)));
   rows.forEach((r,i)=>{const v=t.rows[i];put(r.querySelector('[data-item-total]'),money(v.overall));put(r.querySelector('[data-item-note]'),'Deposit '+money(v.down)+' · arrival '+money(v.balance))});
   put(notice,'Estimate only. Per-item amounts are rounded separately and may differ from the combined total.');
  }catch(e){if(current())put(notice,e.message+' — please try again.')}
 });
 const renumber=()=>[...list.children].forEach((r,i)=>put(r.querySelector('.shein-row-index'),i+1));
 function addRow(){if(list.children.length>=20)return;const el=document.createElement('div');el.className='shein-item-row';el.innerHTML='<div class="shein-row-index"></div><div class="field"><label>Item price (USD)</label><input type="number" min="0" max="10000" step="0.01" inputmode="decimal" data-item-usd placeholder="10.00"></div><div class="field"><label>Estimated weight (lb)</label><input type="number" min="0" max="500" step="0.01" inputmode="decimal" data-item-weight value="1"></div><div class="shein-row-result"><small>Estimated AMC total</small><strong data-item-total>—</strong><span data-item-note></span></div><button class="shein-remove" type="button" data-remove-item aria-label="Remove item">×</button>';
 list.append(el);el.querySelectorAll('input').forEach(i=>i.addEventListener('input',update));el.querySelector('[data-remove-item]').onclick=()=>{if(list.children.length===1){el.querySelector('[data-item-usd]').value='';el.querySelector('[data-item-weight]').value='1'}else el.remove();renumber();update()};renumber();update()}
 add.addEventListener('click',addRow);addRow();
})();
