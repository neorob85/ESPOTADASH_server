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
  if (d.heapSize) return d.heapSize;
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

  const isLT = d.platform === 'LibreTiny';
  const flashSize = d.flashChipSize || 0;
  const sketchSize = d.sketchSize || 0;
  const flashPct = flashSize && sketchSize ? Math.min(100, Math.round((sketchSize / flashSize) * 100)) : 0;

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
      <dt>Flash chip</dt><dd>${fmtBytes(d.flashChipRealSize)}${d.flashChipSpeed != null ? ' · ' + fmtHz(d.flashChipSpeed) : ''}</dd>
      <dt>Heap frag.</dt><dd>${d.heapFragmentation != null ? d.heapFragmentation + '%' : '—'} · ${isLT ? 'min liberi ' + fmtBytes(d.heapMinFree) : 'max block ' + fmtBytes(d.maxFreeBlockSize)}</dd>
      ${isLT ? `<dt>Heap / RAM</dt><dd>${fmtBytes(d.heapSize)} heap · ${fmtBytes(d.ramSize)} RAM tot.</dd>` : `<dt>Sketch</dt><dd>${fmtBytes(d.sketchSize)} usati · ${fmtBytes(d.freeSketchSpace)} liberi</dd>`}
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
        <span class="val">${sketchSize ? fmtBytes(sketchSize) + ' / ' + fmtBytes(flashSize) : '— / ' + fmtBytes(flashSize)}</span>
      </div>
    </div>

    <div class="foot">
      <span>ultimo ping: <code>${fmtRel(d.lastPing || d.lastSeen)}</code></span>
      <div class="foot-actions">
        <button class="btn btn-cmd" data-action="command" data-id="${escapeHtml(d.id)}">Comandi</button>
        ${!isLT ? `<button class="btn btn-eeprom" data-action="eeprom" data-id="${escapeHtml(d.id)}">EEPROM</button>` : ''}
        ${!isLT && d.littlefs ? `<button class="btn btn-fs" data-action="filesystem" data-id="${escapeHtml(d.id)}">Filesystem</button>` : ''}
        ${isLT ? `<button class="btn btn-config" data-action="config" data-id="${escapeHtml(d.id)}">Config</button>` : ''}
        <button class="btn btn-ota" data-action="ota" data-id="${escapeHtml(d.id)}">OTA</button>
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

  if (btn.dataset.action === 'ota') {
    openOtaModal(devices.get(id));
  }

  if (btn.dataset.action === 'filesystem') {
    openFsModal(devices.get(id));
  }

  if (btn.dataset.action === 'config') {
    openConfigModal(devices.get(id));
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
    else if (!fsModal.classList.contains('hidden')) closeFsModal();
    else if (!groupModal.classList.contains('hidden')) closeGroupModal();
    else if (!otaModal.classList.contains('hidden')) closeOtaModal();
    else if (!fwEditModal.classList.contains('hidden')) closeFwEditModal();
    else if (!fwModal.classList.contains('hidden')) closeFwUploadModal();
    else if (!fwFlashModal.classList.contains('hidden')) closeFwFlashModal();
    else if (typeof configModal !== 'undefined' && !configModal.classList.contains('hidden')) closeConfigModal();
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

// ---- Gruppi ----

const groupsMap = new Map();
let currentView = 'devices';

const devicesView  = document.getElementById('devices-view');
const groupsView   = document.getElementById('groups-view');
const firmwareView = document.getElementById('firmware-view');
const groupsGrid   = document.getElementById('groups-grid');
const groupsEmpty  = document.getElementById('groups-empty');
const groupAddBtn  = document.getElementById('group-add-btn');
const groupModal   = document.getElementById('group-modal');
const groupModalTitle  = document.getElementById('group-modal-title');
const groupModalClose  = document.getElementById('group-modal-close');
const groupModalCancel = document.getElementById('group-modal-cancel');
const groupModalSave   = document.getElementById('group-modal-save');
const groupModalResult = document.getElementById('group-modal-result');
const gfName       = document.getElementById('gf-name');
const gfDesc       = document.getElementById('gf-desc');
const gfDeviceList = document.getElementById('gf-device-list');

let editingGroupId = null;

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === currentView) return;
    currentView = view;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    devicesView.classList.toggle('hidden', view !== 'devices');
    groupsView.classList.toggle('hidden', view !== 'groups');
    firmwareView.classList.toggle('hidden', view !== 'firmware');
    if (view === 'groups') renderGroups();
    if (view === 'firmware') loadFirmwareList().then(renderFirmware);
  });
});

