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
        <button class="btn btn-eeprom" data-action="eeprom" data-id="${escapeHtml(d.id)}">EEPROM</button>
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

  if (btn.dataset.action === 'eeprom') {
    openEepromModal(devices.get(id));
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
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (!eepromModal.classList.contains('hidden')) closeEepromModal();
    else closeCmdModal();
  }
});

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

// ---- Modal EEPROM ----

const eepromModal    = document.getElementById('eeprom-modal');
const eepromModalTitle = document.getElementById('eeprom-modal-title');
const eepromModalClose = document.getElementById('eeprom-modal-close');
const eepromTable    = document.getElementById('eeprom-table');
const eepromLoading  = document.getElementById('eeprom-loading');
const eepromStatus   = document.getElementById('eeprom-status');
const eepromFormatBtn  = document.getElementById('eeprom-format-btn');
const eepromSaveBtn    = document.getElementById('eeprom-save-btn');
const eepromExitBtn    = document.getElementById('eeprom-exit-btn');
const eepromBackupBtn   = document.getElementById('eeprom-backup-btn');
const eepromRestoreBtn  = document.getElementById('eeprom-restore-btn');
const eepromRestoreInput = document.getElementById('eeprom-restore-input');
const eepromRefreshBtn  = document.getElementById('eeprom-refresh-btn');
const eepromToolbar    = document.getElementById('eeprom-toolbar');

let eepromData     = null;  // Uint8Array — live editable state
let eepromOriginal = null;  // Uint8Array — last saved state
let eepromDeviceId = null;
let eepromDeviceMac = null;
let eepromViewMode = 'hex'; // hex | dec | bin | char | map
let eepromMapData  = null;  // { mac, fields: [...] }
let mapEditorActive = false;

function fmtCell(val, mode) {
  switch (mode) {
    case 'hex':  return val.toString(16).toUpperCase().padStart(2, '0');
    case 'dec':  return String(val);
    case 'bin':  return val.toString(2).padStart(8, '0');
    case 'char': return (val >= 0x20 && val <= 0x7E) ? String.fromCharCode(val) : '.';
    default:     return val.toString(16).toUpperCase().padStart(2, '0');
  }
}

function parseCell(str, mode) {
  let val;
  switch (mode) {
    case 'hex':  val = parseInt(str, 16); break;
    case 'dec':  val = parseInt(str, 10); break;
    case 'bin':  val = parseInt(str, 2);  break;
    case 'char': val = str.length >= 1 ? str.charCodeAt(0) : NaN; break;
    default:     val = parseInt(str, 16);
  }
  return (!isNaN(val) && val >= 0 && val <= 255) ? val : null;
}

