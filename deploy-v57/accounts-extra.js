(() => {
  const form = document.querySelector('#account-form');
  if (!form) return;
  const service = form.elements['service'];
  const pkg = form.elements['package'];
  const price = form.elements['amc-price'];
  const ensureOption = value => {
    if (!value || [...service.options].some(o => o.value === value)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    service.appendChild(option);
  };
  document.querySelectorAll('[data-v57-account-select]').forEach(btn => {
    ensureOption(btn.dataset.service || '');
    btn.addEventListener('click', () => {
      service.value = btn.dataset.service || '';
      pkg.value = btn.dataset.package || '';
      price.value = btn.dataset.price || '';
      document.querySelector('#account-request')?.scrollIntoView({behavior:'smooth', block:'start'});
      pkg.focus();
    });
  });
})();
