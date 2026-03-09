const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const fetch = require('node-fetch');
const https = require('https');

const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.yaml');

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  return yaml.load(raw);
}

const config = loadConfig();
const app = express();
const port = process.env.PORT || config.server?.port || 3000;

// Allow self-signed certs for PiKVM connections
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: return device list (without credentials)
app.get('/api/devices', (_req, res) => {
  const devices = (config.devices || []).map((d, i) => ({
    id: i,
    name: d.name,
    type: d.type,
    host: d.host,
  }));
  res.json({
    devices,
    snapshotInterval: config.snapshotInterval || 2000,
  });
});

// Proxy PiKVM snapshot to avoid CORS and keep credentials server-side
app.get('/api/snapshot/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const device = (config.devices || [])[id];

  if (!device || device.type !== 'pikvm') {
    return res.status(404).json({ error: 'Device not found or not a PiKVM' });
  }

  const url = `${device.host}/api/streamer/snapshot`;

  try {
    const headers = {};
    if (device.username && device.password) {
      headers['X-KVMD-User'] = device.username;
      headers['X-KVMD-Passwd'] = device.password;
    }

    const response = await fetch(url, {
      headers,
      agent: url.startsWith('https') ? httpsAgent : undefined,
      timeout: 5000,
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `PiKVM returned ${response.status}` });
    }

    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.body.pipe(res);
  } catch (err) {
    res.status(502).json({ error: `Failed to reach PiKVM: ${err.message}` });
  }
});

// Proxy PiKVM ATX power control
// Actions: on, off, off_hard, reset
app.post('/api/power/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const device = (config.devices || [])[id];
  const { action } = req.body;

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  const validActions = ['on', 'off', 'off_hard', 'reset'];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `Invalid action. Use: ${validActions.join(', ')}` });
  }

  if (device.type === 'pikvm') {
    const url = `${device.host}/api/atx/power?action=${action}`;
    try {
      const headers = {};
      if (device.username && device.password) {
        headers['X-KVMD-User'] = device.username;
        headers['X-KVMD-Passwd'] = device.password;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        agent: device.host.startsWith('https') ? httpsAgent : undefined,
        timeout: 10000,
      });

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `PiKVM returned ${response.status}: ${text}` });
      }

      const data = await response.json();
      res.json({ ok: true, result: data });
    } catch (err) {
      res.status(502).json({ error: `Failed to reach PiKVM: ${err.message}` });
    }
  } else {
    return res.status(400).json({ error: `Power control not supported for ${device.type} devices` });
  }
});

// Get PiKVM ATX state (power LED status)
app.get('/api/power/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const device = (config.devices || [])[id];

  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  if (device.type === 'pikvm') {
    const url = `${device.host}/api/atx`;
    try {
      const headers = {};
      if (device.username && device.password) {
        headers['X-KVMD-User'] = device.username;
        headers['X-KVMD-Passwd'] = device.password;
      }

      const response = await fetch(url, {
        headers,
        agent: device.host.startsWith('https') ? httpsAgent : undefined,
        timeout: 5000,
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `PiKVM returned ${response.status}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Failed to reach PiKVM: ${err.message}` });
    }
  } else {
    return res.json({ result: { leds: { power: null } } });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`KVM Dashboard running on http://0.0.0.0:${port}`);
  console.log(`Loaded ${(config.devices || []).length} device(s) from config`);
});
