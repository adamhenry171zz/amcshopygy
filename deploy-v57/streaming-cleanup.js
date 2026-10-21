(() => {
  document.querySelectorAll('#streaming-plans .streaming-plan-card').forEach(card => {
    const name = card.querySelector('h3')?.textContent?.trim().toLowerCase();
    if (name === 'iptv') card.remove();
  });
})();