function renderEepromTable() {
  if (!eepromData) return;
  const cols = 16;
  const rows = Math.ceil(eepromData.length / cols);

  let html = '<thead><tr><th class="eeprom-addr-hdr"></th>';
  for (let c = 0; c < cols; c++) {
    html += `<th>${c.toString(16).toUpperCase().padStart(2, '0')}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (let r = 0; r < rows; r++) {
    const base = r * cols;
    html += `<tr><td class="eeprom-addr">${base.toString(16).toUpperCase().padStart(3, '0')}</td>`;
    for (let c = 0; c < cols; c++) {
      const idx = base + c;
      if (idx >= eepromData.length) { html += '<td></td>'; continue; }
      const val = eepromData[idx];
      const dirty = val !== eepromOriginal[idx] ? ' dirty' : '';
      html += `<td class="eeprom-cell${dirty}" data-idx="${idx}">${escapeHtml(fmtCell(val, eepromViewMode))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';
  eepromTable.innerHTML = html;
}

function setEepromStatus(msg, type) {
  eepromStatus.textContent = msg;
  eepromStatus.className = 'eeprom-status' + (type ? ' ' + type : '');
}

async function openEepromModal(device) {
  if (!device) return;
  eepromDeviceId  = device.id;
  eepromDeviceMac = device.mac || null;
  eepromModalTitle.textContent = `EEPROM — ${device.name || device.id}`;
  eepromData = null;
  eepromOriginal = null;
  eepromMapData = null;
  mapEditorActive = false;
  eepromTable.innerHTML = '';
  eepromLoading.classList.remove('hidden');
  setEepromStatus('');
  // reset to hex mode
  setViewMode('hex');
  eepromModal.classList.remove('hidden');

  const [eepromResult] = await Promise.allSettled([
    fetch(`/api/devices/${encodeURIComponent(device.id)}/eeprom`).then(r => r.json()),
    loadEepromMap(device.id),
  ]);

  eepromLoading.classList.add('hidden');
  if (eepromResult.status === 'fulfilled') {
    const body = eepromResult.value;
    if (!body.ok || !Array.isArray(body.data)) {
      setEepromStatus('Errore: ' + (body.error || 'risposta non valida'), 'err');
    } else {
      eepromData = new Uint8Array(body.data);
      eepromOriginal = new Uint8Array(body.data);
      renderEepromTable();
    }
  } else {
    setEepromStatus('Errore: ' + eepromResult.reason?.message, 'err');
  }
}

function closeEepromModal() {
  eepromModal.classList.add('hidden');
  eepromData = null;
  eepromOriginal = null;
  eepromDeviceId = null;
  eepromDeviceMac = null;
  eepromMapData = null;
  mapEditorActive = false;
}

eepromModalClose.addEventListener('click', closeEepromModal);
eepromExitBtn.addEventListener('click', closeEepromModal);
eepromModal.addEventListener('click', (ev) => { if (ev.target === eepromModal) closeEepromModal(); });

const eepromMapContent  = document.getElementById('eeprom-map-content');
const eepromMapActions  = document.getElementById('eeprom-map-actions');
const eepromMapEditBtn  = document.getElementById('eeprom-map-edit-btn');
const eepromMapDlBtn    = document.getElementById('eeprom-map-dl-btn');
const eepromMapUlBtn    = document.getElementById('eeprom-map-ul-btn');
const eepromMapUlInput  = document.getElementById('eeprom-map-ul-input');

function setViewMode(mode) {
  eepromViewMode = mode;
  for (const b of eepromToolbar.querySelectorAll('.eeprom-mode')) {
    b.classList.toggle('active', b.dataset.mode === mode);
  }
  const isMap = mode === 'map';
  eepromTable.classList.toggle('hidden', isMap);
  eepromMapContent.classList.toggle('hidden', !isMap);
  eepromFormatBtn.style.display = isMap ? 'none' : '';
  eepromMapActions.style.display = isMap ? '' : 'none';
  if (!isMap) renderEepromTable();
}

eepromToolbar.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.eeprom-mode');
  if (!btn) return;
  if (btn.dataset.mode === 'map') {
    setViewMode('map');
    renderMapView();
  } else {
    setViewMode(btn.dataset.mode);
  }
});

eepromTable.addEventListener('click', (ev) => {
  const td = ev.target.closest('td.eeprom-cell');
  if (!td || td.querySelector('input') || !eepromData) return;
  const idx = parseInt(td.dataset.idx, 10);
  const origVal = eepromData[idx];

  const inp = document.createElement('input');
  inp.className = 'eeprom-cell-input';
  inp.value = fmtCell(origVal, eepromViewMode);
  inp.maxLength = eepromViewMode === 'bin' ? 8 : eepromViewMode === 'dec' ? 3 : 2;
  td.textContent = '';
  td.appendChild(inp);
  inp.focus();
  inp.select();

  function commit() {
    const parsed = parseCell(inp.value.trim(), eepromViewMode);
    if (parsed !== null) eepromData[idx] = parsed;
    const newVal = eepromData[idx];
    td.className = 'eeprom-cell' + (newVal !== eepromOriginal[idx] ? ' dirty' : '');
    td.dataset.idx = idx;
    td.textContent = fmtCell(newVal, eepromViewMode);
  }

  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { inp.blur(); }
    if (e.key === 'Escape') {
      td.textContent = fmtCell(origVal, eepromViewMode);
      td.className = 'eeprom-cell' + (origVal !== eepromOriginal[idx] ? ' dirty' : '');
    }
  });
});

