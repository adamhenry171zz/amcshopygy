(() => {
  const form = document.querySelector('#account-form');
  if (!form) return;
  const service = form.elements['service'];
  const pkg = form.elements['package'];
  const price = form.elements['amc-price'];
  document.querySelectorAll('[data-account-select]').forEach(btn => btn.addEventListener('click', () => {
    service.value = btn.dataset.service || '';
    pkg.value = btn.dataset.package || '';
    price.value = btn.dataset.price || '';
    document.querySelector('#account-request')?.scrollIntoView({behavior:'smooth', block:'start'});
    pkg.focus();
  }));
})();