function renderGroups() {
  const list = Array.from(groupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  groupsEmpty.classList.toggle('hidden', list.length !== 0);
  groupsGrid.innerHTML = '';
  for (const g of list) {
    groupsGrid.insertAdjacentHTML('beforeend', groupCardHtml(g));
  }
}

function groupCardHtml(g) {
  const memberDevices = (g.deviceIds || []).map(id => devices.get(id)).filter(Boolean);
  const missing = (g.deviceIds || []).length - memberDevices.length;
  const countLabel = `${(g.deviceIds || []).length} dispositiv${(g.deviceIds || []).length === 1 ? 'o' : 'i'}`;
  const MAX_CHIPS = 4;

  let chipsHtml = '';
  if (memberDevices.length === 0 && missing === 0) {
    chipsHtml = '<span class="group-no-devices">Nessun dispositivo assegnato</span>';
  } else {
    const shown = memberDevices.slice(0, MAX_CHIPS);
    for (const d of shown) {
      const offlineCls = d.online ? '' : ' offline';
      chipsHtml += `<span class="group-device-chip${offlineCls}"><span class="chip-dot"></span>${escapeHtml(d.name || d.hostname || d.id)}</span>`;
    }
    const extra = memberDevices.length - shown.length + missing;
    if (extra > 0) chipsHtml += `<span class="group-more">+${extra} altri</span>`;
  }

  return `<div class="group-card" data-gid="${escapeHtml(g.id)}">
    <div class="group-card-head">
      <div>
        <h3 class="group-card-name">${escapeHtml(g.name)}</h3>
        ${g.description ? `<p class="group-card-desc">${escapeHtml(g.description)}</p>` : ''}
      </div>
      <span class="group-card-count">${countLabel}</span>
    </div>
    <div class="group-device-list">${chipsHtml}</div>
    <div class="group-card-foot">
      <button class="btn btn-cmd" data-gaction="edit" data-gid="${escapeHtml(g.id)}">Modifica</button>
      <button class="btn" data-gaction="delete" data-gid="${escapeHtml(g.id)}">Elimina</button>
    </div>
  </div>`;
}

groupsGrid.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-gaction]');
  if (!btn) return;
  const id = btn.dataset.gid;
  if (btn.dataset.gaction === 'edit') {
    openGroupModal(id);
  } else if (btn.dataset.gaction === 'delete') {
    const g = groupsMap.get(id);
    if (!g) return;
    if (!confirm(`Eliminare il gruppo "${g.name}"?`)) return;
    await fetch(`/api/groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
});

groupAddBtn.addEventListener('click', () => openGroupModal(null));

function openGroupModal(groupId) {
  editingGroupId = groupId;
  const g = groupId ? groupsMap.get(groupId) : null;
  groupModalTitle.textContent = g ? `Modifica — ${g.name}` : 'Nuovo Gruppo';
  gfName.value = g ? g.name : '';
  gfDesc.value = g ? (g.description || '') : '';
  groupModalResult.className = 'modal-result hidden';
  groupModalResult.textContent = '';

  const devList = Array.from(devices.values()).sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id));
  const selectedIds = new Set(g ? g.deviceIds : []);

  if (devList.length === 0) {
    gfDeviceList.innerHTML = '<span class="gf-no-devices">Nessun dispositivo registrato</span>';
  } else {
    gfDeviceList.innerHTML = devList.map(d => `
      <label class="gf-device-check">
        <input type="checkbox" value="${escapeHtml(d.id)}" ${selectedIds.has(d.id) ? 'checked' : ''} />
        <span class="gf-device-check-name">${escapeHtml(d.name || d.hostname || d.id)}</span>
        <span class="gf-device-check-ip">${escapeHtml(d.ip || '')}</span>
      </label>`).join('');
  }

  groupModal.classList.remove('hidden');
  gfName.focus();
}

function closeGroupModal() {
  groupModal.classList.add('hidden');
  editingGroupId = null;
}

groupModalClose.addEventListener('click', closeGroupModal);
groupModalCancel.addEventListener('click', closeGroupModal);
groupModal.addEventListener('click', (ev) => { if (ev.target === groupModal) closeGroupModal(); });

groupModalSave.addEventListener('click', async () => {
  const name = gfName.value.trim();
  if (!name) {
    groupModalResult.textContent = 'Il nome è obbligatorio.';
    groupModalResult.className = 'modal-result err';
    return;
  }
  const deviceIds = [...gfDeviceList.querySelectorAll('input[type="checkbox"]:checked')]
    .map(cb => cb.value);
  const body = { name, description: gfDesc.value.trim(), deviceIds };
  try {
    const url = editingGroupId ? `/api/groups/${encodeURIComponent(editingGroupId)}` : '/api/groups';
    const method = editingGroupId ? 'PUT' : 'POST';
    const r = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (data.ok) {
      closeGroupModal();
    } else {
      groupModalResult.textContent = data.error || 'Errore sconosciuto';
      groupModalResult.className = 'modal-result err';
    }
  } catch (_e) {
    groupModalResult.textContent = 'Errore di rete';
    groupModalResult.className = 'modal-result err';
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

// ---- Modal OTA ----

const otaModal        = document.getElementById('ota-modal');
const otaModalTitle   = document.getElementById('ota-modal-title');
const otaModalClose   = document.getElementById('ota-modal-close');
const otaFileInput    = document.getElementById('ota-file-input');
const otaBrowseBtn    = document.getElementById('ota-browse-btn');
const otaDrop         = document.getElementById('ota-drop');
const otaDropLabel    = document.getElementById('ota-drop-label');
const otaFileInfo     = document.getElementById('ota-file-info');
const otaProgress     = document.getElementById('ota-progress');
const otaProgressFill = document.getElementById('ota-progress-fill');
const otaProgressText = document.getElementById('ota-progress-text');
const otaResult       = document.getElementById('ota-result');
const otaCancelBtn    = document.getElementById('ota-cancel-btn');
const otaFlashBtn     = document.getElementById('ota-flash-btn');

let otaDeviceId = null;
let otaFile     = null;

function openOtaModal(device) {
  if (!device) return;
  otaDeviceId = device.id;
  otaFile = null;
  otaModalTitle.textContent = `Aggiornamento Firmware OTA — ${device.name || device.id}`;
  otaDropLabel.classList.remove('hidden');
  otaFileInfo.classList.add('hidden');
  otaProgress.classList.add('hidden');
  otaProgressFill.style.width = '0%';
  otaProgressText.textContent = '0%';
  otaResult.classList.add('hidden');
  otaFlashBtn.disabled = true;
  otaCancelBtn.disabled = false;
  otaFileInput.value = '';
  otaFileInput.accept = (device && device.platform === 'LibreTiny') ? '.bin,.uf2' : '.bin';
  otaDrop.classList.remove('drag-over');
  otaModal.classList.remove('hidden');
}

function closeOtaModal() {
  otaModal.classList.add('hidden');
  otaDeviceId = null;
  otaFile = null;
}

function setOtaFile(file) {
  if (!file) return;
  const isLT = devices.get(otaDeviceId)?.platform === 'LibreTiny';
  const validExt = file.name.endsWith('.bin') || (isLT && file.name.endsWith('.uf2'));
  if (!validExt) {
    otaResult.textContent = isLT ? 'Seleziona un file .bin o .uf2 valido' : 'Seleziona un file .bin valido';
    otaResult.className = 'ota-result err';
    otaResult.classList.remove('hidden');
    return;
  }
  otaFile = file;
  otaResult.classList.add('hidden');
  otaDropLabel.classList.add('hidden');
  otaFileInfo.innerHTML = `<strong>${escapeHtml(file.name)}</strong> &mdash; ${fmtBytes(file.size)}
    <button class="ota-file-clear" title="Rimuovi file">&times;</button>`;
  otaFileInfo.classList.remove('hidden');
  otaFlashBtn.disabled = false;
}

otaBrowseBtn.addEventListener('click', () => otaFileInput.click());
otaFileInput.addEventListener('change', () => setOtaFile(otaFileInput.files[0]));

otaFileInfo.addEventListener('click', (ev) => {
  if (ev.target.classList.contains('ota-file-clear')) {
    otaFile = null;
    otaFileInput.value = '';
    otaFileInfo.classList.add('hidden');
    otaDropLabel.classList.remove('hidden');
    otaFlashBtn.disabled = true;
  }
});

otaDrop.addEventListener('dragover', (ev) => { ev.preventDefault(); otaDrop.classList.add('drag-over'); });
otaDrop.addEventListener('dragleave', () => otaDrop.classList.remove('drag-over'));
otaDrop.addEventListener('drop', (ev) => {
  ev.preventDefault();
  otaDrop.classList.remove('drag-over');
  setOtaFile(ev.dataTransfer.files[0]);
});

otaModalClose.addEventListener('click', closeOtaModal);
otaCancelBtn.addEventListener('click', closeOtaModal);
otaModal.addEventListener('click', (ev) => { if (ev.target === otaModal) closeOtaModal(); });

otaFlashBtn.addEventListener('click', () => {
  if (!otaFile || !otaDeviceId) return;
  const deviceName = devices.get(otaDeviceId)?.name || otaDeviceId;
  if (!confirm(`Procedere con il flash di "${otaFile.name}" su ${deviceName}?\nIl dispositivo si riavvierà al termine.`)) return;

  otaFlashBtn.disabled = true;
  otaCancelBtn.disabled = true;
  otaProgress.classList.remove('hidden');
  otaResult.classList.add('hidden');
  otaProgressFill.style.width = '0%';
  otaProgressText.textContent = '0%';

  const formData = new FormData();
  formData.append('firmware', otaFile, otaFile.name);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', `/api/devices/${encodeURIComponent(otaDeviceId)}/firmware`);

  xhr.upload.addEventListener('progress', (ev) => {
    if (ev.lengthComputable) {
      const pct = Math.round((ev.loaded / ev.total) * 100);
      otaProgressFill.style.width = pct + '%';
      otaProgressText.textContent = pct + '%';
    }
  });

  xhr.addEventListener('load', () => {
    otaCancelBtn.disabled = false;
    let body = {};
    try { body = JSON.parse(xhr.responseText); } catch (_) {}
    if (xhr.status >= 200 && xhr.status < 300 && body.ok !== false) {
      otaResult.textContent = 'Flash completato. Il dispositivo si sta riavviando…';
      otaResult.className = 'ota-result ok';
    } else {
      otaResult.textContent = 'Errore: ' + (body.error || `HTTP ${xhr.status}`);
      otaResult.className = 'ota-result err';
      otaFlashBtn.disabled = false;
    }
    otaResult.classList.remove('hidden');
  });

  xhr.addEventListener('error', () => {
    otaCancelBtn.disabled = false;
    otaFlashBtn.disabled = false;
    otaResult.textContent = 'Errore di rete';
    otaResult.className = 'ota-result err';
    otaResult.classList.remove('hidden');
  });

  xhr.send(formData);
});

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
      groupsMap.clear();
      for (const g of (msg.groups || [])) groupsMap.set(g.id, g);
      render();
      if (currentView === 'groups') renderGroups();
    } else if (msg.type === 'update') {
      upsert(msg.device);
      render();
      if (currentView === 'groups') renderGroups();
    } else if (msg.type === 'remove') {
      devices.delete(msg.id);
      render();
      if (currentView === 'groups') renderGroups();
    } else if (msg.type === 'group-update') {
      groupsMap.set(msg.group.id, msg.group);
      if (currentView === 'groups') renderGroups();
    } else if (msg.type === 'group-remove') {
      groupsMap.delete(msg.id);
      if (currentView === 'groups') renderGroups();
    }
  };
}

setInterval(render, 15_000); // keep "ultimo ping" relative times fresh

// ---- Firmware ----

const fwUploadBtn    = document.getElementById('fw-upload-btn');
const fwEmpty        = document.getElementById('fw-empty');
const fwListEl       = document.getElementById('fw-list');
const fwModal        = document.getElementById('fw-modal');
const fwModalClose   = document.getElementById('fw-modal-close');
const fwModalCancel  = document.getElementById('fw-modal-cancel');
const fwModalUpload  = document.getElementById('fw-modal-upload');
const fwModalResult  = document.getElementById('fw-modal-result');
const fwDrop         = document.getElementById('fw-drop');
const fwDropLabel    = document.getElementById('fw-drop-label');
const fwFileInfo     = document.getElementById('fw-file-info');
const fwFileInput    = document.getElementById('fw-file-input');
const fwBrowseBtn    = document.getElementById('fw-browse-btn');
const fwProgress     = document.getElementById('fw-progress');
const fwProgressFill = document.getElementById('fw-progress-fill');
const fwProgressText = document.getElementById('fw-progress-text');
const fwVersion      = document.getElementById('fw-version');
const fwTarget       = document.getElementById('fw-target');
const fwDate         = document.getElementById('fw-date');
const fwDesc         = document.getElementById('fw-desc');
const fwGroupList    = document.getElementById('fw-group-list');
const fwDeviceList   = document.getElementById('fw-device-list');
const fwEditModal       = document.getElementById('fw-edit-modal');
const fwEditModalClose  = document.getElementById('fw-edit-modal-close');
const fwEditModalCancel = document.getElementById('fw-edit-modal-cancel');
const fwEditModalSave   = document.getElementById('fw-edit-modal-save');
const fwEditModalResult = document.getElementById('fw-edit-modal-result');
const fwEditVersion     = document.getElementById('fw-edit-version');
const fwEditTarget      = document.getElementById('fw-edit-target');
const fwEditDate        = document.getElementById('fw-edit-date');
const fwEditDesc        = document.getElementById('fw-edit-desc');
const fwEditGroupList   = document.getElementById('fw-edit-group-list');
const fwEditDeviceList  = document.getElementById('fw-edit-device-list');

let fwList = [];
let fwFile = null;
let fwEditId = null;

async function loadFirmwareList() {
  try {
    const r = await fetch('/api/firmware');
    fwList = await r.json();
  } catch (_) {
    fwList = [];
  }
}

function renderFirmware() {
  fwEmpty.classList.toggle('hidden', fwList.length !== 0);
  fwListEl.innerHTML = '';
  for (const fw of [...fwList].reverse()) {
    fwListEl.insertAdjacentHTML('beforeend', fwCardHtml(fw));
  }
}

function fwCardHtml(fw) {
  const targetClass = fw.target === 'esp32' ? 'esp32'
                    : fw.target === 'libretiny' ? 'libretiny'
                    : '';
  const targetBadge = `<span class="badge ${targetClass}">${escapeHtml(fw.target.toUpperCase())}</span>`;

  const groupChips = (fw.groups || [])
    .map(gid => groupsMap.get(gid)).filter(Boolean)
    .map(g => `<span class="group-device-chip">${escapeHtml(g.name)}</span>`).join('');

  const deviceChips = (fw.devices || [])
    .map(did => devices.get(did)).filter(Boolean)
    .map(d => `<span class="group-device-chip${d.online ? '' : ' offline'}"><span class="chip-dot"></span>${escapeHtml(d.name || d.id)}</span>`).join('');

  const assocHtml = (groupChips || deviceChips) ? `
    <div class="fw-card-assoc">
      ${groupChips ? `<div class="fw-card-assoc-row"><span class="fw-assoc-label">Gruppi</span><div class="fw-chips">${groupChips}</div></div>` : ''}
      ${deviceChips ? `<div class="fw-card-assoc-row"><span class="fw-assoc-label">Dispositivi</span><div class="fw-chips">${deviceChips}</div></div>` : ''}
    </div>` : '';

  const sizeStr = fw.size ? fmtBytes(fw.size) : '—';
  const uploadedStr = fw.uploaded
    ? fmtRel(fw.createdAt)
    : '<span style="color:var(--bad)">non caricato</span>';

  return `<div class="fw-card" data-fwid="${escapeHtml(fw.id)}">
    <div class="fw-card-head">
      <span class="badge fw">v${escapeHtml(fw.version)}</span>
      ${targetBadge}
      <span class="fw-card-date">${escapeHtml(fw.date)}</span>
      <span class="fw-card-filename">${escapeHtml(fw.originalName || fw.filename)}</span>
    </div>
    ${fw.description ? `<div class="fw-card-desc">${escapeHtml(fw.description)}</div>` : ''}
    ${assocHtml}
    <div class="fw-card-foot">
      <span class="fw-card-info">${sizeStr} &middot; ${uploadedStr}</span>
      <div class="foot-actions">
        ${fw.uploaded ? `<a class="btn btn-backup" href="/api/firmware/${escapeHtml(fw.id)}/download" download title="Scarica il file .bin">&#8659; Download</a>` : ''}
        ${fw.uploaded ? `<button class="btn btn-ota" data-fwaction="flash" data-fwid="${escapeHtml(fw.id)}">&#9654; Flash</button>` : ''}
        <button class="btn btn-cmd" data-fwaction="edit" data-fwid="${escapeHtml(fw.id)}">Modifica</button>
        <button class="btn" data-fwaction="delete" data-fwid="${escapeHtml(fw.id)}">Elimina</button>
      </div>
    </div>
  </div>`;
}

fwListEl.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-fwaction]');
  if (!btn) return;
  const id = btn.dataset.fwid;
  if (btn.dataset.fwaction === 'delete') {
    const fw = fwList.find(f => f.id === id);
    if (!fw || !confirm(`Eliminare il firmware "v${fw.version}" (${fw.originalName || fw.filename})?`)) return;
    await fetch(`/api/firmware/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadFirmwareList();
    renderFirmware();
  } else if (btn.dataset.fwaction === 'edit') {
    openFwEditModal(id);
  } else if (btn.dataset.fwaction === 'flash') {
    openFwFlashModal(id);
  }
});

