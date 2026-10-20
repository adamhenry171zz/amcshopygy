(() => {
  const calc = document.querySelector('[data-shein-item-calculator]');
  if (!calc) return;
  const list = calc.querySelector('[data-shein-items]');
  const add = calc.querySelector('[data-add-shein-item]');
  const cardOut = calc.querySelector('[data-shein-card-subtotal]');
  const downOut = calc.querySelector('[data-shein-downpayment]');
  const cardBalanceOut = calc.querySelector('[data-shein-card-balance]');
  const heavyOut = calc.querySelector('[data-shein-heavy-total]');
  const arrivalOut = calc.querySelector('[data-shein-arrival-balance]');
  const grandOut = calc.querySelector('[data-shein-grand-total]');
  const money = n => new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(Math.round(n));
  const shippingFor = weight => {
    const w = Math.max(Number(weight) || 0, 0);
    if (w <= 3) return 0;
    const billable = Math.max(w, 1);
    const rate = billable <= 10 ? 1500 : billable <= 25 ? 1300 : billable <= 55 ? 1200 : billable <= 99 ? 1100 : 1050;
    return billable * rate;
  };
  const rowTemplate = index => {
    const el = document.createElement('div');
    el.className = 'shein-item-row';
    el.innerHTML = `<div class="shein-row-index">${index + 1}</div><div class="field"><label>Item price (USD)</label><input type="number" min="0" step="0.01" inputmode="decimal" data-item-usd placeholder="10.00"></div><div class="field"><label>Estimated weight (lb)</label><input type="number" min="0.01" step="0.01" inputmode="decimal" data-item-weight value="1"></div><div class="shein-row-result"><small>Estimated AMC total</small><strong data-item-total>GYD $0</strong><span data-item-note>USD × GYD $360</span></div><button class="shein-remove" type="button" data-remove-item aria-label="Remove item">×</button>`;
    return el;
  };
  const renumber = () => list.querySelectorAll('.shein-item-row').forEach((row, i) => { row.querySelector('.shein-row-index').textContent = i + 1; });
  const update = () => {
    let card = 0, down = 0, cardBalance = 0, heavy = 0;
    list.querySelectorAll('.shein-item-row').forEach(row => {
      const usd = Math.max(parseFloat(row.querySelector('[data-item-usd]').value) || 0, 0);
      const weight = Math.max(parseFloat(row.querySelector('[data-item-weight]').value) || 0, 0);
      const base = usd * 360;
      const itemDown = usd * 240;
      const itemBalance = usd * 120;
      const shipping = shippingFor(weight);
      card += base;
      down += itemDown;
      cardBalance += itemBalance;
      heavy += shipping;
      row.querySelector('[data-item-total]').textContent = 'GYD $' + money(base + shipping);
      row.querySelector('[data-item-note]').textContent = weight > 3
        ? `Down payment GYD $${money(itemDown)} · arrival balance GYD $${money(itemBalance + shipping)} incl. heavy-item shipping`
        : `Down payment GYD $${money(itemDown)} · balance on arrival GYD $${money(itemBalance)}`;
    });
    const arrivalBalance = cardBalance + heavy;
    if (cardOut) cardOut.textContent = 'GYD $' + money(card);
    if (downOut) downOut.textContent = 'GYD $' + money(down);
    if (cardBalanceOut) cardBalanceOut.textContent = 'GYD $' + money(cardBalance);
    if (heavyOut) heavyOut.textContent = 'GYD $' + money(heavy);
    if (arrivalOut) arrivalOut.textContent = 'GYD $' + money(arrivalBalance);
    if (grandOut) grandOut.textContent = 'GYD $' + money(card + heavy);
  };
  const attach = row => {
    row.querySelectorAll('input').forEach(input => input.addEventListener('input', update));
    row.querySelector('[data-remove-item]').addEventListener('click', () => {
      if (list.children.length <= 1) {
        row.querySelector('[data-item-usd]').value = '';
        row.querySelector('[data-item-weight]').value = '1';
      } else row.remove();
      renumber(); update();
    });
  };
  const addRow = () => {
    if (list.children.length >= 20) return;
    const row = rowTemplate(list.children.length); list.appendChild(row); attach(row); update();
  };
  add.addEventListener('click', addRow);
  addRow();
})();
