(() => {
  const addOption = (select, value) => {
    if (!select || !value || [...select.options].some(o => o.value === value)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  };

  const accountForm = document.querySelector('#account-form');
  if (accountForm) {
    const service = accountForm.elements['service'];
    const pkg = accountForm.elements['package'];
    const price = accountForm.elements['amc-price'];
    document.querySelectorAll('[data-v59-account-select]').forEach(btn => {
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

  const streamingForm = document.querySelector('#streaming-form');
  if (streamingForm) {
    const service = streamingForm.elements['service'];
    const pkg = streamingForm.elements['package'];
    const price = streamingForm.elements['amc-price'];
    document.querySelectorAll('[data-v59-stream-select]').forEach(btn => {
      addOption(service, btn.dataset.service || '');
      btn.addEventListener('click', () => {
        service.value = btn.dataset.service || '';
        pkg.value = btn.dataset.package || '';
        price.value = btn.dataset.price || '';
        document.querySelector('#streaming-request')?.scrollIntoView({behavior:'smooth', block:'start'});
        pkg.focus();
      });
    });
  }

  document.querySelectorAll('.logo-with-fallback img').forEach(img => {
    const fallback = img.nextElementSibling;
    if (fallback) fallback.style.display = 'none';
    img.addEventListener('error', () => {
      img.style.display = 'none';
      if (fallback) fallback.style.display = 'grid';
    }, {once:true});
  });
})();