function populateFwSelectors(groupListEl, deviceListEl, selectedGroups, selectedDevices) {
  const gList = Array.from(groupsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  groupListEl.innerHTML = gList.length === 0
    ? '<span class="gf-no-devices">Nessun gruppo disponibile</span>'
    : gList.map(g => `<label class="gf-device-check">
        <input type="checkbox" value="${escapeHtml(g.id)}" ${selectedGroups.has(g.id) ? 'checked' : ''} />
        <span class="gf-device-check-name">${escapeHtml(g.name)}</span>
      </label>`).join('');

  const dList = Array.from(devices.values()).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
  deviceListEl.innerHTML = dList.length === 0
    ? '<span class="gf-no-devices">Nessun dispositivo registrato</span>'
    : dList.map(d => `<label class="gf-device-check">
        <input type="checkbox" value="${escapeHtml(d.id)}" ${selectedDevices.has(d.id) ? 'checked' : ''} />
        <span class="gf-device-check-name">${escapeHtml(d.name || d.hostname || d.id)}</span>
        <span class="gf-device-check-ip">${escapeHtml(d.ip || '')}</span>
      </label>`).join('');
}

function openFwUploadModal() {
  fwFile = null;
  fwFileInput.value = '';
  fwDropLabel.classList.remove('hidden');
  fwFileInfo.classList.add('hidden');
  fwProgress.classList.add('hidden');
  fwProgressFill.style.width = '0%';
  fwProgressText.textContent = '0%';
  fwModalResult.className = 'modal-result hidden';
  fwVersion.value = '';
  fwTarget.value = 'esp8266';
  fwFileInput.accept = '.bin';
  fwDate.value = new Date().toISOString().slice(0, 10);
  fwDesc.value = '';
  fwModalUpload.disabled = true;
  fwModalCancel.disabled = false;
  fwModalCancel.textContent = 'Annulla';
  fwDrop.classList.remove('drag-over');
  populateFwSelectors(fwGroupList, fwDeviceList, new Set(), new Set());
  fwModal.classList.remove('hidden');
  fwVersion.focus();
}

function closeFwUploadModal() {
  fwModal.classList.add('hidden');
  fwFile = null;
}

function setFwFile(file) {
  if (!file) return;
  const isLT = fwTarget.value === 'libretiny';
  const validExt = file.name.endsWith('.bin') || (isLT && file.name.endsWith('.uf2'));
  if (!validExt) {
    fwModalResult.textContent = isLT ? 'Seleziona un file .bin o .uf2 valido' : 'Seleziona un file .bin valido';
    fwModalResult.className = 'modal-result err';
    return;
  }
  fwFile = file;
  fwModalResult.className = 'modal-result hidden';
  fwDropLabel.classList.add('hidden');
  fwFileInfo.innerHTML = `<strong>${escapeHtml(file.name)}</strong> &mdash; ${fmtBytes(file.size)}
    <button class="ota-file-clear" title="Rimuovi file">&times;</button>`;
  fwFileInfo.classList.remove('hidden');
  fwModalUpload.disabled = false;
}

fwTarget.addEventListener('change', () => {
  fwFileInput.accept = fwTarget.value === 'libretiny' ? '.bin,.uf2' : '.bin';
});
fwBrowseBtn.addEventListener('click', () => fwFileInput.click());
fwFileInput.addEventListener('change', () => setFwFile(fwFileInput.files[0]));

fwFileInfo.addEventListener('click', (ev) => {
  if (ev.target.classList.contains('ota-file-clear')) {
    fwFile = null;
    fwFileInput.value = '';
    fwFileInfo.classList.add('hidden');
    fwDropLabel.classList.remove('hidden');
    fwModalUpload.disabled = true;
  }
});

fwDrop.addEventListener('dragover', (ev) => { ev.preventDefault(); fwDrop.classList.add('drag-over'); });
fwDrop.addEventListener('dragleave', () => fwDrop.classList.remove('drag-over'));
fwDrop.addEventListener('drop', (ev) => {
  ev.preventDefault();
  fwDrop.classList.remove('drag-over');
  setFwFile(ev.dataTransfer.files[0]);
});

fwModalClose.addEventListener('click', closeFwUploadModal);
fwModalCancel.addEventListener('click', closeFwUploadModal);
fwModal.addEventListener('click', (ev) => { if (ev.target === fwModal) closeFwUploadModal(); });
fwUploadBtn.addEventListener('click', openFwUploadModal);

fwModalUpload.addEventListener('click', async () => {
  if (!fwFile) return;
  const version = fwVersion.value.trim();
  if (!version) {
    fwModalResult.textContent = 'Versione obbligatoria';
    fwModalResult.className = 'modal-result err';
    return;
  }
  const body = {
    version,
    target: fwTarget.value,
    date: fwDate.value,
    description: fwDesc.value.trim(),
    groups: [...fwGroupList.querySelectorAll('input:checked')].map(cb => cb.value),
    devices: [...fwDeviceList.querySelectorAll('input:checked')].map(cb => cb.value),
    originalName: fwFile.name,
  };
  fwModalUpload.disabled = true;
  fwModalCancel.disabled = true;
  fwModalResult.textContent = 'Creazione entry…';
  fwModalResult.className = 'modal-result';
  fwProgress.classList.remove('hidden');
  fwProgressFill.style.width = '0%';
  fwProgressText.textContent = '0%';
  try {
    const metaRes = await fetch('/api/firmware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const meta = await metaRes.json();
    if (!meta.ok) throw new Error(meta.error || 'Errore creazione entry');

    fwModalResult.textContent = 'Caricamento file…';
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/firmware/${encodeURIComponent(meta.id)}/file`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.addEventListener('progress', (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          fwProgressFill.style.width = pct + '%';
          fwProgressText.textContent = pct + '%';
        }
      });
      xhr.addEventListener('load', () => {
        let res = {};
        try { res = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300 && res.ok !== false) resolve(res);
        else reject(new Error(res.error || `HTTP ${xhr.status}`));
      });
      xhr.addEventListener('error', () => reject(new Error('Errore di rete')));
      xhr.send(fwFile);
    });

    fwModalResult.textContent = 'Firmware caricato con successo!';
    fwModalResult.className = 'modal-result ok';
    fwModalCancel.disabled = false;
    fwModalCancel.textContent = 'Chiudi';
    await loadFirmwareList();
    renderFirmware();
  } catch (err) {
    fwModalResult.textContent = 'Errore: ' + err.message;
    fwModalResult.className = 'modal-result err';
    fwModalUpload.disabled = false;
    fwModalCancel.disabled = false;
  }
});

function openFwEditModal(id) {
  const fw = fwList.find(f => f.id === id);
  if (!fw) return;
  fwEditId = id;
  fwEditVersion.value = fw.version;
  fwEditTarget.value = fw.target;
  fwEditDate.value = fw.date;
  fwEditDesc.value = fw.description || '';
  fwEditModalResult.className = 'modal-result hidden';
  populateFwSelectors(fwEditGroupList, fwEditDeviceList, new Set(fw.groups || []), new Set(fw.devices || []));
  fwEditModal.classList.remove('hidden');
  fwEditVersion.focus();
}

function closeFwEditModal() {
  fwEditModal.classList.add('hidden');
  fwEditId = null;
}

fwEditModalClose.addEventListener('click', closeFwEditModal);
fwEditModalCancel.addEventListener('click', closeFwEditModal);
fwEditModal.addEventListener('click', (ev) => { if (ev.target === fwEditModal) closeFwEditModal(); });

fwEditModalSave.addEventListener('click', async () => {
  if (!fwEditId) return;
  const version = fwEditVersion.value.trim();
  if (!version) {
    fwEditModalResult.textContent = 'Versione obbligatoria';
    fwEditModalResult.className = 'modal-result err';
    return;
  }
  const body = {
    version,
    target: fwEditTarget.value,
    date: fwEditDate.value,
    description: fwEditDesc.value.trim(),
    groups: [...fwEditGroupList.querySelectorAll('input:checked')].map(cb => cb.value),
    devices: [...fwEditDeviceList.querySelectorAll('input:checked')].map(cb => cb.value),
  };
  try {
    const r = await fetch(`/api/firmware/${encodeURIComponent(fwEditId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (data.ok) {
      closeFwEditModal();
      await loadFirmwareList();
      renderFirmware();
    } else {
      fwEditModalResult.textContent = data.error || 'Errore sconosciuto';
      fwEditModalResult.className = 'modal-result err';
    }
  } catch (_) {
    fwEditModalResult.textContent = 'Errore di rete';
    fwEditModalResult.className = 'modal-result err';
  }
});

// ---- Flash modal ----

const fwFlashModal   = document.getElementById('fw-flash-modal');
const fwFlashClose   = document.getElementById('fw-flash-modal-close');
const fwFlashCancel  = document.getElementById('fw-flash-cancel');
const fwFlashStart   = document.getElementById('fw-flash-start');
const fwFlashInfo    = document.getElementById('fw-flash-info');
const fwFlashTargets = document.getElementById('fw-flash-targets');
const fwFlashLog     = document.getElementById('fw-flash-log');

let fwFlashId = null;
let fwFlashing = false;

function buildFlashTargetList(fw) {
  const directIds  = new Set(fw.devices || []);
  const groupDevIds = new Set();
  const groupLabels = {};
  for (const gid of (fw.groups || [])) {
    const g = groupsMap.get(gid);
    if (!g) continue;
    for (const did of (g.deviceIds || [])) {
      groupDevIds.add(did);
      if (!groupLabels[did]) groupLabels[did] = [];
      groupLabels[did].push(g.name);
    }
  }
  const preselected = new Set([...directIds, ...groupDevIds]);

  const allDevices = Array.from(devices.values()).sort((a, b) =>
    (a.name || a.id).localeCompare(b.name || b.id));

  if (allDevices.length === 0) {
    fwFlashTargets.innerHTML = '<p class="fw-flash-empty">Nessun dispositivo registrato.</p>';
    fwFlashStart.disabled = true;
    return;
  }

  let html = '<div class="fw-flash-select-row">';
  html += `<button class="btn fw-selall-btn" id="fw-selall">Seleziona tutti</button>`;
  html += `<button class="btn fw-selall-btn" id="fw-selnone">Deseleziona tutti</button>`;
  html += '</div><div class="fw-target-list">';

  for (const d of allDevices) {
    const checked = preselected.has(d.id) ? 'checked' : '';
    const onlineDot = d.online
      ? '<span class="fw-dot fw-dot-on" title="Online"></span>'
      : '<span class="fw-dot fw-dot-off" title="Offline"></span>';
    const labels = [];
    if (directIds.has(d.id)) labels.push('<span class="fw-tag fw-tag-direct">associato</span>');
    if (groupDevIds.has(d.id)) {
      for (const gname of (groupLabels[d.id] || [])) {
        labels.push(`<span class="fw-tag fw-tag-group">${escapeHtml(gname)}</span>`);
      }
    }
    html += `<label class="fw-target-row">
      <input type="checkbox" class="fw-target-cb" value="${escapeHtml(d.id)}" ${checked} />
      ${onlineDot}
      <span class="fw-target-name">${escapeHtml(d.name || d.hostname || d.id)}</span>
      <span class="fw-target-ip">${escapeHtml(d.ip || '')}</span>
      <span class="fw-target-tags">${labels.join('')}</span>
    </label>`;
  }
  html += '</div>';
  fwFlashTargets.innerHTML = html;

  fwFlashTargets.querySelector('#fw-selall').addEventListener('click', () => {
    fwFlashTargets.querySelectorAll('.fw-target-cb').forEach(cb => { cb.checked = true; });
    updateFlashBtn();
  });
  fwFlashTargets.querySelector('#fw-selnone').addEventListener('click', () => {
    fwFlashTargets.querySelectorAll('.fw-target-cb').forEach(cb => { cb.checked = false; });
    updateFlashBtn();
  });
  fwFlashTargets.addEventListener('change', updateFlashBtn);
  updateFlashBtn();
}

function updateFlashBtn() {
  const count = fwFlashTargets.querySelectorAll('.fw-target-cb:checked').length;
  fwFlashStart.disabled = count === 0 || fwFlashing;
  fwFlashStart.textContent = count > 0
    ? `▶ Flash su ${count} dispositiv${count === 1 ? 'o' : 'i'}`
    : '▶ Flash su selezionati';
}

function openFwFlashModal(id) {
  const fw = fwList.find(f => f.id === id);
  if (!fw) return;
  fwFlashId = id;
  fwFlashing = false;
  fwFlashLog.innerHTML = '';
  fwFlashLog.classList.add('hidden');

  const targetClass = fw.target === 'esp32' ? 'esp32'
                    : fw.target === 'libretiny' ? 'libretiny'
                    : '';
  const targetBadge = `<span class="badge ${targetClass}">${fw.target.toUpperCase()}</span>`;
  fwFlashInfo.innerHTML = `
    <div class="fw-flash-header-info">
      <span class="badge fw">v${escapeHtml(fw.version)}</span>
      ${targetBadge}
      <span class="fw-card-date">${escapeHtml(fw.date)}</span>
      <span class="fw-card-filename">${escapeHtml(fw.originalName || fw.filename)}</span>
    </div>`;

  buildFlashTargetList(fw);
  fwFlashModal.classList.remove('hidden');
}

function closeFwFlashModal() {
  if (fwFlashing) return;
  fwFlashModal.classList.add('hidden');
  fwFlashId = null;
}

function appendFlashLog(deviceName, status, msg) {
  const row = document.createElement('div');
  row.className = 'fw-log-row fw-log-' + status;
  row.innerHTML = `<span class="fw-log-name">${escapeHtml(deviceName)}</span><span class="fw-log-msg">${escapeHtml(msg)}</span>`;
  fwFlashLog.appendChild(row);
  fwFlashLog.scrollTop = fwFlashLog.scrollHeight;
}

fwFlashStart.addEventListener('click', async () => {
  if (!fwFlashId || fwFlashing) return;
  const selected = [...fwFlashTargets.querySelectorAll('.fw-target-cb:checked')].map(cb => cb.value);
  if (selected.length === 0) return;

  fwFlashing = true;
  fwFlashStart.disabled = true;
  fwFlashCancel.disabled = true;
  fwFlashTargets.querySelectorAll('.fw-target-cb, .fw-selall-btn').forEach(el => { el.disabled = true; });
  fwFlashLog.innerHTML = '';
  fwFlashLog.classList.remove('hidden');

  let ok = 0, fail = 0;
  for (const did of selected) {
    const d = devices.get(did);
    const name = d ? (d.name || d.hostname || d.id) : did;
    appendFlashLog(name, 'pending', 'flashing…');
    try {
      const r = await fetch(`/api/firmware/${encodeURIComponent(fwFlashId)}/flash/${encodeURIComponent(did)}`, { method: 'POST' });
      const body = await r.json().catch(() => ({}));
      const lastRow = fwFlashLog.lastElementChild;
      if (r.ok && body.ok !== false) {
        lastRow.className = 'fw-log-row fw-log-ok';
        lastRow.querySelector('.fw-log-msg').textContent = 'completato — dispositivo in riavvio';
        ok++;
      } else {
        lastRow.className = 'fw-log-row fw-log-err';
        lastRow.querySelector('.fw-log-msg').textContent = body.error || `HTTP ${r.status}`;
        fail++;
      }
    } catch (_) {
      fwFlashLog.lastElementChild.className = 'fw-log-row fw-log-err';
      fwFlashLog.lastElementChild.querySelector('.fw-log-msg').textContent = 'errore di rete';
      fail++;
    }
  }

  const summary = document.createElement('div');
  summary.className = 'fw-log-summary';
  summary.textContent = `Completato: ${ok} ok, ${fail} errori`;
  fwFlashLog.appendChild(summary);

  fwFlashing = false;
  fwFlashCancel.disabled = false;
  fwFlashCancel.textContent = 'Chiudi';
});

fwFlashClose.addEventListener('click', closeFwFlashModal);
fwFlashCancel.addEventListener('click', closeFwFlashModal);
fwFlashModal.addEventListener('click', (ev) => { if (ev.target === fwFlashModal) closeFwFlashModal(); });

// ---- Modal Filesystem ----

const fsModal       = document.getElementById('fs-modal');
const fsModalClose  = document.getElementById('fs-modal-close');
const fsModalExit   = document.getElementById('fs-modal-exit');
const fsTree        = document.getElementById('fs-tree');
const fsFileList    = document.getElementById('fs-file-list');
const fsStatus      = document.getElementById('fs-status');
const fsUsage       = document.getElementById('fs-usage');
const fsPathEl      = document.getElementById('fs-path');
const fsUploadBtn   = document.getElementById('fs-upload-btn');
const fsUploadInput = document.getElementById('fs-upload-input');
const fsMkdirBtn    = document.getElementById('fs-mkdir-btn');
const fsDropZone    = document.getElementById('fs-drop-zone');
const fsDropOverlay = document.getElementById('fs-drop-overlay');

let fsDeviceId    = null;
let fsCurrentPath = '/';
let fsFolderCache = {};

function fsJoin(base, name) {
  return base === '/' ? '/' + name : base + '/' + name;
}

async function openFsModal(device) {
  if (!device) return;
  fsDeviceId    = device.id;
  fsCurrentPath = '/';
  fsFolderCache = {};
  fsModalTitle.textContent = `Filesystem — ${device.name || device.id}`;
  fsStatus.textContent = '';
  fsUsage.textContent  = '';
  fsPathEl.textContent = '/';
  fsTree.innerHTML     = '';
  fsFileList.innerHTML = '';
  fsModal.classList.remove('hidden');
  await Promise.all([loadFsInfo(), loadFsPath('/')]);
}

// fsModalTitle reuses the existing global id from cmd-modal — use a local ref
const fsModalTitle = document.getElementById('fs-modal-title');

function closeFsModal() {
  fsModal.classList.add('hidden');
  fsDeviceId = null;
}

async function loadFsInfo() {
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(fsDeviceId)}/fs/info`);
    const d = await r.json().catch(() => ({}));
    if (d.ok) {
      const pct = Math.round((d.usedBytes / d.totalBytes) * 100);
      fsUsage.textContent = `${fmtBytes(d.usedBytes)} / ${fmtBytes(d.totalBytes)} (${pct}%)`;
    }
  } catch (_) {}
}

async function loadFsPath(path) {
  fsCurrentPath    = path;
  fsPathEl.textContent = path;
  setFsStatus('Caricamento…');
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(fsDeviceId)}/fs/list?path=${encodeURIComponent(path)}`);
    const d = await r.json().catch(() => ({}));
    if (!d.ok) { setFsStatus(d.error || 'Errore', true); return; }
    fsFolderCache[path] = d;
    renderFsTree();
    renderFsFiles(d);
    setFsStatus('');
  } catch (_) {
    setFsStatus('Errore di rete', true);
  }
}

function setFsStatus(msg, isErr) {
  fsStatus.textContent = msg;
  fsStatus.className   = 'fs-status' + (isErr ? ' err' : '');
}

function renderFsTree() {
  let html = '<ul class="fs-tree-list">';
  html += buildFsTreeNode('/', 0);
  html += '</ul>';
  fsTree.innerHTML = html;
}

function buildFsTreeNode(path, depth) {
  const isSelected = path === fsCurrentPath;
  const name       = path === '/' ? '/ (root)' : path.split('/').pop();
  const indent     = depth * 14;
  let html = `<li class="fs-tree-item${isSelected ? ' selected' : ''}" data-path="${escapeHtml(path)}" style="padding-left:${indent + 8}px">`;
  html += `<span class="fs-tree-icon">📁</span><span class="fs-tree-name">${escapeHtml(name)}</span></li>`;
  const cached = fsFolderCache[path];
  if (cached && cached.dirs && cached.dirs.length > 0) {
    html += '<ul class="fs-tree-list">';
    for (const dir of cached.dirs) {
      html += buildFsTreeNode(fsJoin(path, dir), depth + 1);
    }
    html += '</ul>';
  }
  return html;
}

function fsIsTextFile(name) {
  return /\.(txt|json|html?|xml|css|js|mjs|ts|md|csv|ini|conf|cfg|ya?ml|log|h|hpp|cpp|c|py|sh|bat|env)$/i.test(name);
}

function renderFsFiles(data) {
  let html = '';
  for (const dir of (data.dirs || [])) {
    const fullPath = fsJoin(fsCurrentPath, dir);
    html += `<div class="fs-entry fs-entry-dir" data-path="${escapeHtml(fullPath)}">
      <span class="fs-entry-icon">📁</span>
      <span class="fs-entry-name">${escapeHtml(dir)}</span>
      <span class="fs-entry-size">—</span>
      <div class="fs-entry-actions">
        <button class="btn btn-sm btn-sm-del" data-action="fs-rmdir" data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(dir)}">Elimina</button>
      </div>
    </div>`;
  }
  for (const file of (data.files || [])) {
    const fullPath = fsJoin(fsCurrentPath, file.name);
    const editBtn = fsIsTextFile(file.name)
      ? `<button class="btn btn-sm btn-sm-edit" data-action="fs-edit" data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(file.name)}">Modifica</button>`
      : '';
    html += `<div class="fs-entry fs-entry-file">
      <span class="fs-entry-icon">📄</span>
      <span class="fs-entry-name">${escapeHtml(file.name)}</span>
      <span class="fs-entry-size">${fmtBytes(file.size)}</span>
      <div class="fs-entry-actions">
        ${editBtn}
        <a class="btn btn-sm btn-sm-dl" href="/api/devices/${encodeURIComponent(fsDeviceId)}/fs/download?path=${encodeURIComponent(fullPath)}" download="${escapeHtml(file.name)}">Scarica</a>
        <button class="btn btn-sm btn-sm-del" data-action="fs-delete" data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(file.name)}">Elimina</button>
      </div>
    </div>`;
  }
  if (!html) html = '<div class="fs-empty">Cartella vuota — trascina qui i file per caricarli</div>';
  fsFileList.innerHTML = html;
}

// Tree navigation
fsTree.addEventListener('click', async (ev) => {
  const item = ev.target.closest('.fs-tree-item');
  if (!item) return;
  await loadFsPath(item.dataset.path);
});

// File list actions
fsFileList.addEventListener('click', async (ev) => {
  const dir = ev.target.closest('.fs-entry-dir');
  if (dir && !ev.target.closest('button')) {
    await loadFsPath(dir.dataset.path);
    return;
  }
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const itemPath = btn.dataset.path;
  const itemName = btn.dataset.name;
  if (btn.dataset.action === 'fs-edit') {
    await openFsEditModal(itemPath, itemName);
  } else if (btn.dataset.action === 'fs-delete') {
    if (!confirm(`Eliminare il file "${itemName}"?`)) return;
    await fsDeleteItem(itemPath);
  } else if (btn.dataset.action === 'fs-rmdir') {
    if (!confirm(`Eliminare la cartella "${itemName}" e tutto il suo contenuto?`)) return;
    await fsDeleteItem(itemPath);
  }
});

async function fsDeleteItem(itemPath) {
  setFsStatus('Eliminazione…');
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(fsDeviceId)}/fs/delete?path=${encodeURIComponent(itemPath)}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (d.ok) {
      delete fsFolderCache[fsCurrentPath];
      delete fsFolderCache[itemPath];
      await loadFsPath(fsCurrentPath);
      await loadFsInfo();
      setFsStatus('Eliminato');
    } else {
      setFsStatus(d.error || 'Errore eliminazione', true);
    }
  } catch (_) { setFsStatus('Errore di rete', true); }
}

