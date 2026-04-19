const grid        = document.getElementById('grid');
const cmdModal    = document.getElementById('cmd-modal');
const modalTitle  = document.getElementById('modal-title');
const modalBody   = document.getElementById('modal-body');
const modalResult = document.getElementById('modal-result');
const modalClose  = document.getElementById('modal-close');
const empty = document.getElementById('empty');
const countOnline = document.getElementById('count-online');
const countOffline = document.getElementById('count-offline');
const countTotal = document.getElementById('count-total');
const connStatus = document.getElementById('conn-status');
const refreshBtn = document.getElementById('refresh-btn');

refreshBtn.addEventListener('click', async () => {
  if (refreshBtn.disabled) return;
  refreshBtn.disabled = true;
  refreshBtn.classList.add('spinning');
  try {
    await fetch('/api/refresh', { method: 'POST' });
  } catch (_e) { /* noop */ }
  finally {
    setTimeout(() => {
      refreshBtn.classList.remove('spinning');
      refreshBtn.disabled = false;
    }, 600);
  }
});

const devices = new Map();

function fmtBytes(n) {
  if (n == null || isNaN(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtHz(hz) {
  if (hz == null) return '—';
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(0)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toFixed(0)} kHz`;
  return `${hz} Hz`;
}

function fmtUptime(ms) {
  if (ms == null) return '—';
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600);  s -= h * 3600;
  const m = Math.floor(s / 60);    s -= m * 60;
  const parts = [];
  if (d) parts.push(`${d}g`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  if (!d && !h) parts.push(`${s}s`);
  return parts.join(' ');
}

function fmtRel(ts) {
  if (!ts) return 'mai';
  const diff = Date.now() - ts;
  if (diff < 5_000) return 'adesso';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s fa`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m fa`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
  return `${Math.floor(diff / 86_400_000)}g fa`;
}

function rssiLevel(rssi) {
  if (rssi == null) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  if (rssi >= -85) return 1;
  return 0;
}

function heapTotalHint(d) {
  // ESP8266 has ~80KB user heap. Estimate usage against the highest observed free value.
  const estimate = Math.max(d._heapMax || 0, d.freeHeap || 0, 50 * 1024);
  return estimate;
}

function barClass(pct) {
  if (pct < 60) return 'good';
  if (pct < 85) return 'warn';
  return 'bad';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function render() {
  const list = Array.from(devices.values()).sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id));

  let online = 0, offline = 0;
  for (const d of list) { d.online ? online++ : offline++; }
  countOnline.textContent = online;
  countOffline.textContent = offline;
  countTotal.textContent = list.length;

  empty.classList.toggle('hidden', list.length !== 0);

  const seen = new Set();
  for (const d of list) {
    seen.add(d.id);
    const existing = grid.querySelector(`[data-id="${cssEscape(d.id)}"]`);
    const html = cardHtml(d);
    if (existing) {
      existing.outerHTML = html;
    } else {
      grid.insertAdjacentHTML('beforeend', html);
    }
  }
  for (const el of [...grid.children]) {
    if (!seen.has(el.dataset.id)) el.remove();
  }
}

function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

function cardHtml(d) {
  const heapMax = heapTotalHint(d);
  const freeHeap = d.freeHeap ?? 0;
  const heapUsed = Math.max(0, heapMax - freeHeap);
  const heapPct = heapMax ? Math.min(100, Math.round((heapUsed / heapMax) * 100)) : 0;

  const flashSize = d.flashChipSize || 0;
  const sketchSize = d.sketchSize || 0;
  const flashPct = flashSize ? Math.min(100, Math.round((sketchSize / flashSize) * 100)) : 0;

  const rssi = d.rssi;
  const level = rssiLevel(rssi);

  const onlineClass = d.online ? '' : 'offline';
  const statusClass = d.online ? '' : 'offline';
  const statusText = d.online ? 'Online' : 'Offline';

  return `
  <article class="card ${onlineClass}" data-id="${escapeHtml(d.id)}">
    <div class="card-head">
      <div class="card-title">
        <div>
          <h3>${escapeHtml(d.name || d.hostname || d.id)}</h3>
          <span class="ip">${escapeHtml(d.ip || '—')}${d.port && d.port !== 80 ? ':' + d.port : ''}</span>
        </div>
      </div>
      <div class="card-meta">
        <span class="status ${statusClass}"><span class="dot"></span>${statusText}</span>
        ${d.platform ? `<span class="badge ${d.platform.toLowerCase()}">${escapeHtml(d.platform)}</span>` : ''}
        ${d.firmwareVersion ? `<span class="badge fw">v${escapeHtml(d.firmwareVersion)}</span>` : ''}
      </div>
    </div>

    <dl class="kv">
      <dt>MAC</dt><dd>${escapeHtml(d.mac || '—')}</dd>
      <dt>Chip ID</dt><dd>${d.chipId != null ? '0x' + d.chipId.toString(16).toUpperCase() : '—'}</dd>
      <dt>Hostname</dt><dd>${escapeHtml(d.hostname || '—')}</dd>
      <dt>SSID</dt><dd>${escapeHtml(d.ssid || '—')}<span class="rssi-bars s${level}" title="${rssi ?? '—'} dBm"><i></i><i></i><i></i><i></i></span></dd>
      <dt>CPU</dt><dd>${d.cpuFreqMHz ? d.cpuFreqMHz + ' MHz' : '—'}</dd>
      <dt>Flash chip</dt><dd>${fmtBytes(d.flashChipRealSize)} · ${fmtHz(d.flashChipSpeed)}</dd>
      <dt>Heap frag.</dt><dd>${d.heapFragmentation != null ? d.heapFragmentation + '%' : '—'} · max block ${fmtBytes(d.maxFreeBlockSize)}</dd>
      <dt>Sketch</dt><dd>${fmtBytes(d.sketchSize)} usati · ${fmtBytes(d.freeSketchSpace)} liberi</dd>
      <dt>Core / SDK</dt><dd>${escapeHtml(d.coreVersion || '—')} / ${escapeHtml(d.sdkVersion || '—')}</dd>
      <dt>Reset</dt><dd>${escapeHtml(d.resetReason || '—')}</dd>
      <dt>Uptime</dt><dd>${fmtUptime(d.uptime)}</dd>
    </dl>

    <div class="bars">
      <div class="bar-row">
        <span class="lbl">RAM</span>
        <div class="bar ${barClass(heapPct)}"><span style="width:${heapPct}%"></span></div>
        <span class="val">${fmtBytes(freeHeap)} liberi</span>
      </div>
      <div class="bar-row">
        <span class="lbl">Flash</span>
        <div class="bar ${barClass(flashPct)}"><span style="width:${flashPct}%"></span></div>
        <span class="val">${fmtBytes(sketchSize)} / ${fmtBytes(flashSize)}</span>
      </div>
    </div>

    <div class="foot">
      <span>ultimo ping: <code>${fmtRel(d.lastPing || d.lastSeen)}</code></span>
      <div class="foot-actions">
        <button class="btn btn-cmd" data-action="command" data-id="${escapeHtml(d.id)}">Comandi</button>
        <button class="btn" data-action="remove" data-id="${escapeHtml(d.id)}">Rimuovi</button>
      </div>
    </div>
  </article>`;
}

grid.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.action === 'remove') {
    if (!confirm('Rimuovere questo dispositivo dalla dashboard?')) return;
    await fetch(`/api/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  if (btn.dataset.action === 'command') {
    openCmdModal(devices.get(id));
  }
});

// ---- Modal comandi ----

function openCmdModal(device) {
  if (!device) return;
  modalTitle.textContent = `Comandi — ${device.name || device.id}`;
  modalResult.className = 'modal-result hidden';
  modalResult.textContent = '';

  const cmds = Array.isArray(device.commands) ? device.commands : [];

  let html = '';
  if (cmds.length > 0) {
    html += '<div class="cmd-list">';
    for (const cmd of cmds) {
      html += `<button class="cmd-btn" data-cmd="${escapeHtml(cmd.name)}" data-id="${escapeHtml(device.id)}">
        <span class="cmd-name">${escapeHtml(cmd.name)}</span>
        ${cmd.description ? `<span class="cmd-desc">${escapeHtml(cmd.description)}</span>` : ''}
      </button>`;
    }
    html += '</div><div class="cmd-divider"><span>oppure comando personalizzato</span></div>';
  }

  html += `<form class="cmd-custom" id="cmd-form" data-id="${escapeHtml(device.id)}">
    <input class="cmd-input" type="text" name="command" placeholder="nome_comando" autocomplete="off" spellcheck="false" />
    <button class="cmd-send" type="submit">Invia</button>
  </form>`;

  modalBody.innerHTML = html;
  cmdModal.classList.remove('hidden');

  const firstBtn = modalBody.querySelector('.cmd-btn, .cmd-input');
  if (firstBtn) firstBtn.focus();
}

function closeCmdModal() {
  cmdModal.classList.add('hidden');
}

function showModalResult(ok, text) {
  modalResult.textContent = text;
  modalResult.className = 'modal-result ' + (ok ? 'ok' : 'err');
}

async function sendCommand(deviceId, command) {
  showModalResult(null, 'Invio in corso…');
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    const body = await r.json().catch(() => ({}));
    if (body.ok) {
      showModalResult(true, `Comando "${command}" eseguito`);
    } else {
      showModalResult(false, body.error || 'Errore sconosciuto');
    }
  } catch (_e) {
    showModalResult(false, 'Errore di rete');
  }
}

