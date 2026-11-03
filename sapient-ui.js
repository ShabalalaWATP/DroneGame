// The SAPIENT dock: message log + JSON inspector, node table, plan view of the laydown, and the
// real-world reference for each purchasable system.

import { bus } from './sapient.js';
import {
  STRUCTURES, DRONES, WORLD, BUILD, SITE, ECONOMY, WAVES, FIGURE_FIELDS, RESEARCHED,
  setFigure, resetFigure, resetAllFigures, exportFigures, importFigures, applyRangeScale,
} from './config.js';
import { view } from './view.js';
import { terrainState } from './terrain.js';

const TYPES = [
  ['registration', 'Reg'], ['registration_ack', 'RegAck'], ['status_report', 'Status'], ['detection_report', 'Detect'],
  ['task', 'Task'], ['task_ack', 'TaskAck'], ['alert', 'Alert'], ['alert_ack', 'AlertAck'], ['error', 'Error'],
];
const MAX_ROWS = 150;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');

export function initDock({ net, drones, ledger, state, onFiguresChanged }) {
  const dock = document.getElementById('dock');
  dock.innerHTML = `
    <div class="dock-head">
      <div class="tabs">
        <button data-tab="messages" class="active">Messages</button>
        <button data-tab="nodes">Nodes</button>
        <button data-tab="plan">Plan</button>
        <button data-tab="cost">Cost</button>
        <button data-tab="systems">Sources</button>
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
      <div class="plan-note">North up, scroll to zoom. Circles are each node's range, lines are links to the fusion node (bright when a message has just been sent), red lines are active engagement tasks, crosses are fused tracks drawn where the fusion node believes they are (gold = confirmed, orange = coasting, grey = tentative; circle = position error), faint lines are bearings no track has claimed, wedges show where cameras are pointing, grey dots are drones nobody has (truth overlay).</div>
    </div>
    <div class="tabpane hidden" data-pane="cost" id="cost"></div>
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
  // while rewinding, the log shows only what had been sent up to the moment being reviewed
  const matches = (e) => !off.has(e.type) && (view.replayT == null || e.t <= view.replayT) && (nodeFilter === 'all' || e.from === nodeFilter || e.to === nodeFilter);

  let lastRendered = -1, nodeCount = -1, lastReplayT = null;
  function renderMessages(force) {
    for (const [t] of TYPES) $('#cnt-' + t).textContent = bus.counts[t] || 0;
    if (nodeCount !== net.nodes.size) {
      nodeCount = net.nodes.size;
      const sel = $('#node-filter');
      sel.innerHTML = '<option value="all">All nodes</option>' + [...net.nodes.values(), net.gui].map((n) => `<option value="${n.nodeId}">${esc(n.name)}</option>`).join('');
      sel.value = nodeFilter;
    }
    if (frozen && !force) return;
    if (!force && bus.seq === lastRendered && view.replayT === lastReplayT) return;
    lastRendered = bus.seq; lastReplayT = view.replayT;
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
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) counts[j * n + i] = net.coverageAt(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell, agl, def);
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
      if (n.def.fov && n.point) { // camera: its current view
        const a = (n.point.az * Math.PI) / 180, half = (n.def.fov / 2 * Math.PI) / 180, len = n.def.range;
        g.fillStyle = hex(n.def.color) + '33'; g.beginPath(); g.moveTo(x, y);
        g.lineTo(X(n.pos.x * mpu() + len * Math.sin(a - half)), Y(-n.pos.z * mpu() + len * Math.cos(a - half)));
        g.lineTo(X(n.pos.x * mpu() + len * Math.sin(a + half)), Y(-n.pos.z * mpu() + len * Math.cos(a + half))); g.closePath(); g.fill();
      }
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
    for (const c of net.bearingCandidates()) { // bearings no track has claimed: rays from the sensor
      g.strokeStyle = hex(c.color) + '99'; g.beginPath();
      g.moveTo(X(c.from[0]), Y(c.from[1])); g.lineTo(X(c.from[0] + 3500 * Math.sin(c.az)), Y(c.from[1] + 3500 * Math.cos(c.az))); g.stroke();
    }
    const TR_COL = { tentative: '#8a94a3', confirmed: '#ffcc66', coasting: '#ff9800' };
    for (const tr of net.tracks.values()) { // fused tracks, drawn where the fusion node believes they are
      if (!tr.est) continue;
      const col = TR_COL[tr.status] || '#ffcc66';
      const x = X(tr.est.east), y = Y(tr.est.north);
      if (tr.estErr) { g.strokeStyle = col + '88'; g.beginPath(); g.arc(x, y, Math.max(tr.estErr * k, 3), 0, Math.PI * 2); g.stroke(); }
      if (view.truth && tr.drone) { // line from belief to truth
        g.strokeStyle = '#8a94a3'; g.beginPath(); g.moveTo(x, y); g.lineTo(X(tr.drone.pos.x * mpu()), Y(-tr.drone.pos.z * mpu())); g.stroke();
      }
      g.strokeStyle = col; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke();
      if (tr.status !== 'tentative') {
        const cls = tr.airframe && tr.airframe !== 'Unknown' ? tr.airframe : 'UAV';
        g.fillStyle = col; g.fillText(`${tr.short} · ${cls}`, x + 7, y + 3);
      }
    }
  }

  // ---------- cost ----------
  const linkList = (sources) => sources && sources.length ? sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)}</a>`).join(' · ') : '<i>none found</i>';
  const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
  const attackCost = (counts) => Object.entries(counts).reduce((t, [type, n]) => t + n * DRONES[type].cost, 0);

  function renderCost() {
    const spentCapex = ledger.capex, spentShots = ledger.consumables, left = state.budget;
    const pct = (v) => (100 * v / ECONOMY.budget).toFixed(1) + '%';
    const launched = attackCost(ledger.launched), destroyed = attackCost(ledger.killed);
    const defenceSpend = spentCapex + spentShots;

    // laydown by system
    const owned = {};
    for (const s of net.nodes.values()) if (s.def.role === 'sensor' || s.def.role === 'effector') if (s.def.id !== 'perimeter') owned[s.def.id] = (owned[s.def.id] || 0) + 1;
    const laydownRows = Object.entries(owned).map(([id, n]) => `<tr><td>${esc(STRUCTURES[id].name)}</td><td>${n}</td><td>${usd(STRUCTURES[id].cost)}</td><td>${usd(n * STRUCTURES[id].cost)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing placed yet</td></tr>';

    // consumables by effector
    const effRows = Object.values(STRUCTURES).filter((d) => d.shotCost > 0).map((d) => {
      const shots = ledger.shots[d.id] || { n: 0, cost: 0 };
      const kills = sum(ledger.killedBy[d.id] || {});
      return `<tr><td>${esc(d.name)}</td><td>${usd(d.shotCost)}</td><td>${shots.n}</td><td>${usd(shots.cost)}</td><td>${kills}</td><td>${kills ? usd(shots.cost / kills) : '–'}</td></tr>`;
    }).join('');
    const jamKills = sum(ledger.killedBy.jammer || {});

    // enemy by type
    const enemyRows = Object.values(DRONES).map((d) => {
      const l = ledger.launched[d.id] || 0, k = ledger.killed[d.id] || 0, x = ledger.leaked[d.id] || 0, e = ledger.escaped[d.id] || 0;
      return `<tr><td><i style="background:${hex(d.color)}"></i>${esc(d.name)}</td><td>${usd(d.cost)}</td><td>${l}</td><td>${k}</td><td>${x}</td><td>${e}</td><td>${usd(l * d.cost)}</td></tr>`;
    }).join('');

    const ratio = destroyed ? (spentShots / destroyed) : null;
    $('#cost').innerHTML =
      `<div class="sys"><div class="sys-h"><b>Budget</b> <span class="muted">${usd(ECONOMY.budget)} for the whole run</span></div>` +
      `<div class="budget-bar"><span class="b-capex" style="width:${pct(spentCapex)}"></span><span class="b-shots" style="width:${pct(spentShots)}"></span></div>` +
      `<div class="muted">Systems ${usd(spentCapex)} (${pct(spentCapex)}) · shots fired ${usd(spentShots)} (${pct(spentShots)}) · <b>left ${usd(left)}</b></div></div>` +
      `<div class="sys"><div class="sys-h"><b>Cost exchange</b></div>` +
      `<div><span class="k">Enemy attack</span> ${usd(launched)} launched, ${usd(destroyed)} of it destroyed</div>` +
      `<div><span class="k">Defence</span> ${usd(defenceSpend)} (${usd(spentCapex)} systems + ${usd(spentShots)} shots)</div>` +
      `<div><span class="k">Per $1 destroyed</span> ${ratio === null ? '–' : '$' + ratio.toFixed(2) + ' of shots'}${destroyed ? ` · $${(defenceSpend / destroyed).toFixed(2)} including systems` : ''}</div>` +
      `<div class="muted">Under 1.00 means each dollar of shots destroys more than a dollar of enemy hardware. Jammers cost nothing per use; ${jamKills} kills so far came from jamming.</div></div>` +
      `<div class="sys"><div class="sys-h"><b>Laydown</b></div><table class="mini"><tr><th>System</th><th>Count</th><th>Each</th><th>Total</th></tr>${laydownRows}</table></div>` +
      `<div class="sys"><div class="sys-h"><b>Shots fired</b></div><table class="mini"><tr><th>Effector</th><th>Per shot</th><th>Shots</th><th>Spent</th><th>Kills</th><th>Per kill</th></tr>${effRows}</table></div>` +
      `<div class="sys"><div class="sys-h"><b>Enemy attack</b> <span class="muted">cost to the attacker per drone</span></div><table class="mini"><tr><th>Drone</th><th>Each</th><th>Launched</th><th>Destroyed</th><th>Leaked</th><th>Left</th><th>Attack cost</th></tr>${enemyRows}</table>` +
      `<div class="muted">Leaked = reached the site. Left = a spotter that withdrew after its time on station.</div></div>` +
      `<div class="sys"><div class="sys-h"><b>Where the enemy costs come from</b></div>` +
      Object.values(DRONES).map((d) => `<div class="cost-src"><b>${esc(d.name)}</b> ${usd(d.cost)}: ${esc(d.costRef.note)} <span class="conf">${esc(d.costRef.confidence)}</span><br>${linkList(d.costRef.sources)}</div>`).join('') + `</div>`;
  }

  // ---------- sources: every researched figure, tuneable ----------
  // Each system and each enemy drone shows the figures that came from research (or are labelled assumptions or game rules),
  // with the evidence beside them. Editing a number changes the game straight away; the arrow resets it to the researched
  // value. "Export" saves just your changes as JSON so an experiment can be repeated.
  const confTag = (text) => /ASSUMPTION/i.test(text || '') ? 'assumption' : null;
  function basisOf(kind, def, key) {
    const meta = FIGURE_FIELDS[key];
    if (kind === 'structures') {
      if (key === 'published') return confTag(def.ref.confidence) || 'research';
      if (key === 'cost' || key === 'shotCost') return confTag(def.ref.cost.confidence) || 'price';
      if (key === 'missileSpeed') return 'research';
    } else if (key === 'cost') return confTag(def.costRef.confidence) || 'price';
    return meta.basis;
  }
  const BASIS_LABEL = { research: 'published', price: 'price', assumption: 'ASSUMPTION', rule: 'game rule' };

  function figureRows(kind, id, def) {
    return Object.keys(RESEARCHED[kind][id]).map((key) => {
      const meta = FIGURE_FIELDS[key];
      const basis = basisOf(kind, def, key);
      const base = RESEARCHED[kind][id][key];
      return `<label class="fig ${basis}"><span class="fl">${esc(meta.label)}</span>` +
        `<input type="number" data-kind="${kind}" data-id="${id}" data-key="${key}" value="${def[key]}" step="${meta.step}" min="0">` +
        `<span class="fu">${esc(meta.unit)}</span><span class="fb ${basis}">${BASIS_LABEL[basis]}</span>` +
        `<button class="fr${def[key] === base ? ' hidden' : ''}" data-reset="${kind}|${id}|${key}" title="Reset to ${base}">↺</button></label>`;
    }).join('');
  }

  function buildSources() {
    const structCards = Object.values(STRUCTURES).map((d) => {
      const r = d.ref;
      return `<div class="sys"><div class="sys-h"><i style="background:${hex(d.color)}"></i><b>${esc(d.name)}</b> <span class="muted">${esc(d.sapient.nodeType.replace('NODE_TYPE_', ''))} · game range ${d.range} m</span></div>` +
        `<div class="figs">${figureRows('structures', d.id, d)}</div>` +
        `<div><span class="k">Real class</span> ${esc(r.class)}</div>` +
        `<div><span class="k">Modelled on</span> ${esc(r.analogues.join(', '))}</div>` +
        `<div><span class="k">Published</span> ${esc(r.published)}</div>` +
        `<div><span class="k">Game basis</span> ${esc(r.basis)}</div>` +
        `<div><span class="k">Confidence</span> <span class="conf ${confTag(r.confidence) ? 'assume' : ''}">${esc(r.confidence)}</span></div>` +
        `<div><span class="k">Sources</span> ${linkList(r.sources)}</div>` +
        `<div><span class="k">Price</span> ${esc(r.cost.capex)} <span class="conf ${confTag(r.cost.confidence) ? 'assume' : ''}">${esc(r.cost.confidence)}</span></div>` +
        `<div><span class="k">Price sources</span> ${linkList(r.cost.sources)}</div></div>`;
    }).join('');
    const droneCards = Object.values(DRONES).map((d) =>
      `<div class="sys"><div class="sys-h"><i style="background:${hex(d.color)}"></i><b>${esc(d.name)}</b> <span class="muted">enemy drone · ${esc(d.airframe)}${d.rfEmitter ? ' · emits RF' : ' · RF-silent'}</span></div>` +
      `<div class="figs">${figureRows('drones', d.id, d)}</div>` +
      `<div><span class="k">Cost basis</span> ${esc(d.costRef.note)} <span class="conf ${confTag(d.costRef.confidence) ? 'assume' : ''}">${esc(d.costRef.confidence)}</span></div>` +
      `<div><span class="k">Sources</span> ${linkList(d.costRef.sources)}</div>` +
      `<div class="muted">Radar cross-section, size, link power and speed are rough class values I chose, not measurements. Tune them to test how sensitive a laydown is.</div></div>`).join('');
    $('#systems').innerHTML =
      `<div class="sys note">Every number here can be changed and takes effect at once. <b>published</b> and <b>price</b> figures come from the sources shown (mostly vendor claims; check them before relying on them), <b>ASSUMPTION</b> had no verified figure, <b>game rule</b> is a balance setting. Message formats follow <a href="https://github.com/dstl/SAPIENT-Proto-Files" target="_blank" rel="noopener noreferrer">BSI Flex 335 v2.0</a>.` +
      `<div class="src-tools"><label>Range scale <input type="number" id="src-rangescale" value="${WORLD.rangeScale}" step="0.1" min="0.1"> x published</label>` +
      `<label>FPV gap <input type="number" id="src-fpvgap" value="${WAVES.fpvGap}" step="1" min="1"> s</label>` +
      `<button id="src-reset">Reset all</button><button id="src-export">Export changes</button><button id="src-import">Import</button><input type="file" id="src-file" accept="application/json" hidden></div></div>` +
      `<h4 class="src-h">Defences</h4>` + structCards + `<h4 class="src-h">Enemy drones</h4>` + droneCards;
  }
  const changed = () => { if (onFiguresChanged) onFiguresChanged(); };
  $('#systems').addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'src-rangescale') { const v = Number(t.value); if (v > 0) { WORLD.rangeScale = v; applyRangeScale(); changed(); buildSources(); } return; }
    if (t.id === 'src-fpvgap') { const v = Number(t.value); if (v > 0) WAVES.fpvGap = v; return; }
    if (t.id === 'src-file') {
      const f = t.files[0]; if (!f) return;
      f.text().then((txt) => { try { importFigures(JSON.parse(txt)); changed(); buildSources(); } catch (err) { alert('That file is not a valid figures export.'); } });
      return;
    }
    if (!t.dataset.key) return;
    const v = Number(t.value);
    if (!Number.isFinite(v) || v < 0) { t.value = (t.dataset.kind === 'structures' ? STRUCTURES : DRONES)[t.dataset.id][t.dataset.key]; return; }
    setFigure(t.dataset.kind, t.dataset.id, t.dataset.key, v);
    changed();
    buildSources();
  });
  $('#systems').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.reset) { const [kind, id, key] = b.dataset.reset.split('|'); resetFigure(kind, id, key); changed(); buildSources(); }
    else if (b.id === 'src-reset') { resetAllFigures(); changed(); buildSources(); }
    else if (b.id === 'src-export') {
      const blob = new Blob([JSON.stringify(exportFigures(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'site-guard-figures.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (b.id === 'src-import') $('#src-file').click();
  });
  buildSources();

  // ---------- refresh ----------
  function render() {
    if (dock.classList.contains('hidden')) return;
    if (activeTab === 'messages') renderMessages(false);
    else if (activeTab === 'nodes') renderNodes();
    else if (activeTab === 'plan') renderPlan();
    else if (activeTab === 'cost') renderCost();
  }
  setInterval(render, 200);
  return { toggle };
}