// Mkdir
fsMkdirBtn.addEventListener('click', async () => {
  const name = prompt('Nome della nuova cartella:');
  if (!name || !name.trim()) return;
  const newPath = fsJoin(fsCurrentPath, name.trim().replace(/[/\\]/g, '_'));
  setFsStatus('Creazione cartella…');
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(fsDeviceId)}/fs/mkdir?path=${encodeURIComponent(newPath)}`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (d.ok) {
      delete fsFolderCache[fsCurrentPath];
      await loadFsPath(fsCurrentPath);
      setFsStatus(`Cartella creata: ${newPath}`);
    } else {
      setFsStatus(d.error || 'Errore mkdir', true);
    }
  } catch (_) { setFsStatus('Errore di rete', true); }
});

// Upload via button
fsUploadBtn.addEventListener('click', () => { fsUploadInput.value = ''; fsUploadInput.click(); });
fsUploadInput.addEventListener('change', () => {
  if (fsUploadInput.files.length > 0) uploadFsFiles([...fsUploadInput.files]);
});

// Drag & drop
fsDropZone.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  fsDropZone.classList.add('drag-over');
  fsDropOverlay.classList.remove('hidden');
});
fsDropZone.addEventListener('dragleave', (ev) => {
  if (ev.relatedTarget && fsDropZone.contains(ev.relatedTarget)) return;
  fsDropZone.classList.remove('drag-over');
  fsDropOverlay.classList.add('hidden');
});
fsDropZone.addEventListener('drop', (ev) => {
  ev.preventDefault();
  fsDropZone.classList.remove('drag-over');
  fsDropOverlay.classList.add('hidden');
  if (ev.dataTransfer.files.length > 0) uploadFsFiles([...ev.dataTransfer.files]);
});

async function uploadFsFiles(files) {
  for (const file of files) {
    const filePath = fsJoin(fsCurrentPath, file.name);
    setFsStatus(`Caricamento: ${file.name} (${fmtBytes(file.size)})…`);
    const form = new FormData();
    form.append('file', file, file.name);
    try {
      const r = await fetch(`/api/devices/${encodeURIComponent(fsDeviceId)}/fs/upload?path=${encodeURIComponent(filePath)}`, {
        method: 'POST',
        body: form,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) {
        setFsStatus(`Errore: ${d.error || 'upload fallito'}`, true);
        return;
      }
    } catch (_) { setFsStatus('Errore di rete', true); return; }
  }
  delete fsFolderCache[fsCurrentPath];
  await loadFsPath(fsCurrentPath);
  await loadFsInfo();
  setFsStatus(`${files.length} file caricati`);
}

// File editor modal
const fsEditModal       = document.getElementById('fs-edit-modal');
const fsEditContent     = document.getElementById('fs-edit-content');
const fsEditStatus      = document.getElementById('fs-edit-status');
const fsEditSaveBtn     = document.getElementById('fs-edit-save');
const fsEditCancelBtn   = document.getElementById('fs-edit-cancel');
const fsEditModalClose  = document.getElementById('fs-edit-modal-close');
const fsEditModalTitle  = document.getElementById('fs-edit-modal-title');

let fsEditCurrentPath = null;

function setFsEditStatus(msg, err = false) {
  fsEditStatus.textContent = msg;
  fsEditStatus.className = 'fs-status' + (err ? ' err' : msg ? ' ok' : '');
}

async function openFsEditModal(filePath, fileName) {
  fsEditCurrentPath = filePath;
  fsEditModalTitle.textContent = `Modifica: ${fileName}`;
  fsEditContent.value = '';
  setFsEditStatus('Caricamento…');
  fsEditSaveBtn.disabled = true;
  fsEditModal.classList.remove('hidden');

  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(fsDeviceId)}/fs/download?path=${encodeURIComponent(filePath)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    fsEditContent.value = text;
    setFsEditStatus('');
    fsEditSaveBtn.disabled = false;
  } catch (e) {
    setFsEditStatus(`Errore lettura: ${e.message}`, true);
  }
}

function closeFsEditModal() {
  fsEditModal.classList.add('hidden');
  fsEditCurrentPath = null;
  fsEditContent.value = '';
  setFsEditStatus('');
}

fsEditSaveBtn.addEventListener('click', async () => {
  if (!fsEditCurrentPath) return;
  fsEditSaveBtn.disabled = true;
  setFsEditStatus('Salvataggio…');
  const blob = new Blob([fsEditContent.value], { type: 'text/plain' });
  const fileName = fsEditCurrentPath.split('/').pop();
  const form = new FormData();
  form.append('file', blob, fileName);
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(fsDeviceId)}/fs/upload?path=${encodeURIComponent(fsEditCurrentPath)}`, {
      method: 'POST',
      body: form,
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok !== false) {
      setFsEditStatus('Salvato');
      delete fsFolderCache[fsCurrentPath];
      await loadFsPath(fsCurrentPath);
      await loadFsInfo();
    } else {
      setFsEditStatus(d.error || 'Errore salvataggio', true);
    }
  } catch (_) {
    setFsEditStatus('Errore di rete', true);
  }
  fsEditSaveBtn.disabled = false;
});

