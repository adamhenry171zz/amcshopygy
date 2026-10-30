(() => {
  const form = document.querySelector('#amc-delivery-v64-form');
  if (!form) return;

  const submitBtn = document.querySelector("#delivery-submit");
  const result = document.querySelector("#delivery-result");
  const dateInput = form.elements["date"];
  if (dateInput) { const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000); dateInput.min = local.toISOString().slice(0, 10); }

  const showResult = (html, error = false) => {
    result.innerHTML = html;
    result.className = `delivery-result${error ? ' error' : ''}`;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    result.classList.add('hidden');

    const data = new FormData(form);
    const payload = {
      requestType: data.get('kind'),
      customer: data.get('customer'),
      whatsapp: data.get('phone'),
      packageRef: data.get('reference'),
      weight: data.get('weight'),
      preferredDate: data.get('date'),
      preferredTime: data.get('time'),
      address: data.get('address'),
      landmark: data.get('landmark'),
      mapLink: '',
      consent: data.get('consent') === 'on'
    };

    try {
      const response = await fetch('/.netlify/functions/henry-delivery-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      let body = {};
      try { body = await response.json(); } catch {}
      if (!response.ok) throw new Error(body.error || 'We could not submit the request right now.');

      const fields = [
        ['Request', payload.requestType],
        ['Reference', body.reference],
        ['Name', payload.customer],
        ['Package / mailbox reference', payload.packageRef],
        ['Estimated weight (lbs)', payload.weight],
        ['Preferred date', payload.preferredDate],
        ['Preferred time', payload.preferredTime],
        ['Address / area', payload.address],
        ['Landmark', payload.landmark],
        ['Location', 'Customer will send Current Location in WhatsApp (not Live Location)']
      ].filter(([, value]) => String(value || '').trim());
      const whatsappText = `Hello AMC Shopping, I submitted a delivery request online.\n\n${fields.map(([key, value]) => `${key}: ${value}`).join('\n')}\n\n📍 FINAL STEP: I will now tap + / Attach → Location → Send Your Current Location (NOT Share Live Location).\n\nI understand the request is subject to AMC confirmation.`;
      const wa = `https://wa.me/5926042826?text=${encodeURIComponent(whatsappText)}`;
      showResult(`<strong>Request saved ✓</strong><br>Your reference is <b>${body.reference}</b>.<br><a class="btn primary" href="${wa}" target="_blank" rel="noopener">Continue to WhatsApp &amp; Share Current Location →</a><br><small>In WhatsApp tap + / Attach → Location → <b>Send Your Current Location</b>. Do not share Live Location. Delivery is confirmed only by AMC.</small>`);
      window.location.assign(wa);
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showResult(`<strong>Request not submitted.</strong><br>${String(error.message || error)}<br><a href="https://wa.me/5926042826" target="_blank" rel="noopener">Contact AMC on WhatsApp →</a>`, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Continue to WhatsApp & Share Location →';
    }
  });
})();
