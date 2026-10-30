(() => {
  const LOGOS = [
    [/netflix/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/netflix.svg','Netflix']],
    [/disney/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/disney-plus.svg','Disney+']],
    [/prime/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/prime-video.svg','Prime Video']],
    [/paramount/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/paramount-plus.svg','Paramount+']],
    [/(hbo|max)/i, ['https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/hbomax.svg','HBO Max']],
    [/hulu/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/hulu.svg','Hulu']],
    [/crunchyroll/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/crunchyroll.svg','Crunchyroll']],
    [/spotify/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/spotify.svg','Spotify']],
    [/deezer/i, ['https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/svg/deezer.svg','Deezer']],
    [/starz/i, ['https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/starz.svg','STARZ']],
    [/bet\+/i, ['https://upload.wikimedia.org/wikipedia/commons/0/08/BET%2B_logo_2019.svg','BET+']]
  ];

  const matchLogo = text => {
    const value = String(text || '');
    for (const [pattern, data] of LOGOS) if (pattern.test(value)) return data;
    return null;
  };

  const fallback = label => {
    const span = document.createElement('span');
    span.className = 'stream-logo-fallback v65-logo-fallback';
    const clean = String(label || 'AMC Streaming').replace(/logo/ig,'').trim();
    span.textContent = /iptv/i.test(clean) ? 'IPTV' : /hma|hide my ass/i.test(clean) ? 'HMA' : clean.slice(0,18);
    span.setAttribute('aria-label', clean);
    return span;
  };

  const loadLogo = (img, text) => {
    const found = matchLogo(text || img.alt || '');
    if (!found) return;
    const [src, label] = found;
    img.src = src;
    img.alt = `${label} logo`;
    img.loading = 'lazy';
    img.classList.add('v65-brand-img');
    img.onerror = () => img.replaceWith(fallback(label));
  };

  const brandForCard = card => {
    const title = card.querySelector('h3')?.textContent || card.textContent || '';
    if (/bet\+/i.test(title)) return; // BET+ service has been discontinued and is not presented as an active AMC offer.
    const found = matchLogo(title);
    if (!found && !/iptv|hma|hide my ass/i.test(title)) return;
    if (card.querySelector('.v65-card-logo')) return;
    const host = card.querySelector('.topup-head > div:first-child, .service-brand, .single-logo, .software-brand') || card;
    const wrap = document.createElement('div');
    wrap.className = 'v65-card-logo';
    if (found) {
      const img = document.createElement('img');
      img.src = found[0]; img.alt = `${found[1]} logo`; img.loading = 'lazy';
      img.onerror = () => img.replaceWith(fallback(found[1]));
      wrap.appendChild(img);
    } else wrap.appendChild(fallback(title));
    host.prepend(wrap);
  };

  const apply = root => {
    root.querySelectorAll?.('img').forEach(img => {
      const context = `${img.alt || ''} ${img.closest('article,div')?.querySelector('h3')?.textContent || ''}`;
      loadLogo(img, context);
    });
    root.querySelectorAll?.('#streaming-plans .streaming-plan-card, .featured-service-card, .streaming-offer-card').forEach(brandForCard);
    root.querySelectorAll?.('.service-logo-rail > div, .brand-ribbon-item').forEach(item => {
      const label = item.textContent || item.querySelector('img')?.alt || '';
      const img = item.querySelector('img');
      if (img) loadLogo(img,label);
    });
  };

  const run = () => {
    const page = document.querySelector('main');
    if (!page) return;
    apply(page);
    const observer = new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && apply(n))));
    observer.observe(page,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),12000);
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded',run,{once:true}) : run();
})();