fsEditCancelBtn.addEventListener('click', closeFsEditModal);
fsEditModalClose.addEventListener('click', closeFsEditModal);
fsEditModal.addEventListener('click', (ev) => { if (ev.target === fsEditModal) closeFsEditModal(); });

// Close
fsModalClose.addEventListener('click', closeFsModal);
fsModalExit.addEventListener('click', closeFsModal);
fsModal.addEventListener('click', (ev) => { if (ev.target === fsModal) closeFsModal(); });

// ---- Config Modal (LibreTiny / PrefsManager) ----

const configModal       = document.getElementById('config-modal');
const configModalTitle  = document.getElementById('config-modal-title');
const configModalClose  = document.getElementById('config-modal-close');
const configModalExit   = document.getElementById('config-modal-exit');
const configLoading     = document.getElementById('config-loading');
const configContent     = document.getElementById('config-content');
const configStatus      = document.getElementById('config-status');
const configAddNsBtn    = document.getElementById('config-add-ns-btn');
const configBackupBtn   = document.getElementById('config-backup-btn');
const configRestoreBtn  = document.getElementById('config-restore-btn');
const configRestoreFile = document.getElementById('config-restore-file');
const configDeleteAllBtn = document.getElementById('config-delete-all-btn');

let configDevice = null;
let configData   = {};