eepromBackupBtn.addEventListener('click', () => {
  if (!eepromData) return;
  const blob = new Blob([eepromData], { type: 'application/octet-stream' });
  const device = devices.get(eepromDeviceId);
  const name = (device?.name || device?.id || 'device').replace(/[^a-z0-9_-]/gi, '_');
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eeprom_${name}_${ts}.bin`;
  a.click();
  URL.revokeObjectURL(a.href);
});

eepromRestoreBtn.addEventListener('click', () => {
  if (!eepromData) return;
  eepromRestoreInput.value = '';
  eepromRestoreInput.click();
});

eepromRefreshBtn.addEventListener('click', async () => {
  if (!eepromDeviceId) return;
  eepromRefreshBtn.disabled = true;
  eepromTable.innerHTML = '';
  eepromLoading.classList.remove('hidden');
  setEepromStatus('');
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(eepromDeviceId)}/eeprom`);
    const body = await r.json();
    if (!body.ok || !Array.isArray(body.data)) throw new Error(body.error || 'risposta non valida');
    eepromData = new Uint8Array(body.data);
    eepromOriginal = new Uint8Array(body.data);
    eepromLoading.classList.add('hidden');
    renderEepromTable();
    setEepromStatus('Dati aggiornati dal dispositivo.', 'ok');
  } catch (e) {
    eepromLoading.classList.add('hidden');
    setEepromStatus('Errore: ' + e.message, 'err');
  } finally {
    eepromRefreshBtn.disabled = false;
  }
});

eepromRestoreInput.addEventListener('change', () => {
  const file = eepromRestoreInput.files[0];
  if (!file || !eepromData) return;
  if (file.size !== eepromData.length) {
    setEepromStatus(`Errore: il file è ${file.size} byte, la EEPROM è ${eepromData.length} byte.`, 'err');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const buf = new Uint8Array(e.target.result);
    for (let i = 0; i < buf.length; i++) eepromData[i] = buf[i];
    renderEepromTable();
    setEepromStatus(`Backup "${file.name}" importato. Premi Salva per scrivere sul dispositivo.`, 'warn');
  };
  reader.readAsArrayBuffer(file);
});

eepromFormatBtn.addEventListener('click', () => {
  if (!eepromData) return;
  if (!confirm('Formattare tutta la EEPROM con 0xFF?\nI valori non ancora salvati andranno persi.')) return;
  eepromData.fill(0xFF);
  renderEepromTable();
  setEepromStatus('EEPROM formattata in locale. Premi Salva per scrivere sul dispositivo.', 'warn');
});

eepromSaveBtn.addEventListener('click', async () => {
  if (!eepromData || !eepromDeviceId) return;
  setEepromStatus('Salvataggio in corso…', '');
  eepromSaveBtn.disabled = true;
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(eepromDeviceId)}/eeprom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: Array.from(eepromData) }),
    });
    const body = await r.json().catch(() => ({}));
    if (body.ok) {
      eepromOriginal = new Uint8Array(eepromData);
      renderEepromTable();
      setEepromStatus('Salvato con successo.', 'ok');
    } else {
      setEepromStatus('Errore: ' + (body.error || 'sconosciuto'), 'err');
    }
  } catch (_e) {
    setEepromStatus('Errore di rete.', 'err');
  } finally {
    eepromSaveBtn.disabled = false;
  }
});


// ---- EEPROM Map ----

const FIELD_TYPES = ['uint8','int8','uint16','int16','uint32','int32','float32','char','string','bitfield'];

function fieldByteSize(field) {
  switch (field.type) {
    case 'uint8': case 'int8': case 'char': return 1;
    case 'uint16': case 'int16': return 2;
    case 'uint32': case 'int32': case 'float32': return 4;
    case 'string': case 'bitfield': return Math.max(1, field.length || 1);
    default: return 1;
  }
}

