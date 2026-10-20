(() => {
  const streamingRoot = document.querySelector('#streaming-plans');
  const form = document.querySelector('#streaming-form');
  const catalog = Array.isArray(window.AMC_DIGITAL_CATALOG) ? window.AMC_DIGITAL_CATALOG : [];
  const streamingSection = catalog.find(section => section.section === 'Streaming & Entertainment');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  const itemCard = (item, itemIndex) => `
    <article class="topup-card streaming-plan-card">
      <div class="topup-head"><div><small>${esc(item.eyebrow || 'Streaming')}</small><h3>${esc(item.name)}</h3>${item.tag ? `<span class="catalog-badge">${esc(item.tag)}</span>` : ''}</div><span>${String(itemIndex + 1).padStart(2,'0')}</span></div>
      <div class="price-list">
        ${(item.packages || []).map(pkg => `<div class="price-row"><span>${esc(pkg.label)}</span><strong>${esc(pkg.price)}</strong><button type="button" class="mini-select" data-stream-select data-service="${esc(item.name)}" data-package="${esc(pkg.label)}" data-price="${esc(pkg.price)}">Select</button></div>`).join('')}
      </div>
      ${item.note ? `<p class="catalog-note">${esc(item.note)}</p>` : ''}
    </article>`;

  if (streamingRoot && streamingSection) {
    streamingRoot.innerHTML = (streamingSection.items || []).map(itemCard).join('');
  }

  if (!form || !streamingSection) return;
  const service = form.elements['service'];
  const pkg = form.elements['package'];
  const price = form.elements['amc-price'];
  (streamingSection.items || []).forEach(item => {
    const option = document.createElement('option');
    option.value = item.name;
    option.textContent = item.name;
    service.appendChild(option);
  });

  document.querySelectorAll('[data-stream-select]').forEach(btn => btn.addEventListener('click', () => {
    service.value = btn.dataset.service || '';
    pkg.value = btn.dataset.package || '';
    price.value = btn.dataset.price || '';
    document.querySelector('#streaming-request')?.scrollIntoView({behavior:'smooth', block:'start'});
    pkg.focus();
  }));
})();