const CONFIG_TYPES = ['str', 'int32', 'uint32', 'int64', 'float', 'double', 'bool'];

const CONFIG_TYPE_LABELS = {
  str: 'string', int32: 'int32', uint32: 'uint32',
  int64: 'int64', float: 'float', double: 'double', bool: 'bool',
};

const CONFIG_TYPE_VALIDATORS = {
  str:    () => true,
  bool:   v => v === 'true' || v === 'false',
  int32:  v => /^-?\d+$/.test(v.trim()) && Number(v) >= -2147483648 && Number(v) <= 2147483647,
  uint32: v => /^\d+$/.test(v.trim()) && Number(v) <= 4294967295,
  int64:  v => /^-?\d+$/.test(v.trim()),
  float:  v => v.trim() !== '' && !isNaN(parseFloat(v)) && isFinite(Number(v)),
  double: v => v.trim() !== '' && !isNaN(parseFloat(v)) && isFinite(Number(v)),
};

function setConfigStatus(msg, isError = false) {
  configStatus.textContent = msg;
  configStatus.className = 'config-status' + (isError ? ' err' : msg ? ' ok' : '');
}

async function openConfigModal(device) {
  configDevice = device;
  configModalTitle.textContent = `Config – ${device.name || device.hostname || device.id}`;
  configModal.classList.remove('hidden');
  await refreshConfig();
}

