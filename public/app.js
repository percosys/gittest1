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

    card.innerHTML = `
      <div class="device-header">
        <span class="device-name">
          <span class="device-type ${typeClass}">${device.type}</span>
          ${escapeHtml(device.name)}
        </span>
        <div class="device-actions">
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

    if (device.type === 'pikvm') {
      setupPikvmFeed(device, feedContainer, status);
    } else if (device.type === 'jetkvm') {
      setupJetkvmFeed(device, feedContainer, status);
    }

    return card;
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
