(() => {
  const calc = document.querySelector('[data-card-service-estimator]');
  if (!calc) return;

  const usdInput = calc.querySelector('[data-card-usd]');
  const downOut = calc.querySelector('[data-card-downpayment]');
  const balanceOut = calc.querySelector('[data-card-balance]');
  const totalOut = calc.querySelector('[data-card-total]');
  const exampleOut = calc.querySelector('[data-card-example]');
  const money = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n));

  const update = () => {
    const usd = Math.max(parseFloat(usdInput?.value) || 0, 0);
    const down = usd * 240;
    const balance = usd * 120;
    const total = usd * 360;

    if (downOut) downOut.textContent = `GYD $${money(down)}`;
    if (balanceOut) balanceOut.textContent = `GYD $${money(balance)}`;
    if (totalOut) totalOut.textContent = `GYD $${money(total)}`;
    if (exampleOut) {
      exampleOut.textContent = usd > 0
        ? `US$${usd.toFixed(2)} × GYD $240 = GYD $${money(down)} down payment · GYD $${money(balance)} balance on arrival · GYD $${money(total)} total card-service cost.`
        : 'Example: US$13.00 → GYD $3,120 down payment + GYD $1,560 balance on arrival = GYD $4,680 total.';
    }
  };

  usdInput?.addEventListener('input', update);
  update();
})();