function closeConfigModal() {
  configModal.classList.add('hidden');
  configDevice = null;
  configData = {};
  configContent.innerHTML = '';
  setConfigStatus('');
}

async function refreshConfig() {
  configLoading.classList.remove('hidden');
  configContent.innerHTML = '';
  setConfigStatus('');
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(configDevice.id)}/config`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    configData = await r.json();
    renderConfig(configData);
  } catch (e) {
    setConfigStatus(`Error: ${e.message}`, true);
  } finally {
    configLoading.classList.add('hidden');
  }
}

function renderConfig(data) {
  configContent.innerHTML = '';
  const nsList = Object.keys(data);
  if (nsList.length === 0) {
    configContent.innerHTML = '<p class="config-empty">No namespaces. Click "+ Namespace" to add one.</p>';
    return;
  }
  for (const ns of nsList) {
    configContent.appendChild(renderNamespace(ns, data[ns]));
  }
}

function makeTypeInput(type, value) {
  let el;
  if (type === 'bool') {
    el = document.createElement('select');
    el.className = 'config-value-input';
    for (const v of ['true', 'false']) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      if (String(value) === v) opt.selected = true;
      el.appendChild(opt);
    }
  } else {
    el = document.createElement('input');
    el.className = 'config-value-input';
    el.value = value != null ? String(value) : '';
    if (type === 'int32')       { el.type = 'number'; el.step = '1'; el.min = '-2147483648'; el.max = '2147483647'; }
    else if (type === 'uint32') { el.type = 'number'; el.step = '1'; el.min = '0'; el.max = '4294967295'; }
    else if (type === 'float' || type === 'double') { el.type = 'number'; el.step = 'any'; }
    else                        { el.type = 'text'; }
  }
  return el;
}

function renderNamespace(ns, keys) {
  const section = document.createElement('section');
  section.className = 'config-ns';
  section.dataset.ns = ns;

  const header = document.createElement('div');
  header.className = 'config-ns-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'config-ns-name';
  nameEl.textContent = ns;
  const actions = document.createElement('div');
  actions.className = 'config-ns-actions';

  const addKeyBtn = document.createElement('button');
  addKeyBtn.className = 'btn btn-sm';
  addKeyBtn.textContent = '+ Key';
  addKeyBtn.addEventListener('click', () => showAddKeyForm(ns, section));

  const delNsBtn = document.createElement('button');
  delNsBtn.className = 'btn btn-sm btn-sm-del';
  delNsBtn.textContent = 'Delete NS';
  delNsBtn.addEventListener('click', () => deleteNamespace(ns));

  actions.appendChild(addKeyBtn);
  actions.appendChild(delNsBtn);
  header.appendChild(nameEl);
  header.appendChild(actions);
  section.appendChild(header);

  const keyEntries = Object.entries(keys);
  if (keyEntries.length > 0) {
    const table = document.createElement('table');
    table.className = 'config-key-table';
    table.innerHTML = '<thead><tr><th>Key</th><th>Type</th><th>Value</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    for (const [key, meta] of keyEntries) {
      tbody.appendChild(renderKeyRow(ns, key, meta.type, meta.value));
    }
    table.appendChild(tbody);
    section.appendChild(table);
  }

  return section;
}

function renderKeyRow(ns, key, type, value) {
  const tr = document.createElement('tr');
  tr.className = 'config-key-row';
  tr.dataset.key = key;
  const displayValue = value != null ? String(value) : '—';

  const keyTd = document.createElement('td');
  keyTd.className = 'config-key-name';
  keyTd.textContent = key;

  const typeTd = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `config-type-badge type-${type}`;
  badge.textContent = CONFIG_TYPE_LABELS[type] || type;
  typeTd.appendChild(badge);

  const valueTd = document.createElement('td');
  valueTd.className = 'config-value-cell';
  valueTd.textContent = displayValue;

  const actionsTd = document.createElement('td');
  actionsTd.className = 'config-row-actions';
  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-sm btn-sm-edit';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => startEditKey(tr, ns, key, type, value));
  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-sm btn-sm-del';
  delBtn.textContent = 'Del';
  delBtn.addEventListener('click', () => deleteKey(ns, key));
  actionsTd.appendChild(editBtn);
  actionsTd.appendChild(delBtn);

  tr.appendChild(keyTd);
  tr.appendChild(typeTd);
  tr.appendChild(valueTd);
  tr.appendChild(actionsTd);
  return tr;
}

function startEditKey(tr, ns, key, type, currentValue) {
  const valueTd = tr.querySelector('.config-value-cell');
  const actionsTd = tr.querySelector('.config-row-actions');
  const originalText = valueTd.textContent;

  const input = makeTypeInput(type, currentValue);
  valueTd.textContent = '';
  valueTd.appendChild(input);
  input.focus();

  actionsTd.innerHTML = '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-sm btn-save';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm';
  cancelBtn.textContent = 'Cancel';

  const cancel = () => {
    valueTd.textContent = originalText;
    actionsTd.innerHTML = '';
    const eb = document.createElement('button');
    eb.className = 'btn btn-sm btn-sm-edit';
    eb.textContent = 'Edit';
    eb.addEventListener('click', () => startEditKey(tr, ns, key, type, currentValue));
    const db = document.createElement('button');
    db.className = 'btn btn-sm btn-sm-del';
    db.textContent = 'Del';
    db.addEventListener('click', () => deleteKey(ns, key));
    actionsTd.appendChild(eb);
    actionsTd.appendChild(db);
  };

  const save = async () => {
    const newVal = input.value;
    const validator = CONFIG_TYPE_VALIDATORS[type] || (() => true);
    if (!validator(newVal)) {
      setConfigStatus(`Invalid value for type "${type}"`, true);
      input.focus();
      return;
    }
    saveBtn.disabled = true;
    setConfigStatus('Saving…');
    try {
      const r = await fetch(
        `/api/devices/${encodeURIComponent(configDevice.id)}/config/key?ns=${encodeURIComponent(ns)}&key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, value: newVal }) }
      );
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok !== false) {
        setConfigStatus('Saved');
        await refreshConfig();
      } else {
        setConfigStatus(d.error || 'Save failed', true);
        saveBtn.disabled = false;
      }
    } catch (_) {
      setConfigStatus('Network error', true);
      saveBtn.disabled = false;
    }
  };

  saveBtn.addEventListener('click', save);
  cancelBtn.addEventListener('click', cancel);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); save(); }
    if (ev.key === 'Escape') cancel();
  });
  actionsTd.appendChild(saveBtn);
  actionsTd.appendChild(cancelBtn);
}