function decodeField(data, field) {
  if (!data) return null;
  const addr = field.address;
  const size = fieldByteSize(field);
  if (addr < 0 || addr + size > data.length) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  switch (field.type) {
    case 'uint8':   return view.getUint8(addr);
    case 'int8':    return view.getInt8(addr);
    case 'uint16':  return view.getUint16(addr, true);
    case 'int16':   return view.getInt16(addr, true);
    case 'uint32':  return view.getUint32(addr, true);
    case 'int32':   return view.getInt32(addr, true);
    case 'float32': return view.getFloat32(addr, true);
    case 'char': {
      const b = data[addr];
      return b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : `\\x${b.toString(16).padStart(2,'0')}`;
    }
    case 'string': {
      let s = '';
      for (let i = 0; i < size; i++) {
        const b = data[addr + i];
        if (b === 0) break;
        s += b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '?';
      }
      return s;
    }
    case 'bitfield': {
      let val = 0;
      for (let i = 0; i < Math.min(size, 4); i++) val |= data[addr + i] << (i * 8);
      return val >>> 0;
    }
    default: return null;
  }
}

function encodeField(data, field, inputVal) {
  const addr = field.address;
  const size = fieldByteSize(field);
  if (addr < 0 || addr + size > data.length) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  try {
    switch (field.type) {
      case 'uint8':   view.setUint8(addr, Number(inputVal) & 0xFF); break;
      case 'int8':    view.setInt8(addr, Number(inputVal)); break;
      case 'uint16':  view.setUint16(addr, Number(inputVal) & 0xFFFF, true); break;
      case 'int16':   view.setInt16(addr, Number(inputVal), true); break;
      case 'uint32':  view.setUint32(addr, Number(inputVal) >>> 0, true); break;
      case 'int32':   view.setInt32(addr, Number(inputVal), true); break;
      case 'float32': view.setFloat32(addr, parseFloat(inputVal), true); break;
      case 'char': {
        data[addr] = inputVal.length > 0 ? inputVal.charCodeAt(0) & 0xFF : 0;
        break;
      }
      case 'string': {
        const bytes = new TextEncoder().encode(inputVal);
        for (let i = 0; i < size; i++) data[addr + i] = i < bytes.length ? bytes[i] : 0;
        break;
      }
      case 'bitfield': {
        const v = Number(inputVal) >>> 0;
        for (let i = 0; i < Math.min(size, 4); i++) data[addr + i] = (v >> (i * 8)) & 0xFF;
        break;
      }
    }
    return true;
  } catch { return false; }
}

function fmtFieldValue(field, val) {
  if (val === null || val === undefined) return '—';
  const size = fieldByteSize(field);
  switch (field.type) {
    case 'float32': return val.toFixed(6);
    case 'char':    return `'${val}'`;
    case 'string':  return `"${val}"`;
    case 'bitfield': {
      const hex = val.toString(16).toUpperCase().padStart(size * 2, '0');
      const bin = val.toString(2).padStart(size * 8, '0');
      return `0x${hex} (${bin})`;
    }
    default: return String(val);
  }
}

function fmtAddrRange(field) {
  const size = fieldByteSize(field);
  const s = field.address.toString(16).toUpperCase().padStart(3, '0');
  if (size === 1) return `0x${s}`;
  const e = (field.address + size - 1).toString(16).toUpperCase().padStart(3, '0');
  return `0x${s}–0x${e}`;
}