modalClose.addEventListener('click', closeCmdModal);
cmdModal.addEventListener('click', (ev) => { if (ev.target === cmdModal) closeCmdModal(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeCmdModal(); });

modalBody.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('.cmd-btn');
  if (!btn) return;
  await sendCommand(btn.dataset.id, btn.dataset.cmd);
});

modalBody.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target.closest('#cmd-form');
  if (!form) return;
  const input = form.querySelector('.cmd-input');
  const command = input.value.trim();
  if (!command) return;
  await sendCommand(form.dataset.id, command);
});

function upsert(device) {
  const prev = devices.get(device.id);
  if (prev) {
    device._heapMax = Math.max(prev._heapMax || 0, device.freeHeap || 0);
  } else {
    device._heapMax = device.freeHeap || 0;
  }
  devices.set(device.id, device);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => {
    connStatus.textContent = 'live';
    connStatus.classList.add('connected');
  };
  ws.onclose = () => {
    connStatus.textContent = 'disconnesso';
    connStatus.classList.remove('connected');
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === 'snapshot') {
      devices.clear();
      for (const d of msg.devices) upsert(d);
      render();
    } else if (msg.type === 'update') {
      upsert(msg.device);
      render();
    } else if (msg.type === 'remove') {
      devices.delete(msg.id);
      render();
    }
  };
}

setInterval(render, 15_000); // keep "ultimo ping" relative times fresh

connect();
