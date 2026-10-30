(() => {
  const form = document.querySelector('#amc-delivery-v64-form');
  if (!form) return;

  const locationBtn = document.querySelector('#use-location');
  const locationStatus = document.querySelector('#location-status');
  const locationLink = document.querySelector('#location-link');
  const manualWrap = document.querySelector('#map-link-wrap');
  const manualInput = document.querySelector('#map-link-manual');
  const showManual = document.querySelector('#show-map-link');
  const submitBtn = document.querySelector('#delivery-submit');
  const result = document.querySelector('#delivery-result');
  const dateInput = form.elements['date'];

  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

  const setLocationStatus = (message, type = '') => {
    locationStatus.textContent = message;
    locationStatus.className = `location-status ${type}`.trim();
  };

  showManual?.addEventListener('click', () => {
    manualWrap?.classList.toggle('hidden');
    if (!manualWrap?.classList.contains('hidden')) manualInput?.focus();
  });

  manualInput?.addEventListener('input', () => {
    if (manualInput.value.trim()) {
      locationLink.value = manualInput.value.trim();
      setLocationStatus('✓ Location link added manually.', 'success');
    } else {
      locationLink.value = '';
      setLocationStatus('No location shared yet.');
    }
  });

  locationBtn?.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('Your browser does not support location sharing. Enter your address and landmark, or paste a Maps link below.', 'error');
      manualWrap?.classList.remove('hidden');
      return;
    }

    locationBtn.disabled = true;
    locationBtn.textContent = '📍 Waiting for permission…';
    setLocationStatus('Your browser may ask you to allow location access. AMC only receives the point attached to this request.');

    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude, accuracy } = position.coords;
        const mapsUrl = `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
        locationLink.value = mapsUrl;
        if (manualInput) manualInput.value = '';
        setLocationStatus(`✓ Location captured successfully${Number.isFinite(accuracy) ? ` (about ${Math.round(accuracy)} m accuracy)` : ''}.`, 'success');
        locationBtn.textContent = '✓ Current Location Added';
        locationBtn.disabled = false;
      },
      error => {
        let message = 'Location could not be captured. Enter your address and landmark instead, or paste a Maps link.';
        if (error.code === 1) message = 'Location permission was not allowed. No problem — enter your address and landmark, or paste a Maps link instead.';
        if (error.code === 2) message = 'Your device could not determine your location. Enter your address and landmark, or paste a Maps link instead.';
        if (error.code === 3) message = 'Location request timed out. Try again, or use your address / Maps link instead.';
        setLocationStatus(message, 'error');
        manualWrap?.classList.remove('hidden');
        locationBtn.textContent = '📍 Try My Current Location Again';
        locationBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });

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
      mapLink: locationLink.value || '',
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
        ['Location', payload.mapLink]
      ].filter(([, value]) => String(value || '').trim());
      const whatsappText = `Hello AMC Shopping, I submitted a delivery request online.\n\n${fields.map(([key, value]) => `${key}: ${value}`).join('\n')}\n\nI understand the request is subject to AMC confirmation.`;
      const wa = `https://wa.me/5926042826?text=${encodeURIComponent(whatsappText)}`;
      showResult(`<strong>Request received ✓</strong><br>Your reference is <b>${body.reference}</b>. AMC will review the request before confirming the delivery.<br><a href="${wa}" target="_blank" rel="noopener">Send the same request on WhatsApp →</a>`);
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showResult(`<strong>Request not submitted.</strong><br>${String(error.message || error)}<br><a href="https://wa.me/5926042826" target="_blank" rel="noopener">Contact AMC on WhatsApp →</a>`, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit delivery request →';
    }
  });
})();
