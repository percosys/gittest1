(() => {
  const grid = document.getElementById('grid');
  const layoutSelect = document.getElementById('layoutSelect');
  const deviceCount = document.getElementById('deviceCount');

  let snapshotInterval = 2000;
  const snapshotTimers = new Map();

  layoutSelect.addEventListener('change', () => {
    const val = layoutSelect.value;
    if (val === 'auto') {
      grid.removeAttribute('data-cols');
    } else {
      grid.dataset.cols = val;
    }
  });

  async function init() {
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      snapshotInterval = data.snapshotInterval || 2000;
      deviceCount.textContent = `${data.devices.length} devices`;
      renderDevices(data.devices);
    } catch (err) {
      grid.innerHTML = `<div class="feed-status"><span class="icon">&#9888;</span><span>Failed to load devices: ${err.message}</span></div>`;
    }
  }

  function renderDevices(devices) {
    grid.innerHTML = '';
    devices.forEach(device => {
      const card = createDeviceCard(device);
      grid.appendChild(card);
    });
  }

  function createDeviceCard(device) {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.dataset.id = device.id;

    const typeClass = device.type === 'pikvm' ? 'pikvm' : '';

    const hasPower = device.type === 'pikvm';

    card.innerHTML = `
      <div class="device-header">
        <span class="device-name">
          <span class="device-type ${typeClass}">${device.type}</span>
          ${escapeHtml(device.name)}
        </span>
        <div class="device-actions">
          ${hasPower ? `
          <div class="power-controls">
            <span class="power-led" id="led-${device.id}" title="Power status"></span>
            <button class="btn-power btn-power-on" data-action="on" title="Power On">&#9654;</button>
            <button class="btn-power btn-power-off" data-action="off" title="Power Off (short press)">&#9724;</button>
            <button class="btn-power btn-power-force" data-action="off_hard" title="Force Off (long press)">&#9632;</button>
            <button class="btn-power btn-power-reset" data-action="reset" title="Reset">&#8635;</button>
          </div>
          ` : ''}
          <button class="btn-open" title="Open device UI">&#8599;</button>
          <button class="btn-fullscreen" title="Toggle fullscreen">&#9974;</button>
        </div>
      </div>
      <div class="feed-container">
        <div class="feed-status" id="status-${device.id}">
          <div class="spinner"></div>
          <span>Connecting...</span>
        </div>
      </div>
    `;

    const feedContainer = card.querySelector('.feed-container');
    const status = card.querySelector('.feed-status');

    // Open device UI in new tab
    card.querySelector('.btn-open').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(device.host, '_blank');
    });

    // Fullscreen toggle
    card.querySelector('.btn-fullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('fullscreen');
    });

    // ESC to exit fullscreen
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && card.classList.contains('fullscreen')) {
        card.classList.remove('fullscreen');
      }
    });

    // Power controls
    if (hasPower) {
      setupPowerControls(device, card);
    }

    if (device.type === 'pikvm') {
      setupPikvmFeed(device, feedContainer, status);
    } else if (device.type === 'jetkvm') {
      setupJetkvmFeed(device, feedContainer, status);
    }

    return card;
  }

  function setupPowerControls(device, card) {
    const led = card.querySelector('.power-led');
    const buttons = card.querySelectorAll('.btn-power');

    // Poll power LED state
    async function updateLed() {
      try {
        const res = await fetch(`/api/power/${device.id}`);
        const data = await res.json();
        const powerOn = data?.result?.leds?.power;
        if (powerOn === true) {
          led.classList.add('on');
          led.classList.remove('off');
          led.title = 'Power: ON';
        } else if (powerOn === false) {
          led.classList.remove('on');
          led.classList.add('off');
          led.title = 'Power: OFF';
        } else {
          led.classList.remove('on', 'off');
          led.title = 'Power: Unknown';
        }
      } catch {
        led.classList.remove('on', 'off');
      }
    }

    updateLed();
    setInterval(updateLed, 5000);

    // Power action buttons
    buttons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;

        // Confirm destructive actions
        if (action === 'off_hard') {
          if (!confirm(`Force power off ${device.name}? This is equivalent to holding the power button.`)) return;
        } else if (action === 'reset') {
          if (!confirm(`Reset ${device.name}?`)) return;
        }

        btn.disabled = true;
        btn.classList.add('sending');
        try {
          const res = await fetch(`/api/power/${device.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });
          const data = await res.json();
          if (!res.ok) {
            alert(`Power action failed: ${data.error}`);
          }
          // Refresh LED after a short delay
          setTimeout(updateLed, 1500);
        } catch (err) {
          alert(`Power action failed: ${err.message}`);
        } finally {
          btn.disabled = false;
          btn.classList.remove('sending');
        }
      });
    });
  }

  function setupPikvmFeed(device, container, status) {
    const img = document.createElement('img');
    img.alt = device.name;
    img.style.display = 'none';

    let errorCount = 0;

    function loadSnapshot() {
      const url = `/api/snapshot/${device.id}?t=${Date.now()}`;
      img.src = url;
    }

    img.addEventListener('load', () => {
      img.style.display = 'block';
      status.classList.add('hidden');
      errorCount = 0;
    });

    img.addEventListener('error', () => {
      errorCount++;
      if (errorCount >= 3) {
        status.classList.remove('hidden');
        status.innerHTML = `<span class="icon">&#128247;</span><span>No signal from ${escapeHtml(device.name)}</span>`;
      }
    });

    container.appendChild(img);
    loadSnapshot();

    const timer = setInterval(loadSnapshot, snapshotInterval);
    snapshotTimers.set(device.id, timer);
  }

  function setupJetkvmFeed(device, container, status) {
    const iframe = document.createElement('iframe');
    iframe.src = device.host;
    iframe.allow = 'autoplay; fullscreen';
    iframe.loading = 'lazy';

    iframe.addEventListener('load', () => {
      status.classList.add('hidden');
    });

    // For iframes we can't detect errors across origins,
    // so hide the spinner after a timeout
    setTimeout(() => {
      status.classList.add('hidden');
    }, 5000);

    container.appendChild(iframe);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  init();
})();
