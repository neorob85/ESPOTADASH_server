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
const GROUPS_FILE = path.join(CONFIG_DIR, 'groups.json');
const FIRMWARE_FILE = path.join(CONFIG_DIR, 'firmware.json');
const FIRMWARE_DIR = path.join(__dirname, 'firmware');

function loadGroups() {
  try {
    const raw = fs.readFileSync(GROUPS_FILE, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function saveGroups() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
}

function loadFirmware() {
  try {
    const raw = fs.readFileSync(FIRMWARE_FILE, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

function saveFirmware() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(FIRMWARE_FILE, JSON.stringify(firmwareList, null, 2));
}

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
let groups = loadGroups();
let firmwareList = loadFirmware();

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

app.get('/api/groups', (_req, res) => {
  res.json(groups);
});

app.post('/api/groups', (req, res) => {
  const { name, description, deviceIds } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'missing name' });
  const now = Date.now();
  const group = {
    id: now.toString(36) + Math.random().toString(36).slice(2, 7),
    name: name.trim(),
    description: (description || '').trim(),
    deviceIds: Array.isArray(deviceIds) ? deviceIds : [],
    createdAt: now,
    updatedAt: now,
  };
  groups.push(group);
  saveGroups();
  broadcast({ type: 'group-update', group });
  res.json({ ok: true, group });
});

app.put('/api/groups/:id', (req, res) => {
  const idx = groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const { name, description, deviceIds } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'missing name' });
  const now = Date.now();
  groups[idx] = {
    ...groups[idx],
    name: name.trim(),
    description: (description || '').trim(),
    deviceIds: Array.isArray(deviceIds) ? deviceIds : groups[idx].deviceIds,
    updatedAt: now,
  };
  saveGroups();
  broadcast({ type: 'group-update', group: groups[idx] });
  res.json({ ok: true, group: groups[idx] });
});

app.delete('/api/groups/:id', (req, res) => {
  const idx = groups.findIndex(g => g.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const id = groups[idx].id;
  groups.splice(idx, 1);
  saveGroups();
  broadcast({ type: 'group-remove', id });
  res.json({ ok: true });
});

app.get('/api/firmware', (_req, res) => {
  res.json(firmwareList);
});

app.post('/api/firmware', (req, res) => {
  const { version, target, date, description, groups: fwGroups, devices: fwDevices, originalName } = req.body || {};
  if (!version || !version.trim()) return res.status(400).json({ error: 'missing version' });
  if (!target || !['esp8266', 'esp32'].includes(target)) return res.status(400).json({ error: 'invalid target' });
  const now = Date.now();
  const uid = now.toString(36) + Math.random().toString(36).slice(2, 7);
  const filename = uid + '.bin';
  const entry = {
    id: uid,
    filename,
    originalName: originalName || filename,
    version: version.trim(),
    target,
    date: date || new Date().toISOString().slice(0, 10),
    description: (description || '').trim(),
    groups: Array.isArray(fwGroups) ? fwGroups : [],
    devices: Array.isArray(fwDevices) ? fwDevices : [],
    size: 0,
    uploaded: false,
    createdAt: now,
  };
  firmwareList.push(entry);
  saveFirmware();
  res.json({ ok: true, id: uid, filename });
});

app.put('/api/firmware/:id/file', express.raw({ type: '*/*', limit: '16mb' }), (req, res) => {
  const entry = firmwareList.find(f => f.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) return res.status(400).json({ error: 'empty body' });
  fs.mkdirSync(FIRMWARE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FIRMWARE_DIR, entry.filename), buf);
  entry.size = buf.length;
  entry.uploaded = true;
  saveFirmware();
  res.json({ ok: true, size: buf.length });
});

app.put('/api/firmware/:id', (req, res) => {
  const idx = firmwareList.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const { version, target, date, description, groups: fwGroups, devices: fwDevices } = req.body || {};
  const entry = { ...firmwareList[idx] };
  if (version) entry.version = version.trim();
  if (target && ['esp8266', 'esp32'].includes(target)) entry.target = target;
  if (date) entry.date = date;
  if (description !== undefined) entry.description = description.trim();
  if (Array.isArray(fwGroups)) entry.groups = fwGroups;
  if (Array.isArray(fwDevices)) entry.devices = fwDevices;
  firmwareList[idx] = entry;
  saveFirmware();
  res.json({ ok: true, entry });
});

app.get('/api/firmware/:id/download', (req, res) => {
  const entry = firmwareList.find(f => f.id === req.params.id);
  if (!entry || !entry.uploaded) return res.status(404).json({ error: 'not found' });
  res.download(path.join(FIRMWARE_DIR, entry.filename), entry.originalName || entry.filename);
});

app.post('/api/firmware/:fwId/flash/:deviceId', (req, res) => {
  const entry = firmwareList.find(f => f.id === req.params.fwId);
  if (!entry || !entry.uploaded) return res.status(404).json({ ok: false, error: 'firmware not found' });
  const device = devices.get(req.params.deviceId);
  if (!device) return res.status(404).json({ ok: false, error: 'device not found' });

  let fileData;
  try { fileData = fs.readFileSync(path.join(FIRMWARE_DIR, entry.filename)); }
  catch (_) { return res.status(500).json({ ok: false, error: 'firmware file missing on server' }); }

  const boundary = '----ESPOTABoundary' + Date.now().toString(16);
  const partHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="firmware"; filename="${entry.originalName || entry.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const partFooter = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([partHeader, fileData, partFooter]);

  const proxyReq = http.request({
    hostname: device.ip,
    port: device.port || 80,
    path: '/update',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    },
  }, (proxyRes) => {
    let respBody = '';
    proxyRes.on('data', chunk => { respBody += chunk; });
    proxyRes.on('end', () => {
      if (res.headersSent) return;
      try { res.status(proxyRes.statusCode).json(JSON.parse(respBody)); }
      catch (_) { res.status(proxyRes.statusCode).send(respBody); }
    });
  });

  proxyReq.setTimeout(120000, () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'timeout' });
  });
  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'device unreachable' });
  });
  proxyReq.write(body);
  proxyReq.end();
});