async function deleteKey(ns, key) {
  if (!confirm(`Delete key "${key}" from namespace "${ns}"?`)) return;
  setConfigStatus('Deleting…');
  try {
    const r = await fetch(
      `/api/devices/${encodeURIComponent(configDevice.id)}/config/key?ns=${encodeURIComponent(ns)}&key=${encodeURIComponent(key)}`,
      { method: 'DELETE' }
    );
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok !== false) {
      setConfigStatus('Key deleted');
      await refreshConfig();
    } else {
      setConfigStatus(d.error || 'Delete failed', true);
    }
  } catch (_) {
    setConfigStatus('Network error', true);
  }
}

function showAddKeyForm(ns, section) {
  section.querySelector('.config-add-key-row')?.remove();

  let table = section.querySelector('.config-key-table');
  if (!table) {
    table = document.createElement('table');
    table.className = 'config-key-table';
    table.innerHTML = '<thead><tr><th>Key</th><th>Type</th><th>Value</th><th></th></tr></thead>';
    table.appendChild(document.createElement('tbody'));
    section.appendChild(table);
  }
  const tbody = table.querySelector('tbody');

  const tr = document.createElement('tr');
  tr.className = 'config-add-key-row';

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'config-key-input';
  keyInput.placeholder = 'key name';
  keyInput.maxLength = 15;

  const typeSelect = document.createElement('select');
  typeSelect.className = 'config-type-select';
  for (const t of CONFIG_TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = CONFIG_TYPE_LABELS[t] || t;
    typeSelect.appendChild(opt);
  }

  const valueCell = document.createElement('td');
  let valInput = makeTypeInput('str', '');
  valueCell.appendChild(valInput);
  typeSelect.addEventListener('change', () => {
    const newInput = makeTypeInput(typeSelect.value, '');
    valueCell.replaceChild(newInput, valInput);
    valInput = newInput;
    newInput.focus();
  });

  const actionsTd = document.createElement('td');
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-sm btn-save';
  addBtn.textContent = 'Add';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => tr.remove());

  const doAdd = async () => {
    const key = keyInput.value.trim();
    const type = typeSelect.value;
    const val = valInput.value;
    if (!key) { setConfigStatus('Key name required', true); keyInput.focus(); return; }
    if (key.length > 15) { setConfigStatus('Key name max 15 chars', true); keyInput.focus(); return; }
    const validator = CONFIG_TYPE_VALIDATORS[type] || (() => true);
    if (!validator(val)) { setConfigStatus(`Invalid value for type "${type}"`, true); valInput.focus(); return; }
    addBtn.disabled = true;
    setConfigStatus('Adding…');
    try {
      const r = await fetch(
        `/api/devices/${encodeURIComponent(configDevice.id)}/config/key?ns=${encodeURIComponent(ns)}&key=${encodeURIComponent(key)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, value: val }) }
      );
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok !== false) {
        setConfigStatus('Key added');
        await refreshConfig();
      } else {
        setConfigStatus(d.error || 'Add failed', true);
        addBtn.disabled = false;
      }
    } catch (_) {
      setConfigStatus('Network error', true);
      addBtn.disabled = false;
    }
  };

  addBtn.addEventListener('click', doAdd);
  keyInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') doAdd();
    if (ev.key === 'Escape') tr.remove();
  });

  const keyTd = document.createElement('td');
  keyTd.appendChild(keyInput);
  const typeTd = document.createElement('td');
  typeTd.appendChild(typeSelect);
  actionsTd.appendChild(addBtn);
  actionsTd.appendChild(cancelBtn);
  tr.appendChild(keyTd);
  tr.appendChild(typeTd);
  tr.appendChild(valueCell);
  tr.appendChild(actionsTd);
  tbody.appendChild(tr);
  keyInput.focus();
}

function showAddNamespaceForm() {
  configContent.querySelector('.config-add-ns-form')?.remove();

  const form = document.createElement('div');
  form.className = 'config-add-ns-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'config-key-input';
  input.placeholder = 'namespace name (max 15 chars)';
  input.maxLength = 15;

  const createBtn = document.createElement('button');
  createBtn.className = 'btn btn-sm btn-save';
  createBtn.textContent = 'Create';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => form.remove());

  const doCreate = () => {
    const ns = input.value.trim();
    if (!ns) { setConfigStatus('Namespace name required', true); input.focus(); return; }
    if (ns.length > 15) { setConfigStatus('Namespace name max 15 chars', true); input.focus(); return; }
    if (ns === '_reg') { setConfigStatus('Reserved namespace name', true); input.focus(); return; }
    form.remove();
    const tempSection = renderNamespace(ns, {});
    configContent.appendChild(tempSection);
    showAddKeyForm(ns, tempSection);
  };

  createBtn.addEventListener('click', doCreate);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') doCreate();
    if (ev.key === 'Escape') form.remove();
  });

  form.appendChild(input);
  form.appendChild(createBtn);
  form.appendChild(cancelBtn);
  configContent.prepend(form);
  input.focus();
}

async function deleteNamespace(ns) {
  if (!confirm(`Delete namespace "${ns}" and all its keys?`)) return;
  setConfigStatus('Deleting namespace…');
  try {
    const r = await fetch(
      `/api/devices/${encodeURIComponent(configDevice.id)}/config/namespace?ns=${encodeURIComponent(ns)}`,
      { method: 'DELETE' }
    );
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok !== false) {
      setConfigStatus('Namespace deleted');
      await refreshConfig();
    } else {
      setConfigStatus(d.error || 'Delete failed', true);
    }
  } catch (_) {
    setConfigStatus('Network error', true);
  }
}

async function deleteAllConfig() {
  if (!confirm('Delete ALL namespaces and keys?')) return;
  if (!confirm('This is irreversible. Confirm?')) return;
  setConfigStatus('Deleting all…');
  try {
    const r = await fetch(
      `/api/devices/${encodeURIComponent(configDevice.id)}/config`,
      { method: 'DELETE' }
    );
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok !== false) {
      setConfigStatus('All config deleted');
      await refreshConfig();
    } else {
      setConfigStatus(d.error || 'Delete failed', true);
    }
  } catch (_) {
    setConfigStatus('Network error', true);
  }
}

async function backupConfig() {
  if (!configDevice) return;
  setConfigStatus('Downloading backup…');
  try {
    const r = await fetch(`/api/devices/${encodeURIComponent(configDevice.id)}/config`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `config_${configDevice.id}_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setConfigStatus('Backup downloaded');
  } catch (e) {
    setConfigStatus(`Backup failed: ${e.message}`, true);
  }
}

async function restoreConfig(file) {
  if (!file || !configDevice) return;
  setConfigStatus('Restoring…');
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const r = await fetch(
      `/api/devices/${encodeURIComponent(configDevice.id)}/config/restore`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    );
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok !== false) {
      setConfigStatus('Restore complete');
      await refreshConfig();
    } else {
      setConfigStatus(d.error || 'Restore failed', true);
    }
  } catch (e) {
    setConfigStatus(`Restore failed: ${e.message}`, true);
  }
  configRestoreFile.value = '';
}

configAddNsBtn.addEventListener('click', showAddNamespaceForm);
configBackupBtn.addEventListener('click', backupConfig);
configRestoreBtn.addEventListener('click', () => configRestoreFile.click());
configRestoreFile.addEventListener('change', (ev) => restoreConfig(ev.target.files[0]));
configDeleteAllBtn.addEventListener('click', deleteAllConfig);
configModalClose.addEventListener('click', closeConfigModal);
configModalExit.addEventListener('click', closeConfigModal);
configModal.addEventListener('click', (ev) => { if (ev.target === configModal) closeConfigModal(); });

connect();
