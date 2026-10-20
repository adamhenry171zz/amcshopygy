(() => {
  const form = document.querySelector('form[name="amc-quotation-request"]');
  const tabs = document.querySelectorAll('[data-store]');
  const select = document.querySelector('[name="store"]');
  const panels = document.querySelectorAll('[data-store-panel]');
  const genericPanel = document.querySelector('[data-store-panel="GENERAL"]');
  const genericName = document.querySelector('[data-generic-store-name]');
  const otherNameWrap = document.querySelector('[data-other-store-name]');
  const otherNameInput = form?.elements?.['other-store-name'];

  const setStore = store => {
    if (select) select.value = store;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.store === store));
    panels.forEach(p => {
      const panel = p.dataset.storePanel;
      p.hidden = panel === 'GENERAL' ? (store === 'SHEIN' || store === 'Amazon') : panel !== store;
    });
    if (genericPanel && genericName) genericName.textContent = store === 'Other Store' ? 'your selected store' : store;
    if (otherNameWrap) otherNameWrap.hidden = store !== 'Other Store';
    if (otherNameInput) otherNameInput.required = store === 'Other Store';
  };

  tabs.forEach(t => t.addEventListener('click', () => setStore(t.dataset.store)));
  if (select) setStore(select.value || 'SHEIN');

  if (form) {
    form.addEventListener('submit', event => {
      const store = select.value;
      let message = '';
      if (store === 'SHEIN') {
        const cart = form.elements['shein-cart-link'].value.trim();
        const products = ['shein-product-1','shein-product-2','shein-product-3'].some(name => form.elements[name].value.trim());
        const usa = form.elements['shein-usa-confirmed'].checked;
        if (!cart && !products) message = 'Please add your SHEIN cart/share link or at least one SHEIN product link.';
        else if (!usa) message = 'Please confirm that your SHEIN shopping location/account is set to the United States.';
      } else if (store === 'Amazon') {
        const first = form.elements['amazon-link-1'].value.trim();
        const shared = form.elements['amazon-shared-list'].value.trim();
        if (!first && !shared) message = 'Please add at least one Amazon item link or a shared Amazon list link.';
      } else {
        const links = ['store-link-1','store-link-2','store-link-3','store-cart-link']
          .some(name => form.elements[name]?.value?.trim());
        if (store === 'Other Store' && !form.elements['other-store-name'].value.trim()) message = 'Please enter the name of the website or store you want AMC to quote.';
        else if (!links) message = `Please add at least one ${store === 'Other Store' ? 'product' : store} link or cart/share link.`;
      }

      const files = ['screenshot-1','screenshot-2','screenshot-3']
        .map(name => form.elements[name]?.files?.[0]).filter(Boolean);
      const total = files.reduce((sum,file) => sum + file.size, 0);
      if (!message && total > 7.5 * 1024 * 1024) message = 'Your screenshots are too large together. Please keep the total upload below about 7.5 MB.';

      if (message) {
        event.preventDefault();
        alert(message);
      }
    });
  }
})();