app.delete('/api/firmware/:id', (req, res) => {
  const idx = firmwareList.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const entry = firmwareList[idx];
  try { fs.unlinkSync(path.join(FIRMWARE_DIR, entry.filename)); } catch (_) {}
  firmwareList.splice(idx, 1);
  saveFirmware();
  res.json({ ok: true });
});

app.post('/api/devices/:id/firmware', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });

  const port = device.port || 80;
  const options = {
    hostname: device.ip,
    port,
    path: '/update',
    method: 'POST',
    headers: {
      'Content-Type': req.headers['content-type'] || 'multipart/form-data',
      ...(req.headers['content-length'] ? { 'Content-Length': req.headers['content-length'] } : {}),
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => { body += chunk; });
    proxyRes.on('end', () => {
      if (res.headersSent) return;
      try {
        res.status(proxyRes.statusCode).json(JSON.parse(body));
      } catch (_) {
        res.status(proxyRes.statusCode).send(body);
      }
    });
  });

  proxyReq.setTimeout(60000, () => {
    proxyReq.destroy();
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'timeout' });
  });

  proxyReq.on('error', () => {
    if (!res.headersSent) res.status(504).json({ ok: false, error: 'device unreachable' });
  });

  req.pipe(proxyReq);
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

// ---- LittleFS proxy ----

app.get('/api/devices/:id/fs/info', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const url = `http://${device.ip}:${device.port || 80}/fs/info`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS * 3);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_) { res.status(504).json({ ok: false, error: 'device unreachable' }); }
  finally { clearTimeout(t); }
});

app.get('/api/devices/:id/fs/list', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const fsPath = req.query.path || '/';
  const url = `http://${device.ip}:${device.port || 80}/fs/list?path=${encodeURIComponent(fsPath)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS * 3);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_) { res.status(504).json({ ok: false, error: 'device unreachable' }); }
  finally { clearTimeout(t); }
});

app.get('/api/devices/:id/fs/download', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const fsPath = req.query.path || '/';
  const proxyReq = http.get({
    hostname: device.ip,
    port: device.port || 80,
    path: `/fs/download?path=${encodeURIComponent(fsPath)}`,
  }, (proxyRes) => {
    if (proxyRes.statusCode !== 200) {
      let body = '';
      proxyRes.on('data', c => { body += c; });
      proxyRes.on('end', () => {
        if (!res.headersSent)
          try { res.status(proxyRes.statusCode).json(JSON.parse(body)); }
          catch (_) { res.status(proxyRes.statusCode).send(body); }
      });
      return;
    }
    const cd = proxyRes.headers['content-disposition'];
    if (cd) res.set('Content-Disposition', cd);
    else res.set('Content-Disposition', `attachment; filename="${path.basename(fsPath)}"`);
    res.set('Content-Type', 'application/octet-stream');
    proxyRes.pipe(res);
  });
  proxyReq.setTimeout(10000, () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).json({ ok: false, error: 'timeout' }); });
  proxyReq.on('error', () => { if (!res.headersSent) res.status(504).json({ ok: false, error: 'device unreachable' }); });
});

app.delete('/api/devices/:id/fs/delete', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const fsPath = req.query.path || '/';
  const url = `http://${device.ip}:${device.port || 80}/fs/delete?path=${encodeURIComponent(fsPath)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS * 3);
  try {
    const r = await fetch(url, { method: 'DELETE', signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_) { res.status(504).json({ ok: false, error: 'device unreachable' }); }
  finally { clearTimeout(t); }
});

app.post('/api/devices/:id/fs/mkdir', async (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const fsPath = req.query.path || '/';
  const url = `http://${device.ip}:${device.port || 80}/fs/mkdir?path=${encodeURIComponent(fsPath)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS * 3);
  try {
    const r = await fetch(url, { method: 'POST', signal: ctrl.signal });
    const body = await r.json().catch(() => ({}));
    res.status(r.ok ? 200 : 502).json(body);
  } catch (_) { res.status(504).json({ ok: false, error: 'device unreachable' }); }
  finally { clearTimeout(t); }
});

app.post('/api/devices/:id/fs/upload', (req, res) => {
  const device = devices.get(req.params.id);
  if (!device) return res.status(404).json({ ok: false, error: 'not found' });
  const fsPath = req.query.path || '/';
  const proxyReq = http.request({
    hostname: device.ip,
    port: device.port || 80,
    path: `/fs/upload?path=${encodeURIComponent(fsPath)}`,
    method: 'POST',
    headers: {
      'Content-Type': req.headers['content-type'] || 'multipart/form-data',
      ...(req.headers['content-length'] ? { 'Content-Length': req.headers['content-length'] } : {}),
    },
  }, (proxyRes) => {
    let body = '';
    proxyRes.on('data', c => { body += c; });
    proxyRes.on('end', () => {
      if (!res.headersSent)
        try { res.status(proxyRes.statusCode).json(JSON.parse(body)); }
        catch (_) { res.status(proxyRes.statusCode).send(body); }
    });
  });
  proxyReq.setTimeout(30000, () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).json({ ok: false, error: 'timeout' }); });
  proxyReq.on('error', () => { if (!res.headersSent) res.status(504).json({ ok: false, error: 'device unreachable' }); });
  req.pipe(proxyReq);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'snapshot',
    devices: Array.from(devices.values()),
    groups,
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
