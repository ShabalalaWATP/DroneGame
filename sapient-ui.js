// The SAPIENT dock: message log + JSON inspector, node table, plan view of the laydown, and the
// real-world reference for each purchasable system.

import { bus } from './sapient.js';
import { STRUCTURES, DRONES, WORLD, BUILD, SITE } from './config.js';
import { view } from './view.js';
import { terrainState } from './terrain.js';

const TYPES = [
  ['registration', 'Reg'], ['registration_ack', 'RegAck'], ['status_report', 'Status'], ['detection_report', 'Detect'],
  ['task', 'Task'], ['task_ack', 'TaskAck'], ['alert', 'Alert'], ['alert_ack', 'AlertAck'], ['error', 'Error'],
];
const MAX_ROWS = 150;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export function initDock({ net, drones }) {
  const dock = document.getElementById('dock');
  dock.innerHTML = `
    <div class="dock-head">
      <div class="tabs">
        <button data-tab="messages" class="active">Messages</button>
        <button data-tab="nodes">Nodes</button>
        <button data-tab="plan">Plan</button>
        <button data-tab="systems">Systems</button>
      </div>
      <button id="dock-close" title="Close">&times;</button>
    </div>
    <div class="tabpane" data-pane="messages">
      <div class="msg-tools">
        <div id="chips"></div>
        <div class="row">
          <select id="node-filter"></select>
          <button id="log-freeze">Freeze</button>
          <button id="log-clear">Clear</button>
          <button id="log-export" title="Download every message as newline-delimited JSON">Export</button>
          <button id="log-fault" title="Send a malformed report to see the middleware's Error reply">Inject fault</button>
        </div>
      </div>
      <div id="msg-list"></div>
      <pre id="msg-detail">Select a message to see its JSON.</pre>
    </div>
    <div class="tabpane hidden" data-pane="nodes"><table id="node-table"></table></div>
    <div class="tabpane hidden" data-pane="plan">
      <div class="plan-tools">
        <label><input type="checkbox" id="cov-on"> Sensor coverage for</label>
        <select id="cov-threat"></select>
        <span class="muted" id="cov-legend"></span>
      </div>
      <canvas id="plan"></canvas>
      <div class="plan-note">North up, scroll to zoom. Circles are each node's range, lines are links to the fusion node (bright when a message has just been sent), red lines are active engagement tasks, crosses are fused tracks drawn where the fusion node believes they are (circle = position error), grey dots are drones nobody has (truth overlay).</div>
    </div>
    <div class="tabpane hidden" data-pane="systems" id="systems"></div>`;

  const $ = (sel) => dock.querySelector(sel);
  const mpu = () => WORLD.metresPerUnit;
  let frozen = false, selected = null, nodeFilter = 'all', activeTab = 'messages';
  const off = new Set();

  // ---------- open / close / tabs ----------
  const toggle = () => dock.classList.toggle('hidden');
  document.getElementById('btn-sapient').onclick = toggle;
  $('#dock-close').onclick = toggle;
  dock.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => {
      activeTab = b.dataset.tab;
      dock.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
      dock.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== activeTab));
      render();
    };
  });

  // ---------- messages ----------
  $('#chips').innerHTML = TYPES.map(([t, label]) => `<button class="chip t-${t}" data-type="${t}">${label} <b id="cnt-${t}">0</b></button>`).join('');
  $('#chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const t = b.dataset.type;
    if (off.has(t)) off.delete(t); else off.add(t);
    b.classList.toggle('off', off.has(t));
    renderMessages(true);
  });
  $('#node-filter').onchange = (e) => { nodeFilter = e.target.value; renderMessages(true); };
  $('#log-freeze').onclick = (e) => { frozen = !frozen; e.target.classList.toggle('active', frozen); e.target.textContent = frozen ? 'Resume' : 'Freeze'; };
  $('#log-clear').onclick = () => { bus.entries.length = 0; selected = null; $('#msg-detail').textContent = 'Select a message to see its JSON.'; renderMessages(true); };
  $('#log-fault').onclick = () => net.injectFault();
  $('#log-export').onclick = () => {
    const blob = new Blob([bus.entries.map((e) => JSON.stringify(e.msg)).join('\n')], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'sapient-log.ndjson'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  function summary(e) {
    const c = e.msg[e.type];
    switch (e.type) {
      case 'registration': return `${c.name} (${c.node_definition[0].node_type.replace('NODE_TYPE_', '')})`;
      case 'registration_ack': return c.acceptance ? 'accepted' : 'rejected';
      case 'status_report': return `${c.mode} · ${c.system.replace('SYSTEM_', '')}${c.info === 'INFO_NEW' ? ' · new' : ''}`;
      case 'detection_report': {
        const rb = c.range_bearing;
        const where = rb ? `az ${rb.azimuth.toFixed(1)}°${rb.range != null ? ` r ${Math.round(rb.range)} m` : ''}` : 'location';
        return `obj ${c.object_id.slice(-5)} · ${where} · conf ${c.detection_confidence}`;
      }
      case 'task': return `${c.task_name}: ${c.control.replace('CONTROL_', '')}`;
      case 'task_ack': return `${c.task_status.replace('TASK_STATUS_', '')}${c.reason ? ' — ' + c.reason.join('; ') : ''}`;
      case 'alert': return `${c.alert_type.replace('ALERT_TYPE_', '')}: ${c.description}`;
      case 'alert_ack': return c.alert_ack_status.replace('ALERT_ACK_STATUS_', '');
      case 'error': return c.error_message.join('; ');
      default: return '';
    }
  }
  const matches = (e) => !off.has(e.type) && (nodeFilter === 'all' || e.from === nodeFilter || e.to === nodeFilter);

  let lastRendered = -1, nodeCount = -1;
  function renderMessages(force) {
    for (const [t] of TYPES) $('#cnt-' + t).textContent = bus.counts[t] || 0;
    if (nodeCount !== net.nodes.size) {
      nodeCount = net.nodes.size;
      const sel = $('#node-filter');
      sel.innerHTML = '<option value="all">All nodes</option>' + [...net.nodes.values(), net.gui].map((n) => `<option value="${n.nodeId}">${esc(n.name)}</option>`).join('');
      sel.value = nodeFilter;
    }
    if (frozen && !force) return;
    if (!force && bus.seq === lastRendered) return;
    lastRendered = bus.seq;
    const rows = [];
    for (let i = bus.entries.length - 1; i >= 0 && rows.length < MAX_ROWS; i--) if (matches(bus.entries[i])) rows.push(bus.entries[i]);
    rows.reverse();
    const list = $('#msg-list');
    const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 30;
    list.innerHTML = rows.map((e) =>
      `<div class="row t-${e.type}${selected && selected.seq === e.seq ? ' sel' : ''}" data-seq="${e.seq}">` +
      `<span class="tm">${e.t.toFixed(1)}s</span><span class="ft">${esc(net.nameOf(e.from))} → ${esc(net.nameOf(e.to))}</span>` +
      `<span class="ty">${e.type}</span><span class="sm">${esc(summary(e))}</span></div>`).join('');
    if (stick) list.scrollTop = list.scrollHeight;
  }
  $('#msg-list').addEventListener('click', (ev) => {
    const row = ev.target.closest('.row');
    if (!row) return;
    const seq = Number(row.dataset.seq);
    selected = bus.entries.find((e) => e.seq === seq) || null;
    if (selected) {
      $('#msg-detail').textContent = JSON.stringify(selected.msg, null, 2);
      $('#msg-list').querySelectorAll('.row.sel').forEach((r) => r.classList.remove('sel'));
      row.classList.add('sel');
    }
  });

  // ---------- nodes ----------
  function renderNodes() {
    const rows = [...net.nodes.values()].map((n) => {
      const def = n.def;
      const east = Math.round(n.pos.x * mpu()), north = Math.round(-n.pos.z * mpu());
      const task = n.task ? n.task.drone.track ? n.task.drone.track.short : 'task' : '';
      return `<tr><td><i style="background:${hex(def.color)}"></i>${esc(n.short)}</td><td>${esc(def.sapient.nodeType.replace('NODE_TYPE_', ''))}</td>` +
        `<td>${esc(n.mode)}</td><td>${esc(task)}</td><td>${def.range ? def.range + ' m' : ''}</td><td>${east}, ${north}</td>` +
        `<td>${bus.tx.get(n.nodeId) || 0}</td><td>${bus.rx.get(n.nodeId) || 0}</td></tr>`;
    }).join('');
    $('#node-table').innerHTML = '<tr><th>Node</th><th>SAPIENT type</th><th>Mode</th><th>Task</th><th>Range</th><th>E, N (m)</th><th>Tx</th><th>Rx</th></tr>' + rows;
  }

  // ---------- plan ----------
  const cv = $('#plan');
  const g = cv.getContext('2d');
  let viewR = 5000;
  const lastTx = new Map();
  bus.listeners.add((e) => { lastTx.set(e.from, performance.now()); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); viewR = Math.min(14000, Math.max(800, viewR * (e.deltaY > 0 ? 1.15 : 1 / 1.15))); }, { passive: false });

  // coverage: for each cell, how many sensors would see a drone of the chosen type there (it flies at that type's usual height)
  const covThreat = $('#cov-threat');
  covThreat.innerHTML = Object.values(DRONES).map((d) => {
    const agl = Math.round((d.alt[0] + d.alt[1]) / 2);
    return `<option value="${d.id}">${d.name} (${d.rfEmitter ? 'RF emitter' : 'RF-silent'}, ${agl} m)</option>`;
  }).join('');
  let covCache = { key: '', n: 0, cell: 250, half: 6000, counts: null };
  function coverageGrid() {
    const def = DRONES[covThreat.value];
    const agl = (def.alt[0] + def.alt[1]) / 2;
    const key = covThreat.value + '|' + [...net.nodes.values()].map((n) => `${n.nodeId}:${n.def.range}`).join(',');
    if (covCache.key === key) return covCache;
    const cell = 250, half = Math.min(terrainState.data.R - 200, 6000), n = Math.round((2 * half) / cell);
    const counts = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) counts[j * n + i] = net.coverageAt(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell, agl, def.rfEmitter);
    covCache = { key, n, cell, half, counts };
    return covCache;
  }

  function renderPlan() {
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const k = Math.min(w, h) / 2 / viewR;
    const X = (e) => w / 2 + e * k, Y = (n) => h / 2 - n * k;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#0b1424'; g.fillRect(0, 0, w, h);
    const Rt = terrainState.data ? terrainState.data.R : 0;
    if (terrainState.hillshade) { // shaded relief, north up
      g.imageSmoothingEnabled = true;
      g.drawImage(terrainState.hillshade, X(-Rt), Y(Rt), 2 * Rt * k, 2 * Rt * k);
    }
    if ($('#cov-on').checked) {
      const c = coverageGrid();
      for (let j = 0; j < c.n; j++) for (let i = 0; i < c.n; i++) {
        const cnt = c.counts[j * c.n + i];
        g.fillStyle = cnt === 0 ? 'rgba(229,57,53,0.22)' : cnt === 1 ? 'rgba(102,187,106,0.30)' : cnt === 2 ? 'rgba(129,212,250,0.42)' : 'rgba(255,255,255,0.55)';
        // z is south, so the cell at scene z maps to plan y = -north
        g.fillRect(X(-c.half + i * c.cell), Y(c.half - j * c.cell), c.cell * k + 1, c.cell * k + 1);
      }
      $('#cov-legend').textContent = 'red: unseen · green: 1 sensor · blue: 2 · white: 3+';
    } else $('#cov-legend').textContent = '';
    g.lineWidth = 1; g.font = '10px system-ui'; g.fillStyle = '#5f7391'; g.strokeStyle = '#1c2b46';
    for (let r = 1000; r <= viewR * 1.5; r += 1000) {
      g.beginPath(); g.arc(w / 2, h / 2, r * k, 0, Math.PI * 2); g.stroke();
      g.fillText(r / 1000 + ' km', w / 2 + r * k + 2, h / 2 - 2);
    }
    g.setLineDash([4, 4]); g.strokeStyle = '#3a527e';
    g.beginPath(); g.arc(w / 2, h / 2, BUILD.maxDist * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);

    const nodes = [...net.nodes.values()].filter((n) => n.def.role === 'sensor' || n.def.role === 'effector');
    for (const n of nodes) { // coverage
      const col = hex(n.def.color), r = (n.def.range || 0) * k;
      if (n.def.id === 'perimeter') continue;
      if (n.def.role === 'sensor') { g.fillStyle = col + '14'; g.beginPath(); g.arc(X(n.pos.x * mpu()), Y(-n.pos.z * mpu()), r, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = col + (n.def.role === 'sensor' ? '88' : '66'); g.setLineDash(n.def.role === 'sensor' ? [] : [6, 4]);
      g.beginPath(); g.arc(X(n.pos.x * mpu()), Y(-n.pos.z * mpu()), r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    }
    const now = performance.now();
    for (const n of nodes) { // links to fusion
      if (n.def.id === 'perimeter') continue;
      const live = now - (lastTx.get(n.nodeId) || 0) < 300;
      g.strokeStyle = live ? '#ffffffcc' : '#ffffff22'; g.lineWidth = live ? 1.5 : 1;
      g.beginPath(); g.moveTo(X(n.pos.x * mpu()), Y(-n.pos.z * mpu())); g.lineTo(w / 2, h / 2); g.stroke();
    }
    g.lineWidth = 1;
    g.fillStyle = '#ff5252'; g.beginPath(); g.arc(w / 2, h / 2, Math.max(SITE.radius * k, 5), 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.fillText('FUSION / SITE', w / 2 + 8, h / 2 + 14);
    for (const n of nodes) { // nodes
      if (n.def.id === 'perimeter') continue;
      const x = X(n.pos.x * mpu()), y = Y(-n.pos.z * mpu());
      g.fillStyle = hex(n.def.color);
      if (n.def.role === 'sensor') { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); } else g.fillRect(x - 5, y - 5, 10, 10);
      g.fillStyle = '#dbe4f0'; g.fillText(n.short + (n.def.id === 'jammer' && n.mode === 'Jam' ? ' [JAM]' : ''), x + 8, y + 3);
      if (n.task && !n.task.drone.dead) { // engagement line
        const d = n.task.drone;
        g.strokeStyle = '#ff5252'; g.beginPath(); g.moveTo(x, y); g.lineTo(X(d.pos.x * mpu()), Y(-d.pos.z * mpu())); g.stroke();
      }
    }
    if (view.truth) { // truth: drones no sensor has, in grey
      g.fillStyle = '#8a94a3';
      for (const d of drones) {
        if (d.detected) continue;
        g.beginPath(); g.arc(X(d.pos.x * mpu()), Y(-d.pos.z * mpu()), 3, 0, Math.PI * 2); g.fill();
      }
    }
    for (const tr of net.tracks.values()) { // fused tracks, drawn where the fusion node believes they are
      const cls = tr.airframe && tr.airframe !== 'Unknown' ? tr.airframe : 'UAV';
      if (!tr.est) { // bearing only: show the ray from the sensor
        const v = [...tr.sources.values()].find((s) => s.from && s.rb);
        if (!v) continue;
        const az = (v.rb.azimuth * Math.PI) / 180, len = 3500;
        g.strokeStyle = hex(v.color) + 'aa'; g.beginPath();
        g.moveTo(X(v.from.east), Y(v.from.north)); g.lineTo(X(v.from.east + len * Math.sin(az)), Y(v.from.north + len * Math.cos(az))); g.stroke();
        g.fillStyle = '#ffcc66'; g.fillText(`${tr.short} · bearing only`, X(v.from.east + 0.5 * len * Math.sin(az)) + 4, Y(v.from.north + 0.5 * len * Math.cos(az)));
        continue;
      }
      const x = X(tr.est.east), y = Y(tr.est.north);
      if (tr.estErr) { g.strokeStyle = '#ffcc6688'; g.beginPath(); g.arc(x, y, Math.max(tr.estErr * k, 3), 0, Math.PI * 2); g.stroke(); }
      if (view.truth) { // line from belief to truth
        g.strokeStyle = '#8a94a3'; g.beginPath(); g.moveTo(x, y); g.lineTo(X(tr.drone.pos.x * mpu()), Y(-tr.drone.pos.z * mpu())); g.stroke();
      }
      g.strokeStyle = '#ffcc66'; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke();
      g.fillStyle = '#ffcc66'; g.fillText(`${tr.short} · ${cls}`, x + 7, y + 3);
    }
  }

  // ---------- systems reference ----------
  const sysRows = Object.values(STRUCTURES).map((d) => {
    const r = d.ref;
    const links = r.sources.length ? r.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join(' · ') : '<i>none found</i>';
    return `<div class="sys"><div class="sys-h"><i style="background:${hex(d.color)}"></i><b>${esc(d.name)}</b> <span class="muted">$${d.cost} · game range ${d.range} m · ${esc(d.sapient.nodeType.replace('NODE_TYPE_', ''))}</span></div>` +
      `<div><span class="k">Real class</span> ${esc(r.class)}</div>` +
      `<div><span class="k">Modelled on</span> ${esc(r.analogues.join(', '))}</div>` +
      `<div><span class="k">Published</span> ${esc(r.published)}</div>` +
      `<div><span class="k">Game basis</span> ${esc(r.basis)}</div>` +
      `<div><span class="k">Confidence</span> <span class="conf ${/ASSUMPTION/.test(r.confidence) ? 'assume' : ''}">${esc(r.confidence)}</span></div>` +
      `<div><span class="k">Sources</span> ${links}</div></div>`;
  }).join('');
  $('#systems').innerHTML = `<div class="sys note">Ranges are taken from public sources and are mostly vendor claims; check them before relying on them. Anything marked ASSUMPTION had no verified figure. Message formats follow <a href="https://github.com/dstl/SAPIENT-Proto-Files" target="_blank" rel="noopener noreferrer">BSI Flex 335 v2.0</a> (<a href="https://www.gov.uk/government/publications/sapient-interface-control-document" target="_blank" rel="noopener noreferrer">ICD</a>). Delivery here is instant and association is perfect, so this shows the laydown and message flow, not network behaviour.</div>` + sysRows;

  // ---------- refresh ----------
  function render() {
    if (dock.classList.contains('hidden')) return;
    if (activeTab === 'messages') renderMessages(false);
    else if (activeTab === 'nodes') renderNodes();
    else if (activeTab === 'plan') renderPlan();
  }
  setInterval(render, 200);
  return { toggle };
}