async function loadEepromMap(deviceId) {
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(deviceId)}/eeprom-map`);
    const data = await r.json();
    eepromMapData = { fields: Array.isArray(data.fields) ? data.fields : [] };
  } catch {
    eepromMapData = { fields: [] };
  }
}

function renderMapView() {
  mapEditorActive = false;
  eepromMapEditBtn.textContent = '✏ Modifica Mappa';

  if (!eepromMapData || eepromMapData.fields.length === 0) {
    eepromMapContent.innerHTML = '<div class="map-no-fields">Nessun campo definito.<br><small>Clicca "Modifica Mappa" per aggiungere campi.</small></div>';
    return;
  }

  let html = `<table class="map-table"><thead><tr>
    <th>Campo</th><th>Indirizzo</th><th>Tipo</th><th>Valore</th><th>Descrizione</th>
  </tr></thead><tbody>`;

  for (let fi = 0; fi < eepromMapData.fields.length; fi++) {
    const f    = eepromMapData.fields[fi];
    const val  = decodeField(eepromData, f);
    const size = fieldByteSize(f);

    html += `<tr class="map-field-row">
      <td class="map-field-name">${escapeHtml(f.name)}</td>
      <td class="map-field-addr">${fmtAddrRange(f)} (${size}B)</td>
      <td class="map-field-type">${escapeHtml(f.type)}</td>
      <td class="map-field-value" data-fi="${fi}" title="Clicca per modificare">${escapeHtml(fmtFieldValue(f, val))}</td>
      <td class="map-field-desc">${escapeHtml(f.description || '')}</td>
    </tr>`;

    if (f.type === 'bitfield' && val !== null) {
      const numBits = size * 8;
      const bits = Array.isArray(f.bits) ? f.bits : [];
      for (let b = 0; b < numBits; b++) {
        const bitVal  = (val >> b) & 1;
        const bitDef  = bits.find(x => x.bit === b);
        const bitName = bitDef?.name || `bit ${b}`;
        const bitDesc = bitDef?.description || '';
        html += `<tr class="map-bit-row">
          <td class="map-bit-name-cell" colspan="2">${escapeHtml(bitName)}</td>
          <td class="map-bit-label">bit ${b}</td>
          <td class="map-bit-toggle ${bitVal ? 'map-bit-state-1' : 'map-bit-state-0'}" data-fi="${fi}" data-bit="${b}" title="Clicca per invertire">${bitVal ? '✓ 1' : '✗ 0'}</td>
          <td class="map-field-desc">${escapeHtml(bitDesc)}</td>
        </tr>`;
      }
    }
  }

  html += '</tbody></table>';
  eepromMapContent.innerHTML = html;
}

function renderMapEditor() {
  mapEditorActive = true;
  eepromMapEditBtn.textContent = '✕ Annulla';
  rebuildEditorHtml();
}

function rebuildEditorHtml() {
  const fields = eepromMapData ? eepromMapData.fields : [];
  let html = '<div class="map-editor">';

  html += '<div class="map-editor-field-list">';
  if (fields.length === 0) html += '<div class="map-no-fields" style="padding:12px 0">Nessun campo definito</div>';
  for (let i = 0; i < fields.length; i++) {
    const f    = fields[i];
    const size = fieldByteSize(f);
    const info = `${fmtAddrRange(f)} · ${f.type}${['string','bitfield'].includes(f.type) ? `[${size}]` : ''}`;
    html += `<div class="map-editor-field-item">
      <span class="mef-name">${escapeHtml(f.name)}</span>
      <span class="mef-info">${escapeHtml(info)}</span>
      <button class="btn btn-map-edit-field" data-mef-idx="${i}">Modifica</button>
      <button class="btn btn-map-del" data-mef-del="${i}">✕</button>
    </div>`;
  }
  html += '</div><div id="map-field-form-wrap"></div>';
  html += `<div class="map-editor-actions">
    <button class="btn" id="map-add-btn">+ Aggiungi Campo</button>
    <button class="btn btn-save" id="map-save-map-btn">&#128190; Salva Mappa</button>
  </div></div>`;

  eepromMapContent.innerHTML = html;

  eepromMapContent.querySelector('#map-add-btn').addEventListener('click', () => showFieldForm(null));
  eepromMapContent.querySelector('#map-save-map-btn').addEventListener('click', saveEepromMap);
  for (const btn of eepromMapContent.querySelectorAll('.btn-map-edit-field')) {
    btn.addEventListener('click', () => showFieldForm(parseInt(btn.dataset.mefIdx, 10)));
  }
  for (const btn of eepromMapContent.querySelectorAll('.btn-map-del')) {
    btn.addEventListener('click', () => {
      eepromMapData.fields.splice(parseInt(btn.dataset.mefDel, 10), 1);
      rebuildEditorHtml();
    });
  }
}

function showFieldForm(editIdx) {
  const isEdit = editIdx !== null;
  const f = isEdit
    ? { ...eepromMapData.fields[editIdx], bits: eepromMapData.fields[editIdx].bits || [] }
    : { name: '', address: 0, type: 'uint8', length: 1, description: '', bits: [] };

  const formWrap = eepromMapContent.querySelector('#map-field-form-wrap');
  if (!formWrap) return;

  const needsLength = ['string','bitfield'].includes(f.type);

  formWrap.innerHTML = `<div class="map-field-form">
    <h4>${isEdit ? 'Modifica Campo' : 'Nuovo Campo'}</h4>
    <div class="mf-row"><label>Nome</label>
      <input class="mf-input" id="mf-name" value="${escapeHtml(f.name)}" placeholder="nome_campo" autocomplete="off">
    </div>
    <div class="mf-row"><label>Indirizzo (dec)</label>
      <input class="mf-input" id="mf-addr" type="number" min="0" value="${f.address}">
    </div>
    <div class="mf-row"><label>Tipo</label>
      <select class="mf-select" id="mf-type">
        ${FIELD_TYPES.map(t => `<option value="${t}"${t === f.type ? ' selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="mf-row" id="mf-length-row"${needsLength ? '' : ' style="display:none"'}><label>Lunghezza (byte)</label>
      <input class="mf-input" id="mf-length" type="number" min="1" max="512" value="${f.length || 1}">
    </div>
    <div class="mf-row"><label>Descrizione</label>
      <input class="mf-input" id="mf-desc" value="${escapeHtml(f.description || '')}" placeholder="opzionale">
    </div>
    <div id="mf-bits-wrap"></div>
    <div class="map-form-actions">
      <button class="btn" id="mf-cancel">Annulla</button>
      <button class="btn btn-save" id="mf-confirm">${isEdit ? 'Aggiorna' : 'Aggiungi'}</button>
    </div>
  </div>`;

  const typeSelect  = formWrap.querySelector('#mf-type');
  const lengthRow   = formWrap.querySelector('#mf-length-row');
  const lengthInput = formWrap.querySelector('#mf-length');
  const bitsWrap    = formWrap.querySelector('#mf-bits-wrap');

  if (f.type === 'bitfield') updateBitFields(bitsWrap, f.length || 1, f.bits);

  typeSelect.addEventListener('change', () => {
    const t = typeSelect.value;
    lengthRow.style.display = ['string','bitfield'].includes(t) ? '' : 'none';
    if (t === 'bitfield') {
      updateBitFields(bitsWrap, parseInt(lengthInput.value || '1', 10), collectBitDefs(bitsWrap));
    } else {
      bitsWrap.innerHTML = '';
    }
  });

  lengthInput.addEventListener('change', () => {
    if (typeSelect.value === 'bitfield') {
      updateBitFields(bitsWrap, parseInt(lengthInput.value || '1', 10), collectBitDefs(bitsWrap));
    }
  });

  formWrap.querySelector('#mf-cancel').addEventListener('click', () => {
    formWrap.innerHTML = '';
  });

  formWrap.querySelector('#mf-confirm').addEventListener('click', () => {
    const name = formWrap.querySelector('#mf-name').value.trim();
    const addr = parseInt(formWrap.querySelector('#mf-addr').value, 10);
    const type = typeSelect.value;
    const len  = parseInt(lengthInput.value || '1', 10);
    const desc = formWrap.querySelector('#mf-desc').value.trim();
    const bits = type === 'bitfield' ? collectBitDefs(bitsWrap) : [];

    if (!name) { setEepromStatus('Nome campo obbligatorio', 'err'); return; }
    if (isNaN(addr) || addr < 0) { setEepromStatus('Indirizzo non valido', 'err'); return; }

    const newField = { name, address: addr, type, description: desc };
    if (['string','bitfield'].includes(type)) newField.length = len;
    if (type === 'bitfield') newField.bits = bits;

    if (isEdit) {
      eepromMapData.fields[editIdx] = newField;
    } else {
      eepromMapData.fields.push(newField);
    }
    eepromMapData.fields.sort((a, b) => a.address - b.address);
    rebuildEditorHtml();
    setEepromStatus('');
  });
}

function updateBitFields(container, len, existingBits) {
  const numBits = Math.min(Math.max(1, len), 4) * 8;
  let html = `<div class="mf-bits-section"><div class="mf-bits-title">Significato dei bit (${numBits} bit totali)</div>`;
  for (let b = 0; b < numBits; b++) {
    const def = existingBits.find(x => x.bit === b) || { name: '', description: '' };
    html += `<div class="mf-bit-row">
      <label>Bit ${b}</label>
      <input class="mf-input mf-bit-name" data-bit="${b}" placeholder="nome" value="${escapeHtml(def.name)}">
      <input class="mf-input mf-bit-desc" data-bit="${b}" placeholder="descrizione" value="${escapeHtml(def.description || '')}">
    </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

function collectBitDefs(container) {
  const result = [];
  for (const inp of container.querySelectorAll('.mf-bit-name')) {
    const bit  = parseInt(inp.dataset.bit, 10);
    const name = inp.value.trim();
    const descEl = container.querySelector(`.mf-bit-desc[data-bit="${bit}"]`);
    const description = descEl ? descEl.value.trim() : '';
    if (name || description) result.push({ bit, name, description });
  }
  return result;
}

async function saveEepromMap() {
  if (!eepromDeviceId || !eepromMapData) return;
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(eepromDeviceId)}/eeprom-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: eepromMapData.fields }),
    });
    const body = await r.json().catch(() => ({}));
    if (body.ok) {
      setEepromStatus(`Mappa salvata (${eepromMapData.fields.length} campi).`, 'ok');
      renderMapView();
    } else {
      setEepromStatus('Errore salvataggio mappa.', 'err');
    }
  } catch {
    setEepromStatus('Errore di rete.', 'err');
  }
}

eepromMapEditBtn.addEventListener('click', () => {
  if (mapEditorActive) {
    renderMapView();
  } else {
    if (!eepromMapData) eepromMapData = { fields: [] };
    renderMapEditor();
  }
});

eepromMapDlBtn.addEventListener('click', () => {
  const fields = eepromMapData?.fields || [];
  const device = devices.get(eepromDeviceId);
  const name = (device?.name || device?.id || 'device').replace(/[^a-z0-9_-]/gi, '_');
  const blob = new Blob([JSON.stringify({ fields }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eeprom_map_${name}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

eepromMapUlBtn.addEventListener('click', () => {
  eepromMapUlInput.value = '';
  eepromMapUlInput.click();
});

eepromMapUlInput.addEventListener('change', () => {
  const file = eepromMapUlInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!Array.isArray(parsed.fields)) throw new Error('formato non valido');
      if (!eepromMapData) eepromMapData = { fields: [] };
      eepromMapData.fields = parsed.fields;
      if (mapEditorActive) rebuildEditorHtml(); else renderMapView();
      setEepromStatus(`Template "${file.name}" caricato (${parsed.fields.length} campi). Premi Salva Mappa per applicare.`, 'warn');
    } catch (err) {
      setEepromStatus('Errore lettura template: ' + err.message, 'err');
    }
  };
  reader.readAsText(file);
});

eepromMapContent.addEventListener('click', (ev) => {
  const bitCell = ev.target.closest('.map-bit-toggle');
  if (bitCell && eepromData) {
    const fi  = parseInt(bitCell.dataset.fi, 10);
    const bit = parseInt(bitCell.dataset.bit, 10);
    const f   = eepromMapData.fields[fi];
    let val   = decodeField(eepromData, f);
    if (val === null) return;
    encodeField(eepromData, f, (val ^ (1 << bit)) >>> 0);
    renderMapView();
    return;
  }

  const valCell = ev.target.closest('.map-field-value');
  if (valCell && eepromData && !valCell.querySelector('input')) {
    const fi = parseInt(valCell.dataset.fi, 10);
    const f  = eepromMapData.fields[fi];
    if (f.type === 'bitfield') return;
    const val = decodeField(eepromData, f);

    const inp = document.createElement('input');
    inp.className = 'map-value-input';
    inp.value = f.type === 'float32' ? (val !== null ? val.toFixed(6) : '')
              : f.type === 'string'  ? (val || '')
              : f.type === 'char'    ? (val || '')
              : String(val ?? '');
    valCell.textContent = '';
    valCell.appendChild(inp);
    inp.focus();
    inp.select();

    function commitMapVal() {
      if (!encodeField(eepromData, f, inp.value)) setEepromStatus('Valore non valido', 'err');
      renderMapView();
    }
    inp.addEventListener('blur', commitMapVal);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') inp.blur();
      if (e.key === 'Escape') renderMapView();
    });
  }
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
