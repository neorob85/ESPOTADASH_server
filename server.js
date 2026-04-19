const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
const PING_INTERVAL_MS = Number(process.env.PING_INTERVAL_MS || 60 * 1000);
const PING_TIMEOUT_MS = Number(process.env.PING_TIMEOUT_MS || 4000);
const OFFLINE_GRACE_MS = Number(process.env.OFFLINE_GRACE_MS || 3 * 60 * 1000);

const CONFIG_DIR = path.join(__dirname, 'config');
const DEVICES_FILE = path.join(CONFIG_DIR, 'devices.json');

function loadDevices() {
  try {
    const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
    const list = JSON.parse(raw);
    const map = new Map();
    for (const d of list) if (d.id) map.set(d.id, { ...d, online: false });
    return map;
  } catch (_) {
    return new Map();
  }
}

function saveDevices() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(Array.from(devices.values()), null, 2));
}

const devices = loadDevices();

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', (req, res) => {
  const info = req.body || {};
  if (!info.id) return res.status(400).json({ error: 'missing id' });

  const now = Date.now();
  const sourceIp = (req.headers['x-forwarded-for'] || req.ip || '').toString().replace('::ffff:', '');
  const existing = devices.get(info.id) || {};
  const device = {
    ...existing,
    ...info,
    ip: info.ip || existing.ip || sourceIp,
    firstSeen: existing.firstSeen || now,
    lastSeen: now,
    lastRegistered: now,
    online: true,
  };
  devices.set(info.id, device);
  saveDevices();
  broadcast({ type: 'update', device });
  console.log(`[register] ${device.name} (${device.id}) @ ${device.ip}`);
  res.json({ ok: true });
});

app.get('/api/devices', (_req, res) => {
  res.json(Array.from(devices.values()));
});

app.post('/api/refresh', async (_req, res) => {
  await pingAll();
  res.json({ ok: true, count: devices.size });
});

app.delete('/api/devices/:id', (req, res) => {
  if (!devices.has(req.params.id)) return res.status(404).json({ error: 'not found' });
  devices.delete(req.params.id);
  saveDevices();
  broadcast({ type: 'remove', id: req.params.id });
  res.json({ ok: true });
});

app.get('/api/devices/:id/eeprom', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const port = device.port || 80;
  const url = `http://${device.ip}:${port}/eeprom`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS * 3);
  try {
    const r = await fetch(url, { signal: controller.signal });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_e) {
    res.status(504).json({ ok: false, error: 'device unreachable' });
  } finally {
    clearTimeout(timer);
  }
});

app.post('/api/devices/:id/eeprom', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const port = device.port || 80;
  const url = `http://${device.ip}:${port}/eeprom`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS * 3);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_e) {
    res.status(504).json({ ok: false, error: 'device unreachable' });
  } finally {
    clearTimeout(timer);
  }
});

app.post('/api/devices/:id/eeprom/format', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const port = device.port || 80;
  const url = `http://${device.ip}:${port}/eeprom/format`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS * 3);
  try {
    const r = await fetch(url, { method: 'POST', signal: controller.signal });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_e) {
    res.status(504).json({ ok: false, error: 'device unreachable' });
  } finally {
    clearTimeout(timer);
  }
});

app.get('/api/devices/:id/eeprom-map', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, fields: device.eepromMap?.fields || [] });
});

app.post('/api/devices/:id/eeprom-map', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  device.eepromMap = { fields: Array.isArray(req.body.fields) ? req.body.fields : [] };
  devices.set(device.id, device);
  saveDevices();
  res.json({ ok: true });
});

app.post('/api/devices/:id/command', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });

  const { command } = req.body || {};
  if (!command) return res.status(400).json({ ok: false, error: 'missing command' });

  const port = device.port || 80;
  const url = `http://${device.ip}:${port}/cmd`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
      signal: controller.signal,
    });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_e) {
    res.status(504).json({ ok: false, error: 'device unreachable' });
  } finally {
    clearTimeout(timer);
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'snapshot',
    devices: Array.from(devices.values()),
    pingIntervalMs: PING_INTERVAL_MS,
  }));
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

async function pingOne(device) {
  if (!device.ip) return;
  const port = device.port || 80;
  const url = `http://${device.ip}:${port}/ping`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error('status ' + r.status);
    const body = await r.json().catch(() => ({}));
    const now = Date.now();
    const updated = {
      ...device,
      lastSeen: now,
      lastPing: now,
      lastPingOk: true,
      online: true,
      uptime: body.uptime ?? device.uptime,
      freeHeap: body.freeHeap ?? device.freeHeap,
      rssi: body.rssi ?? device.rssi,
    };
    devices.set(device.id, updated);
    broadcast({ type: 'update', device: updated });
  } catch (_e) {
    const now = Date.now();
    const stale = now - (device.lastSeen || 0) > OFFLINE_GRACE_MS;
    if (device.online || stale || device.lastPingOk !== false) {
      const updated = {
        ...device,
        lastPing: now,
        lastPingOk: false,
        online: false,
      };
      devices.set(device.id, updated);
      broadcast({ type: 'update', device: updated });
    }
  } finally {
    clearTimeout(timer);
  }
}

async function pingAll() {
  const list = Array.from(devices.values());
  await Promise.allSettled(list.map(pingOne));
}

setInterval(pingAll, PING_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(`ESPOTADASH server listening on http://0.0.0.0:${PORT}`);
  console.log(`  ping interval: ${PING_INTERVAL_MS} ms`);
  if (devices.size > 0) pingAll();
});
