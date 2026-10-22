(() => {
  const addOption = (select, value) => {
    if (!select || !value || [...select.options].some(o => o.value === value)) return;
    const option = document.createElement('option'); option.value = value; option.textContent = value; select.appendChild(option);
  };

  const accountForm = document.querySelector('#account-form');
  if (accountForm) {
    const service = accountForm.elements['service'];
    const pkg = accountForm.elements['package'];
    const price = accountForm.elements['amc-price'];
    document.querySelectorAll('[data-v60-account-select]').forEach(btn => {
      addOption(service, btn.dataset.service || '');
      btn.addEventListener('click', () => {
        service.value = btn.dataset.service || '';
        pkg.value = btn.dataset.package || '';
        price.value = btn.dataset.price || '';
        document.querySelector('#account-request')?.scrollIntoView({behavior:'smooth', block:'start'});
        pkg.focus();
      });
    });
  }

  const warrantyChip = (host, covered) => {
    if (!host || host.querySelector('.service-warranty-chip')) return;
    const chip = document.createElement('span');
    chip.className = `service-warranty-chip ${covered ? 'yes' : 'no'}`;
    chip.textContent = covered ? '14-DAY LIMITED WARRANTY' : 'NO 14-DAY WARRANTY';
    host.appendChild(chip);
  };

  document.querySelectorAll('#streaming-plans .streaming-plan-card').forEach(card => {
    const title = card.querySelector('h3');
    if (!title) return;
    const n = title.textContent.toLowerCase();
    const covered = !n.includes('netflix') && !n.includes('iptv');
    warrantyChip(title.parentElement, covered);
  });

  document.querySelectorAll('#featured-streaming .featured-service-card, #spotify-plans .featured-service-card, #iptv-extended-plans .featured-service-card').forEach(card => {
    const host = card.querySelector('.service-brand > div:last-child') || card.querySelector('.service-brand');
    const covered = !(card.classList.contains('bundle-card') || card.classList.contains('prime-six') || card.classList.contains('iptv-card'));
    warrantyChip(host, covered);
  });

  const showFallback = img => {
    const parent = img.closest('.logo-with-fallback') || img.parentElement;
    const fallback = img.nextElementSibling?.classList?.contains('fallback-mark') ? img.nextElementSibling : parent?.querySelector('.fallback-mark,.stream-logo-fallback');
    img.style.display = 'none';
    if (fallback) {
      fallback.style.display = 'grid';
      fallback.classList.add('forced-logo-fallback');
    }
  };

  document.querySelectorAll('.software-brand img,.service-brand img,.logo-with-fallback img').forEach(img => {
    const fallback = img.nextElementSibling?.classList?.contains('fallback-mark') ? img.nextElementSibling : img.closest('.logo-with-fallback')?.querySelector('.fallback-mark,.stream-logo-fallback');
    if (fallback && !fallback.classList.contains('forced-logo-fallback')) fallback.style.display = 'none';
    img.addEventListener('error', () => showFallback(img), {once:true});
    if (img.complete && img.naturalWidth === 0) showFallback(img);
  });

  document.querySelectorAll('.software-card').forEach(card => {
    const brand = card.querySelector('.software-brand');
    if (!brand || brand.querySelector('img,.brand-mark,.stream-logo-fallback')) return;
    const title = brand.querySelector('h3')?.textContent?.trim() || 'AMC';
    const mark = document.createElement('div');
    mark.className = 'brand-mark forced-logo-fallback';
    mark.textContent = title.split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase();
    brand.prepend(mark);
  });
})();
