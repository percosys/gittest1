(() => {
  const grid = document.getElementById('grid');
  const layoutSelect = document.getElementById('layoutSelect');
  const deviceCount = document.getElementById('deviceCount');
  const pagingControls = document.getElementById('pagingControls');
  const footer = document.getElementById('footer');

  let allDevices = [];
  let snapshotInterval = 2000;
  let currentPage = 0;
  let perPage = Infinity; // show all by default
  let currentCols = 'auto';
  let currentRows = null; // null means unlimited

  const snapshotTimers = new Map();
  const powerTimers = new Map();

  // Layout presets: [cols, rows] — rows determines per-page count
  const layoutPresets = {
    'auto': null,
    '1x1': [1, 1],
    '2x2': [2, 2],
    '3x3': [3, 3],
    '4x4': [4, 4],
    '5x5': [5, 5],
    '6x6': [6, 6],
    '1': [1, null],
    '2': [2, null],
    '3': [3, null],
    '4': [4, null],
    '5': [5, null],
    '6': [6, null],
  };

  // Persist layout preference
  const savedLayout = localStorage.getItem('kvmLayout');
  if (savedLayout && layoutPresets.hasOwnProperty(savedLayout)) {
    layoutSelect.value = savedLayout;
  }

  layoutSelect.addEventListener('change', () => {
    const val = layoutSelect.value;
    localStorage.setItem('kvmLayout', val);
    applyLayout(val);
  });

  function applyLayout(val) {
    const preset = layoutPresets[val];

    if (!preset) {
      // Auto mode
      grid.removeAttribute('data-cols');
      currentCols = 'auto';
      currentRows = null;
      perPage = Infinity;
    } else {
      const [cols, rows] = preset;
      grid.dataset.cols = cols;
      currentCols = cols;
      currentRows = rows;
      perPage = rows ? cols * rows : Infinity;
    }

    currentPage = 0;
    renderCurrentPage();
  }

  function totalPages() {
    if (perPage === Infinity || allDevices.length === 0) return 1;
    return Math.ceil(allDevices.length / perPage);
  }

  function getPageDevices() {
    if (perPage === Infinity) return allDevices;
    const start = currentPage * perPage;
    return allDevices.slice(start, start + perPage);
  }

  // --- Paging controls ---
  const btnFirst = document.getElementById('btnFirst');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnLast = document.getElementById('btnLast');
  const pageInfo = document.getElementById('pageInfo');
  const btnFirstBottom = document.getElementById('btnFirstBottom');
  const btnPrevBottom = document.getElementById('btnPrevBottom');
  const btnNextBottom = document.getElementById('btnNextBottom');
  const btnLastBottom = document.getElementById('btnLastBottom');
  const pageInfoBottom = document.getElementById('pageInfoBottom');

  function bindPagingBtn(btn, action) {
    btn.addEventListener('click', () => {
      const tp = totalPages();
      if (action === 'first') currentPage = 0;
      else if (action === 'prev') currentPage = Math.max(0, currentPage - 1);
      else if (action === 'next') currentPage = Math.min(tp - 1, currentPage + 1);
      else if (action === 'last') currentPage = tp - 1;
      renderCurrentPage();
    });
  }

  bindPagingBtn(btnFirst, 'first');
  bindPagingBtn(btnPrev, 'prev');
  bindPagingBtn(btnNext, 'next');
  bindPagingBtn(btnLast, 'last');
  bindPagingBtn(btnFirstBottom, 'first');
  bindPagingBtn(btnPrevBottom, 'prev');
  bindPagingBtn(btnNextBottom, 'next');
  bindPagingBtn(btnLastBottom, 'last');

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (totalPages() <= 1) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      currentPage = Math.max(0, currentPage - 1);
      renderCurrentPage();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      currentPage = Math.min(totalPages() - 1, currentPage + 1);
      renderCurrentPage();
    } else if (e.key === 'Home') {
      e.preventDefault();
      currentPage = 0;
      renderCurrentPage();
    } else if (e.key === 'End') {
      e.preventDefault();
      currentPage = totalPages() - 1;
      renderCurrentPage();
    }
  });

  function updatePagingUI() {
    const tp = totalPages();
    const showPaging = tp > 1;

    pagingControls.style.display = showPaging ? 'flex' : 'none';
    footer.style.display = showPaging ? 'flex' : 'none';

    if (showPaging) {
      const text = `${currentPage + 1} / ${tp}`;
      pageInfo.textContent = text;
      pageInfoBottom.textContent = text;

      btnFirst.disabled = btnFirstBottom.disabled = currentPage === 0;
      btnPrev.disabled = btnPrevBottom.disabled = currentPage === 0;
      btnNext.disabled = btnNextBottom.disabled = currentPage >= tp - 1;
      btnLast.disabled = btnLastBottom.disabled = currentPage >= tp - 1;
    }

    // Update device count display
    if (tp > 1) {
      const start = currentPage * perPage + 1;
      const end = Math.min((currentPage + 1) * perPage, allDevices.length);
      deviceCount.textContent = `${start}-${end} of ${allDevices.length} devices`;
    } else {
      deviceCount.textContent = `${allDevices.length} devices`;
    }
  }

  // --- Stop all polling for off-screen devices ---
  function stopAllPolling() {
    for (const [id, timer] of snapshotTimers) {
      clearInterval(timer);
    }
    snapshotTimers.clear();
    for (const [id, timer] of powerTimers) {
      clearInterval(timer);
    }
    powerTimers.clear();
  }

  function renderCurrentPage() {
    // Clamp page
    const tp = totalPages();
    if (currentPage >= tp) currentPage = tp - 1;
    if (currentPage < 0) currentPage = 0;

    // Stop polling for previous page's devices
    stopAllPolling();

    const devices = getPageDevices();
    grid.innerHTML = '';
    devices.forEach(device => {
      const card = createDeviceCard(device);
      grid.appendChild(card);
    });

    // Apply column count
    if (currentCols === 'auto') {
      grid.removeAttribute('data-cols');
    } else {
      grid.dataset.cols = currentCols;
    }

    updatePagingUI();
  }

  async function init() {
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      snapshotInterval = data.snapshotInterval || 2000;
      allDevices = data.devices;

      // Apply saved layout
      const savedLayout = localStorage.getItem('kvmLayout');
      if (savedLayout && layoutPresets.hasOwnProperty(savedLayout)) {
        applyLayout(savedLayout);
      } else {
        applyLayout('auto');
      }
    } catch (err) {
      grid.innerHTML = `<div class="feed-status"><span class="icon">&#9888;</span><span>Failed to load devices: ${err.message}</span></div>`;
    }
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
            <button class="btn-power btn-power-reset" data-action="reset_hard" title="Reset">&#8635;</button>
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

    card.querySelector('.btn-open').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(device.host, '_blank');
    });

    card.querySelector('.btn-fullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('fullscreen');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && card.classList.contains('fullscreen')) {
        card.classList.remove('fullscreen');
      }
    });

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
    const timer = setInterval(updateLed, 5000);
    powerTimers.set(device.id, timer);

    buttons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;

        if (action === 'off_hard') {
          if (!confirm(`Force power off ${device.name}? This is equivalent to holding the power button.`)) return;
        } else if (action === 'reset_hard') {
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
