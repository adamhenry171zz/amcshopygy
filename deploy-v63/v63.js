(()=>{
  const filterButtons=[...document.querySelectorAll('[data-stream-filter]')];
  const offerCards=[...document.querySelectorAll('[data-stream-category]')];
  filterButtons.forEach(btn=>btn.addEventListener('click',()=>{
    const filter=btn.dataset.streamFilter||'all';
    filterButtons.forEach(x=>x.classList.toggle('active',x===btn));
    offerCards.forEach(card=>{
      const tags=String(card.dataset.streamCategory||'').split(/\s+/);
      card.classList.toggle('is-hidden',filter!=='all'&&!tags.includes(filter));
    });
  }));

  document.querySelectorAll('.streaming-v63 img').forEach(img=>{
    img.addEventListener('error',()=>{
      img.style.display='none';
      const fallback=img.parentElement?.querySelector('.logo-fallback')||img.nextElementSibling;
      if(fallback)fallback.style.display='inline-flex';
    },{once:true});
  });

  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const stage=document.createElement('div');
    stage.className='amc-santa-stage';
    stage.setAttribute('aria-hidden','true');
    stage.innerHTML='<div class="amc-santa-run"><span>🦌</span><span>🦌</span><span>🦌</span><span>✨</span><span>🎅🛷</span><span class="amc-santa-package">AMC 📦</span></div>';
    document.body.appendChild(stage);
    requestAnimationFrame(()=>setTimeout(()=>stage.querySelector('.amc-santa-run')?.classList.add('run'),850));
    setTimeout(()=>stage.remove(),9500);

    const snow=document.createElement('div');
    snow.className='amc-snow-layer';
    snow.setAttribute('aria-hidden','true');
    const count=window.innerWidth<720?12:20;
    for(let i=0;i<count;i++){
      const flake=document.createElement('span');
      flake.className='amc-snowflake';
      flake.textContent='❄';
      flake.style.left=`${Math.random()*100}%`;
      flake.style.fontSize=`${8+Math.random()*9}px`;
      flake.style.opacity=`${.18+Math.random()*.45}`;
      flake.style.animationDuration=`${7+Math.random()*7}s`;
      flake.style.animationDelay=`${Math.random()*4}s`;
      snow.appendChild(flake);
    }
    document.body.appendChild(snow);
    setTimeout(()=>snow.remove(),17000);
  }
})();
