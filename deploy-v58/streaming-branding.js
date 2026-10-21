(() => {
  const logoFor = name => {
    const n = (name || '').toLowerCase();
    if (n.includes('netflix')) return ['https://cdn.simpleicons.org/netflix/E50914', 'Netflix'];
    if (n.includes('crunchyroll')) return ['https://cdn.simpleicons.org/crunchyroll/F47521', 'Crunchyroll'];
    if (n.includes('disney') && n.includes('prime')) return ['multi', 'Disney+ + Prime'];
    if (n.includes('disney')) return ['https://cdn.simpleicons.org/disneyplus/113CCF', 'Disney+'];
    if (n.includes('prime')) return ['https://cdn.simpleicons.org/primevideo/00A8E1', 'Prime Video'];
    if (n.includes('paramount')) return ['https://cdn.simpleicons.org/paramountplus/0064FF', 'Paramount+'];
    if (n.includes('hbo') || n.includes('max')) return ['https://cdn.simpleicons.org/hbo/000000', 'HBO Max'];
    if (n.includes('hulu')) return ['https://cdn.simpleicons.org/hulu/1CE783', 'Hulu'];
    return [null, name || 'AMC Streaming'];
  };

  const fallback = (label) => {
    const mark = document.createElement('span');
    mark.className = 'stream-logo-fallback';
    const words = String(label || 'AMC').trim().split(/\s+/).filter(Boolean);
    mark.textContent = words.slice(0, 2).map(w => w[0]).join('').toUpperCase() || '▶';
    mark.setAttribute('aria-hidden', 'true');
    return mark;
  };

  document.querySelectorAll('#streaming-plans .streaming-plan-card').forEach(card => {
    if (card.querySelector('.stream-card-brand')) return;
    const title = card.querySelector('h3');
    const host = card.querySelector('.topup-head > div:first-child');
    if (!title || !host) return;
    const name = title.textContent.trim();
    const [src, alt] = logoFor(name);
    const brand = document.createElement('div');
    brand.className = 'stream-card-brand';
    if (src === 'multi') {
      const stack = document.createElement('span');
      stack.className = 'stream-card-logo-stack';
      [['https://cdn.simpleicons.org/disneyplus/113CCF','Disney+'],['https://cdn.simpleicons.org/primevideo/00A8E1','Prime Video']].forEach(([url, label]) => {
        const img = document.createElement('img');
        img.src = url; img.alt = `${label} logo`; img.loading = 'lazy';
        img.onerror = () => img.replaceWith(fallback(label));
        stack.appendChild(img);
      });
      brand.appendChild(stack);
    } else if (src) {
      const img = document.createElement('img');
      img.className = 'stream-card-logo';
      img.src = src;
      img.alt = `${alt} logo`;
      img.loading = 'lazy';
      img.onerror = () => img.replaceWith(fallback(alt));
      brand.appendChild(img);
    } else {
      brand.appendChild(fallback(alt));
    }
    host.prepend(brand);
  });

  document.querySelectorAll('.service-logo-rail img, .service-brand img').forEach(img => {
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      const label = img.alt || 'AMC';
      img.replaceWith(fallback(label));
    }, {once:true});
  });
})();
