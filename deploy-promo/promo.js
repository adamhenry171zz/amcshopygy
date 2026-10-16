(() => {
  const defaultEnd = '2026-10-20T23:59:59-04:00';
  const promoEnd = new Date(defaultEnd).getTime();
  const active = () => Date.now() <= promoEnd;

  if (!active()) {
    document.querySelectorAll('[data-membership-promo]').forEach(el => el.hidden = true);
    document.querySelectorAll('[data-promo-expiry]').forEach(el => el.textContent = 'This five-day website relaunch offer has ended.');
    document.querySelectorAll('.promo-plans-section').forEach(el => el.hidden = true);
    document.querySelectorAll('[data-promo-page] .announcement-actions .btn.primary').forEach(a => {
      a.textContent = 'View current membership plans →';
      a.href = 'members.html';
    });
  }

  document.querySelectorAll('[data-promo-countdown]').forEach(clock => {
    const end = new Date(clock.dataset.end || defaultEnd).getTime();
    const update = () => {
      let diff = Math.max(end - Date.now(), 0);
      const days = Math.floor(diff / 86400000); diff %= 86400000;
      const hours = Math.floor(diff / 3600000); diff %= 3600000;
      const minutes = Math.floor(diff / 60000); diff %= 60000;
      const seconds = Math.floor(diff / 1000);
      const set = (sel,val) => { const el = clock.querySelector(sel); if (el) el.textContent = String(val).padStart(2,'0'); };
      set('[data-days]',days); set('[data-hours]',hours); set('[data-minutes]',minutes); set('[data-seconds]',seconds);
      if (Date.now() > end && clock.classList.contains('mini-countdown')) clock.innerHTML = '<b>ENDED</b><span>offer closed</span>';
    };
    update();
    const timer = setInterval(() => { update(); if (Date.now() > end) clearInterval(timer); }, 1000);
  });
})();
