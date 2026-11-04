// The Network, Spectrum and Learn tabs of the dock.
//  - Network: a wire diagram of the laydown. Click a system to configure it, click Starlink or Cellular to wire it, click a
//    wire to tap it. Packets travel along the wires as pulses; a tapped wire lists its packets and you can open any one.
//  - Spectrum: who uses which frequencies, and where your jamming overlaps your own links.
//  - Learn: a guided tour of how SAPIENT messages flow, with real examples from this run, and "follow a track".

import { bus } from '../sim/sapient.js';
import { COMMS, SPECTRUM, STRUCTURES, DRONES, overlaps } from '../sim/config/index.js';
import { annotate } from './sapient-help.js';
import { view } from '../render/view.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
const TYPE_COLOUR = {
  detection_report: '#4fc3f7', status_report: '#8fa6cc', task: '#ffb74d', task_ack: '#ffe0b2', alert: '#ff5252',
  alert_ack: '#ff8a80', registration: '#81c784', registration_ack: '#c5e1a5', error: '#ff1744',
};
const NODE_W = 82, NODE_H = 26;
const ELEMENT_COLOUR = { starlink: '#b388ff', cellular: '#ffab40', internet: '#90a4ae' };

export function initNetworkUi({ dock, net, state, network, designLocked, money, stepOnce, pause, getActiveTab }) {
  const pane = (name) => dock.querySelector(`.tabpane[data-pane="${name}"]`);
  const comms = net.comms;

  // =====================================================================================================
  // Network tab
  // =====================================================================================================
  const np = pane('network');
  np.innerHTML = `
    <div class="net-tools">
      <button id="net-auto" class="primary" title="Connect every unwired system: cellular where a tower reaches well, otherwise Starlink">Auto-wire</button>
      <button id="net-clear">Clear wires</button>
      <button id="net-step" title="Run the simulation until the next packet is sent, then pause (on the selected wire, if one is selected)">Step to next packet</button>
      <label class="muted">Pulse speed <input type="range" id="net-pace" min="0.3" max="3" step="0.1" value="1.2"></label>
      <span id="net-cost" class="muted"></span>
    </div>
    <div class="net-main"><canvas id="net-canvas"></canvas><div id="net-side"><div id="net-static"></div><div id="net-live"></div></div></div>
    <div class="plan-note">Wires run from each system to Starlink or the cellular network; the fusion node needs its own terminals. Both ends must be up for a message to get through. Click a system, then click Starlink or Cellular to wire it. Click a wire to tap it and see its packets.</div>`;
  const cv = np.querySelector('#net-canvas'), g = cv.getContext('2d');
  const staticEl = np.querySelector('#net-static'), liveEl = np.querySelector('#net-live');
  let sel = null;              // { kind: 'node' | 'fusion' | 'wire', id }
  let boxes = [], wires = [];  // hit areas rebuilt each frame
  const pulses = [];
  let linkInfo = new Map(), linkT = 0, hover = null;
  const pace = () => Number(np.querySelector('#net-pace').value);

  const visible = () => getActiveTab() === 'network' && !dock.classList.contains('hidden');
  const nodeList = () => [...net.nodes.values()].filter((n) => (n.def.role === 'sensor' || n.def.role === 'effector') && n.def.id !== 'perimeter');
  const byId = (id) => net.nodes.get(id);

  // ---------- layout ----------
  function layout(W, H) {
    const els = {
      starlink: { id: 'starlink', x: W * 0.2 - 62, y: 18, w: 124, h: 34 },
      internet: { id: 'internet', x: W * 0.5 - 50, y: 18, w: 100, h: 34 },
      cellular: { id: 'cellular', x: W * 0.8 - 62, y: 18, w: 124, h: 34 },
    };
    const fusion = { id: 'fusion', x: W * 0.5 - 75, y: Math.max(112, H * 0.24), w: 150, h: 40 };
    const nodeY = Math.max(210, H * 0.5);
    const sensors = nodeList().filter((n) => n.def.role === 'sensor'), effectors = nodeList().filter((n) => n.def.role === 'effector');
    const place = (list, x0, x1, y0) => list.map((n, i) => {
      const cols = Math.max(1, Math.floor((x1 - x0) / (NODE_W + 8)));
      return { id: n.nodeId, node: n, x: x0 + (i % cols) * (NODE_W + 8), y: y0 + Math.floor(i / cols) * (NODE_H + 36), w: NODE_W, h: NODE_H };
    });
    return { els, fusion, nodes: [...place(sensors, 12, W / 2 - 10, nodeY), ...place(effectors, W / 2 + 10, W - 12, nodeY)] };
  }
  const top = (b) => ({ x: b.x + b.w / 2, y: b.y });
  const bottom = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h });
  function curve(a, b, n = 18) { // a vertical S-curve from a to b
    const pts = [], my = (a.y + b.y) / 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push({ x: u * u * u * a.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * b.y });
    }
    return pts;
  }
  const lineOf = (a, b) => [a, b];

  // ---------- drawing ----------
  const GOOD = '#66bb6a', WARN = '#ffb300', BAD = '#ef5350', IDLE = '#5c6b86';
  const linkColour = (info) => (!info ? IDLE : !info.up ? BAD : info.quality < 0.6 ? WARN : GOOD);

  function refreshLinks() {
    const now = performance.now();
    if (now - linkT < 500) return;
    linkT = now;
    linkInfo = new Map();
    for (const n of nodeList()) linkInfo.set(n.nodeId, n.uplink ? comms.nodeLink(n) : null);
    linkInfo.set('fusion', null);
  }

  function box(b, label, colour, opts = {}) {
    g.fillStyle = opts.fill || '#10192b'; g.strokeStyle = colour; g.lineWidth = opts.selected ? 3 : 1.5;
    g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 5); g.fill(); g.stroke();
    g.fillStyle = '#eef3fb'; g.font = '600 11px system-ui'; g.textAlign = 'center'; g.fillText(label, b.x + b.w / 2, b.y + (opts.sub ? b.h / 2 - 1 : b.h / 2 + 4));
    if (opts.sub) { g.fillStyle = '#9fb2cf'; g.font = '10px system-ui'; g.fillText(opts.sub, b.x + b.w / 2, b.y + b.h / 2 + 11); }
  }
  function wire(pts, colour, width, dashed) {
    g.strokeStyle = colour; g.lineWidth = width; g.setLineDash(dashed ? [5, 4] : []);
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); g.setLineDash([]);
  }

  function render() {
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    refreshLinks();
    const L = layout(W, H);
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0a1120'; g.fillRect(0, 0, W, H);
    boxes = []; wires = [];

    // the networks themselves
    wire(lineOf(bottom(L.els.starlink), top(L.els.internet)), '#3a4a6b', 3);
    wire(lineOf(bottom(L.els.cellular), top(L.els.internet)), '#3a4a6b', 3);
    wire(lineOf({ x: L.els.starlink.x + L.els.starlink.w, y: 35 }, { x: L.els.internet.x, y: 35 }), '#3a4a6b', 3);
    wire(lineOf({ x: L.els.internet.x + L.els.internet.w, y: 35 }, { x: L.els.cellular.x, y: 35 }), '#3a4a6b', 3);

    // the fusion node's terminals
    const fusionWires = {};
    for (const kind of ['starlink', 'cellular']) {
      if (!net.fusion.uplinks.has(kind)) continue;
      const info = comms.linkFor(net.fusion, kind, net.fusion.cellBand);
      const pts = curve(top(L.fusion), bottom(L.els[kind]));
      fusionWires[kind] = pts;
      wire(pts, linkColour(info), 3);
      wires.push({ id: 'fusion:' + kind, pts, fusion: kind });
    }

    // each system's wire
    const nodeBoxes = new Map();
    for (const nb of L.nodes) {
      nodeBoxes.set(nb.id, nb);
      const n = nb.node, info = linkInfo.get(n.nodeId);
      if (n.uplink) {
        const pts = curve(top(nb), bottom(L.els[n.uplink]));
        const selected = sel && sel.kind === 'wire' && sel.id === n.nodeId;
        wire(pts, linkColour(info), selected ? 4 : Math.max(1.5, 1 + (info ? info.quality * 1.5 : 0)), false);
        wires.push({ id: n.nodeId, pts, node: n });
        nb.pts = pts;
      }
    }

    // boxes on top of the wires
    for (const [k, b] of Object.entries(L.els)) {
      const used = k === 'internet' ? '' : `${nodeList().filter((n) => n.uplink === k).length} systems`;
      box(b, k === 'starlink' ? 'Starlink' : k === 'cellular' ? 'Cellular' : 'Internet', ELEMENT_COLOUR[k], { sub: used, selected: hover === k });
      boxes.push({ ...b, kind: 'element', id: k });
    }
    const fusionInfo = comms.fusionLink('starlink');
    box(L.fusion, 'Fusion node', fusionInfo.up ? GOOD : BAD, { selected: sel && sel.kind === 'fusion', sub: [...net.fusion.uplinks].map((k) => (k === 'starlink' ? 'Starlink' : 'Cellular')).join(' + ') || 'no terminal' });
    boxes.push({ ...L.fusion, kind: 'fusion', id: 'fusion' });
    for (const nb of L.nodes) {
      const n = nb.node, info = linkInfo.get(n.nodeId);
      const selected = sel && (sel.kind === 'node' || sel.kind === 'wire') && sel.id === n.nodeId;
      box(nb, n.short, hex(n.def.color), { selected, sub: n.offline ? 'LOST CONTACT' : n.uplink ? (info && !info.up ? 'link down' : n.mode) : 'no link', fill: n.offline || !n.uplink ? '#2a1620' : '#10192b' });
      boxes.push({ ...nb, kind: 'node', id: n.nodeId });
      if (!n.uplink) { g.fillStyle = BAD; g.beginPath(); g.arc(nb.x + nb.w - 6, nb.y + 6, 3, 0, 7); g.fill(); }
    }

    // pulses: one per packet, travelling node <-> fusion along the wires
    const now = performance.now();
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i], f = (now - p.t0) / p.dur;
      if (f >= 1 + (p.drop ? 0.4 : 0)) { pulses.splice(i, 1); continue; }
      const along = Math.min(f, p.drop ? 0.55 : 1);
      const pt = pointAlong(p.path, p.fwd ? along : 1 - along);
      if (!pt) continue;
      g.fillStyle = p.colour; g.globalAlpha = p.drop && f > 0.55 ? Math.max(0, 1 - (f - 0.55) / 0.45) : 1;
      g.beginPath(); g.arc(pt.x, pt.y, p.size, 0, 7); g.fill();
      if (p.drop && f >= 0.55) { g.strokeStyle = BAD; g.lineWidth = 2; g.beginPath(); g.moveTo(pt.x - 6, pt.y - 6); g.lineTo(pt.x + 6, pt.y + 6); g.moveTo(pt.x + 6, pt.y - 6); g.lineTo(pt.x - 6, pt.y + 6); g.stroke(); }
      g.globalAlpha = 1;
    }
    nodeBoxesCache = { L, nodeBoxes, fusionWires };
  }
  let nodeBoxesCache = null;

  function pointAlong(pts, f) {
    if (pts.length < 2) return null;
    let total = 0; const segs = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); segs.push(l); total += l; }
    let d = f * total;
    for (let i = 0; i < segs.length; i++) {
      if (d <= segs[i]) { const t = segs[i] ? d / segs[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
      d -= segs[i];
    }
    return pts[pts.length - 1];
  }

  // a packet becomes a pulse along: node -> its network -> (internet) -> fusion's network -> fusion
  function addPulse(pkt) {
    if (!visible() || !nodeBoxesCache || pulses.length > 220 || (pulses.length > 120 && Math.random() < 0.6)) return;
    const { L, nodeBoxes, fusionWires } = nodeBoxesCache;
    const nb = nodeBoxes.get(pkt.nodeId);
    if (!nb || !nb.pts) return;
    const node = nb.node;
    let path = [...nb.pts]; // node -> its network element
    const fk = pkt.hops && pkt.hops.length ? pkt.hops[pkt.hops.length - 1] : node.uplink;
    if (pkt.hops && pkt.hops.includes('internet')) {
      path.push(...lineOf(bottom(L.els[node.uplink]), top(L.els.internet)));
      path.push(...lineOf(top(L.els.internet), bottom(L.els[fk])));
    }
    const fw = fusionWires[fk];
    if (fw) path.push(...[...fw].reverse());
    const fwd = pkt.toFusion;
    g.font = '10px system-ui';
    pulses.push({ path, fwd, colour: TYPE_COLOUR[pkt.type] || '#fff', size: 2.5 + Math.min(3, pkt.bytes / 200), t0: performance.now(), dur: (pace() * 1000), drop: pkt.dropped });
  }
  comms.listeners.add(addPulse);

  // ---------- interaction ----------
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const inBox = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function nearWire(p) {
    let best = null, bd = 7;
    for (const w of wires) for (const q of w.pts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = w; } }
    return best;
  }
  cv.addEventListener('mousemove', (e) => {
    const p = pos(e), b = boxes.find((x) => inBox(x, p));
    hover = b && b.kind === 'element' ? b.id : null;
    cv.style.cursor = b || nearWire(p) ? 'pointer' : 'default';
  });
  cv.addEventListener('click', (e) => {
    const p = pos(e);
    const b = boxes.slice().reverse().find((x) => inBox(x, p));
    if (b && b.kind === 'element' && b.id !== 'internet') { // wire the selected system (or the fusion node) to this network
      if (sel && sel.kind === 'fusion') { network.wireFusion(b.id, !net.fusion.uplinks.has(b.id)); }
      else if (sel && (sel.kind === 'node' || sel.kind === 'wire')) { const n = byId(sel.id); if (n) network.wireNode(n, n.uplink === b.id ? null : b.id); }
      else toast('Select a system first, then click Starlink or Cellular to wire it');
    } else if (b && b.kind === 'node') sel = { kind: 'node', id: b.id };
    else if (b && b.kind === 'fusion') sel = { kind: 'fusion', id: 'fusion' };
    else { const w = nearWire(p); sel = w && w.node ? { kind: 'wire', id: w.node.nodeId } : w ? { kind: 'fusion', id: 'fusion' } : null; }
    renderSide(true);
  });
  const toast = (m) => { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); };

  np.querySelector('#net-auto').onclick = () => { network.autoWire(); renderSide(true); };
  np.querySelector('#net-clear').onclick = () => { network.clearAll(); renderSide(true); };
  np.querySelector('#net-step').onclick = () => { // run to the next packet (on the selected wire if there is one), then pause
    const id = sel && sel.kind !== 'fusion' ? sel.id : null;
    const before = comms.packets.length ? comms.packets[comms.packets.length - 1].n : 0;
    pause();
    for (let i = 0; i < 2000; i++) {
      stepOnce();
      const last = comms.packets.length ? comms.packets[comms.packets.length - 1] : null;
      if (last && last.n > before && (!id || last.nodeId === id)) break;
    }
    renderSide(false);
  };

  // ---------- the side panel: configuration (static) and stats + packets (live) ----------
  let selPacket = null;
  function renderSide(rebuild) {
    const locked = designLocked();
    const n = sel && sel.kind !== 'fusion' ? byId(sel.id) : null;
    if (rebuild) {
      if (!sel || (sel.kind !== 'fusion' && !n)) {
        staticEl.innerHTML = `<h4>Network design</h4><p class="muted">Click a system to configure it, or a wire to tap it.</p>` +
          `<p class="muted">Terminals: Starlink ${usd(COMMS.starlink.cost)} each, cellular ${usd(COMMS.cellular.cost)} each. ${locked ? 'The network is locked: the first wave has started.' : 'You can rewire until the first wave starts.'}</p>`;
      } else if (sel.kind === 'fusion') {
        staticEl.innerHTML = `<h4>Fusion node</h4><p class="muted">Every message passes through it, so it is the weak point. Give it more than one way in.</p>` +
          ['starlink', 'cellular'].map((k) => `<label class="opt"><input type="checkbox" data-fus="${k}" ${net.fusion.uplinks.has(k) ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${COMMS[k].name} terminal <span class="muted">${usd(COMMS[k].cost)}</span></label>`).join('') +
          `<label class="opt">Cellular band <select data-fusband ${locked ? 'disabled' : ''}>${Object.entries(COMMS.cellular.bands).map(([id, b]) => `<option value="${id}" ${net.fusion.cellBand === id ? 'selected' : ''}>${b.label}</option>`).join('')}</select></label>`;
      } else {
        const def = n.def;
        staticEl.innerHTML = `<h4 style="border-left:4px solid ${hex(def.color)};padding-left:6px">${esc(n.name)}</h4><div class="muted">${esc(def.sapient.nodeType.replace('NODE_TYPE_', ''))} · ${esc(n.mode)}</div>` +
          `<div class="opt-h">Network terminal</div>` +
          [['', 'None'], ['starlink', `Starlink ${usd(COMMS.starlink.cost)}`], ['cellular', `Cellular ${usd(COMMS.cellular.cost)}`]].map(([k, l]) =>
            `<label class="opt"><input type="radio" name="uplink" value="${k}" ${(n.uplink || '') === k ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${l}</label>`).join('') +
          `<label class="opt">Cellular band <select data-band ${locked ? 'disabled' : ''}>${Object.entries(COMMS.cellular.bands).map(([id, b]) => `<option value="${id}" ${n.cellBand === id ? 'selected' : ''}>${b.label}</option>`).join('')}</select></label>` +
          (n.jamBands ? `<div class="opt-h">Jamming bands</div>` + Object.entries(SPECTRUM.bands).map(([id, b]) =>
            `<label class="opt"><input type="checkbox" data-jam="${id}" ${n.jamBands.has(id) ? 'checked' : ''}> ${b.label}</label>`).join('') +
            `<div class="muted">Jamming 868/915 MHz also hits Band 8 cellular links nearby. See the Spectrum tab.</div>` : '');
      }
    }
    // live part: link stats and packets for the selected system
    if (n) {
      const st = comms.linkStats(n.nodeId), info = n.uplink ? comms.nodeLink(n) : null, path = n.uplink ? comms.pathFor(n) : null;
      const pk = comms.packets.filter((p) => p.nodeId === n.nodeId).slice(-40).reverse();
      liveEl.innerHTML = `<div class="opt-h">Link</div><div class="lstats">` +
        (n.uplink ? `<div>Status <b style="color:${linkColour(info)}">${info && info.up ? (info.quality < 0.6 ? 'degraded' : 'up') : 'DOWN'}</b>${info && !info.up ? ` <span class="muted">${esc(info.reason)}</span>` : ''}</div>` +
          `<div>Via <b>${esc(info ? info.via || '' : '')}</b></div>` +
          (path && path.ok ? `<div>Latency <b>${Math.round(path.latency * 1000)} ms</b> · loss <b>${(path.loss * 100).toFixed(1)}%</b></div><div>Capacity <b>${(info.capacity / 1e6).toFixed(1)} Mbit/s</b> · used <b>${Math.round(st.utilisation * 100)}%</b></div>` : `<div class="muted">${esc(path ? path.reason : '')}</div>`) +
          `<div>Sent <b>${st.sent}</b> · dropped <b>${st.dropped}</b>${st.lastReason ? ` <span class="muted">(${esc(st.lastReason)})</span>` : ''}</div>` : '<div class="muted">No terminal wired: this system is offline.</div>') +
        `</div><div class="opt-h">Tap: packets on this wire <button id="net-freeze" class="mini">${frozen ? 'Resume' : 'Freeze'}</button></div>` +
        `<div class="pk-list">${pk.map((p) => `<div class="pk ${p.dropped ? 'drop' : ''} ${selPacket && selPacket.n === p.n ? 'sel' : ''}" data-n="${p.n}"><i style="background:${TYPE_COLOUR[p.type]}"></i>${p.t.toFixed(1)}s ${p.toFusion ? '→' : '←'} ${esc(p.type)} <span class="muted">${p.bytes} B${p.dropped ? ' · ' + esc(p.reason) : ` · ${Math.round(p.delay * 1000)} ms`}</span></div>`).join('') || '<div class="muted">no packets yet</div>'}</div>` +
        `<pre class="pk-json">${selPacket ? esc(annotate(selPacket.msg).join('\n')) : 'Click a packet to read it, with a plain-English note beside each field.'}</pre>`;
    } else liveEl.innerHTML = sel && sel.kind === 'fusion' ? fusionLive() : '';
  }
  let frozen = false;
  function fusionLive() {
    const fl = ['starlink', 'cellular'].filter((k) => net.fusion.uplinks.has(k)).map((k) => { const i = comms.linkFor(net.fusion, k, net.fusion.cellBand); return `<div>${COMMS[k].name}: <b style="color:${linkColour(i)}">${i.up ? (i.quality < 0.6 ? 'degraded' : 'up') : 'DOWN'}</b> <span class="muted">${esc(i.up ? i.via : i.reason)}</span></div>`; }).join('');
    return `<div class="opt-h">Fusion links</div><div class="lstats">${fl || '<div class="muted">no terminals: the fusion node hears nothing</div>'}</div>`;
  }
  staticEl.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.fus) network.wireFusion(t.dataset.fus, t.checked);
    else if (t.name === 'uplink') { const n = byId(sel.id); if (n) network.wireNode(n, t.value || null); }
    else if (t.dataset.band !== undefined) network.setCellBand(byId(sel.id), t.value);
    else if (t.dataset.fusband !== undefined) network.setFusionCellBand(t.value);
    else if (t.dataset.jam) network.toggleJamBand(byId(sel.id), t.dataset.jam, t.checked);
    renderSide(true);
  });
  liveEl.addEventListener('click', (e) => {
    const row = e.target.closest('.pk'), fb = e.target.closest('#net-freeze');
    if (fb) { frozen = !frozen; return; }
    if (row) { const n = Number(row.dataset.n); selPacket = comms.packets.find((p) => p.n === n) || null; frozenOnce = true; renderSide(false); }
  });
  let frozenOnce = false;

  // ---------- cost line ----------
  function costLine() {
    const s = nodeList().filter((n) => n.uplink === 'starlink').length + (net.fusion.uplinks.has('starlink') ? 1 : 0);
    const c = nodeList().filter((n) => n.uplink === 'cellular').length + (net.fusion.uplinks.has('cellular') ? 1 : 0);
    const loose = network.unwired().length;
    np.querySelector('#net-cost').innerHTML = `Terminals: ${s} Starlink + ${c} cellular = <b>${usd(s * COMMS.starlink.cost + c * COMMS.cellular.cost)}</b>${loose ? ` · <span style="color:${BAD}">${loose} system${loose > 1 ? 's' : ''} unwired</span>` : ''}`;
  }

  // =====================================================================================================
  // Spectrum tab
  // =====================================================================================================
  const sp = pane('spectrum');
  sp.innerHTML = `<canvas id="spec-canvas"></canvas><div id="spec-notes"></div>
    <div class="plan-note">Frequency in GHz on a logarithmic scale. Bright bars are in use right now. A red stripe is where your own jamming overlaps one of your own links.</div>`;
  const sc = sp.querySelector('#spec-canvas'), sg = sc.getContext('2d'), notes = sp.querySelector('#spec-notes');
  const F0 = 0.05, F1 = 30;
  function drawSpectrum() {
    const W = sc.clientWidth, H = sc.clientHeight;
    if (!W || !H) return;
    if (sc.width !== W || sc.height !== H) { sc.width = W; sc.height = H; }
    sg.clearRect(0, 0, W, H); sg.fillStyle = '#0a1120'; sg.fillRect(0, 0, W, H);
    const L = 128, R = 10, T0 = 22, B = 26, span = Math.log10(F1 / F0);
    const X = (f) => L + (Math.log10(Math.max(f, F0) / F0) / span) * (W - L - R);
    sg.font = '10px system-ui'; sg.textAlign = 'center';
    for (const f of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20]) {
      sg.strokeStyle = '#1c2b46'; sg.lineWidth = 1; sg.beginPath(); sg.moveTo(X(f), T0 - 4); sg.lineTo(X(f), H - B); sg.stroke();
      sg.fillStyle = '#7f93b2'; sg.fillText(f >= 1 ? f + ' GHz' : f * 1000 + ' MHz', X(f), H - B + 14);
    }
    const jammers = [...net.nodes.values()].filter((n) => n.def.id === 'jammer');
    const usedBands = new Map(); // cellular band id -> nodes using it
    for (const n of nodeList()) if (n.uplink === 'cellular') usedBands.set(n.cellBand, [...(usedBands.get(n.cellBand) || []), n]);
    if (net.fusion.uplinks.has('cellular')) usedBands.set(net.fusion.cellBand, [...(usedBands.get(net.fusion.cellBand) || []), { short: 'FUSION', fusion: true }]);
    const starlinkUsed = nodeList().some((n) => n.uplink === 'starlink') || net.fusion.uplinks.has('starlink');
    const radars = [...net.nodes.values()].filter((n) => n.def.emits && n.def.emits.length);
    const rows = [
      { label: 'Enemy links', items: Object.entries(SPECTRUM.bands).map(([id, b]) => ({ label: b.label, f: b.f, colour: '#ff6e40', active: true })) },
      { label: 'Your jamming', items: jammers.flatMap((j) => [...j.jamBands].map((id) => ({ label: `${j.short} ${SPECTRUM.bands[id].label}`, f: SPECTRUM.bands[id].f, colour: '#7c4dff', active: j.mode === 'Jam' }))) },
      { label: 'Your cellular', items: [...usedBands].map(([id, list]) => ({ label: `${COMMS.cellular.bands[id].label.split(' (')[0]} · ${list.length}`, f: COMMS.cellular.bands[id].f, colour: '#ffab40', active: true })) },
      { label: 'Your Starlink', items: starlinkUsed ? [{ label: 'Ku uplink', f: [COMMS.starlink.band[0]], colour: '#b388ff', active: true }, { label: 'Ku downlink', f: [COMMS.starlink.band[1]], colour: '#b388ff', active: true }] : [] },
      { label: 'Your radars', items: radars.map((r) => ({ label: r.short, f: r.def.emits[0].f, colour: hex(r.def.color), active: true })) },
      { label: 'RF detector hears', items: nodeList().some((n) => n.def.id === 'rf') ? [{ label: '70 MHz – 6 GHz', f: [SPECTRUM.detectorListens], colour: '#00e676', active: true, faint: true }] : [] },
    ];
    const rh = (H - T0 - B) / rows.length;
    // overlaps between jamming and cellular
    const conflicts = [];
    for (const j of jammers) for (const id of j.jamBands) for (const [cid, list] of usedBands) {
      if (!overlaps(SPECTRUM.bands[id].f, COMMS.cellular.bands[cid].f)) continue;
      conflicts.push({ j, id, cid, list });
      for (const [a0, a1] of SPECTRUM.bands[id].f) for (const [b0, b1] of COMMS.cellular.bands[cid].f) {
        const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
        if (lo < hi) { sg.fillStyle = j.mode === 'Jam' ? 'rgba(244,67,54,0.38)' : 'rgba(244,67,54,0.18)'; sg.fillRect(X(lo), T0, Math.max(X(hi) - X(lo), 3), H - T0 - B); }
      }
    }
    rows.forEach((row, i) => {
      const y = T0 + i * rh;
      sg.fillStyle = i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent'; sg.fillRect(L, y, W - L - R, rh);
      sg.fillStyle = '#9fb2cf'; sg.textAlign = 'right'; sg.font = '11px system-ui'; sg.fillText(row.label, L - 8, y + rh / 2 + 4);
      row.items.forEach((it, k) => {
        const lane = row.items.length > 1 ? (k % 2) : 0, h = row.items.length > 1 ? rh / 2 - 3 : rh - 10, yy = y + 4 + lane * (rh / 2 - 1);
        for (const [a, b] of it.f) {
          const x0 = X(a), x1 = Math.max(X(b), x0 + 4);
          sg.fillStyle = it.colour; sg.globalAlpha = it.faint ? 0.3 : it.active ? 0.9 : 0.35; sg.fillRect(x0, yy, x1 - x0, h); sg.globalAlpha = 1;
          sg.fillStyle = '#fff'; sg.font = '9px system-ui'; sg.textAlign = 'left';
          if (x1 - x0 > 28) sg.fillText(it.label, x0 + 3, yy + h - 3); else sg.fillText(it.label, x1 + 3, yy + h - 3);
        }
      });
    });
    notes.innerHTML = conflicts.length
      ? '<ul>' + conflicts.map((c) => `<li><b>${esc(c.j.short)}</b> jams <b>${esc(SPECTRUM.bands[c.id].label)}</b>, which overlaps your <b>${esc(COMMS.cellular.bands[c.cid].label)}</b> cellular band used by ${c.list.length} link${c.list.length > 1 ? 's' : ''} (${esc(c.list.map((n) => n.short).slice(0, 6).join(', '))}). While ${esc(c.j.short)} is jamming (${c.j.mode === 'Jam' ? '<b>now</b>' : 'currently standby'}), cellular links within ${c.j.def.range} m of it degrade. Move those links to another band or stop jamming that band.</li>`).join('') + '</ul>'
      : '<div class="muted">No overlap between your jamming and your cellular links. (Starlink uses Ku-band, far from anything you jam.)</div>';
  }

  // =====================================================================================================
  // Learn tab
  // =====================================================================================================
  const lp = pane('learn');
  const STEPS = [
    { title: '1. A system joins the network', types: ['registration', 'registration_ack'],
      text: 'When a system is built it sends a <b>registration</b>: who it is, what type of node, what modes it has, how often it will report. The fusion node answers with a <b>registration acknowledgement</b>. From then on the system is part of the network.' },
    { title: '2. Staying in touch', types: ['status_report'],
      text: 'Every few seconds each node sends a <b>status report</b>: its mode, where it is and whether it is healthy. If the fusion node hears nothing for three reports in a row it raises "Lost contact". Cut a node\'s link and you will see this happen.' },
    { title: '3. A sensor sees something', types: ['detection_report'], find: (e) => !e.msg.detection_report.derived_detection,
      text: 'A sensor sends a <b>detection report</b>: where the thing is relative to the sensor (range and bearing, or bearing only), how sure it is, what it looks like, and any signal it heard. A radar gives range; a camera or RF detector gives only direction. Each node numbers things its own way (<code>object_id</code>).' },
    { title: '4. The fusion node combines them', types: ['detection_report'], find: (e) => !!e.msg.detection_report.derived_detection,
      text: 'The fusion node matches reports from different sensors into one <b>track</b> and sends its own detection report to the operator screen. <code>derived_detection</code> lists which sensor reports it was built from, so every track can be traced back to its evidence.' },
    { title: '5. Pointing a sensor', types: ['task'], find: (e) => !!(e.msg.task.command && e.msg.task.command.look_at),
      text: 'Radar finds things; the camera is narrow and has to be told where to look. The fusion node sends a <b>task</b> with a <code>look_at</code> command. The camera turns, dwells, and its detection reports now carry a classification (Multirotor or Fixed wing).' },
    { title: '6. Engaging', types: ['task', 'task_ack'], find: (e) => e.type === 'task' ? !!(e.msg.task.command && e.msg.task.command.request) : true,
      text: 'To engage, the fusion node sends a <b>task</b> to an effector (<code>request: "Engage"</code> plus the track). The effector replies with a <b>task acknowledgement</b>: accepted, or rejected with a reason (out of range, no line of sight, wrong type of target). SAPIENT has no dedicated "engage" command, so this uses the free-text request field.' },
    { title: '7. A person decides', types: ['alert', 'alert_ack'], find: (e) => e.type === 'alert' ? /Engagement request/.test(e.msg.alert.description) : true,
      text: 'SAPIENT has no message for weapon release. This game emulates it with an <b>alert</b> from the fusion node asking a person, and an <b>alert acknowledgement</b> carrying the answer. Set "Engagement authority" in the top right to try it.' },
    { title: '8. Kill reported, then confirmed', types: ['alert'], find: (e) => /Kill (reported|confirmed|NOT)/.test(e.msg.alert.description),
      text: 'There is no kill-confirmation message either. The effector reports its task completed; the fusion node raises an alert and waits for the sensors to lose the track before it confirms (or warns that the target is still there).' },
    { title: '9. When something is wrong', types: ['error', 'alert'], find: (e) => e.type === 'error' || /Lost contact|Contact restored/.test(e.msg.alert.description),
      text: 'A message that breaks the rules gets an <b>error</b> from the middleware. A node that goes quiet gets a "Lost contact" <b>alert</b>. Try "Inject fault" in the Messages tab.' },
  ];
  const exampleFor = (s) => { for (let i = bus.entries.length - 1; i >= 0; i--) { const e = bus.entries[i]; if (s.types.includes(e.type) && (!s.find || s.find(e))) return e; } return null; };
  let learnEntry = null, followId = '';
  function renderLearn(forceFull) {
    if (forceFull || !lp.dataset.built) {
      lp.dataset.built = '1';
      lp.innerHTML = `<div class="sys note">How information flows in this system, step by step. Each step shows a real message from this run with a plain-English note beside each field. Messages are in the form defined by BSI Flex 335 v2.0; the wording is mine.</div>` +
        STEPS.map((s, i) => `<div class="sys step"><div class="sys-h"><b>${s.title}</b></div><div>${s.text}</div><button data-step="${i}" class="mini">Show an example from this run</button></div>`).join('') +
        `<div class="sys"><div class="sys-h"><b>Follow a track</b></div><div>Pick a track to see every message that led to it: the sensor reports, the fused reports, and any tasks and alerts that mention it.</div><select id="follow"></select><div id="follow-list" class="pk-list"></div></div>` +
        `<pre id="learn-json" class="pk-json big">Pick an example to read it here.</pre>`;
    }
    const fs = lp.querySelector('#follow');
    const ids = [...net.tracks.values()].filter((t) => t.short).map((t) => t.id).join(',');
    if (fs.dataset.ids !== ids) {
      fs.dataset.ids = ids;
      fs.innerHTML = '<option value="">choose a track...</option>' + [...net.tracks.values()].filter((t) => t.short).map((t) => `<option value="${t.id}" ${t.id === followId ? 'selected' : ''}>${t.short} (${t.airframe === 'Unknown' ? 'unclassified' : t.airframe})</option>`).join('');
    }
  }
  function followMessages(tr) {
    const ids = new Set([tr.id, ...[...tr.sources.values()].map((v) => v.objectId)]);
    return bus.entries.filter((e) => {
      const m = e.msg[e.type];
      if (e.type === 'detection_report') return ids.has(m.object_id);
      if (e.type === 'task') return m.command && m.command.command_parameter === tr.id;
      if (e.type === 'alert') return tr.short && m.description.includes(tr.short + ' ') || (tr.short && m.description.endsWith(tr.short));
      return false;
    }).slice(-60);
  }
  lp.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]'), row = e.target.closest('.pk');
    if (b) {
      const ent = exampleFor(STEPS[Number(b.dataset.step)]);
      lp.querySelector('#learn-json').textContent = ent ? `${STEPS[Number(b.dataset.step)].title}\n${net.nameOf(ent.from)} → ${net.nameOf(ent.to)} at ${ent.t.toFixed(1)} s\n\n${annotate(ent.msg).join('\n')}` : 'No message of this kind yet in this run. Place some systems, wire them and start a wave.';
    } else if (row) {
      const ent = bus.entries.find((x) => x.seq === Number(row.dataset.seq));
      if (ent) lp.querySelector('#learn-json').textContent = `${net.nameOf(ent.from)} → ${net.nameOf(ent.to)} at ${ent.t.toFixed(1)} s\n\n${annotate(ent.msg).join('\n')}`;
    }
  });
  lp.addEventListener('change', (e) => {
    if (e.target.id !== 'follow') return;
    followId = e.target.value;
    const tr = net.tracks.get(followId);
    const list = lp.querySelector('#follow-list');
    if (!tr) { list.innerHTML = ''; return; }
    list.innerHTML = followMessages(tr).map((m) => `<div class="pk" data-seq="${m.seq}"><i style="background:${TYPE_COLOUR[m.type]}"></i>${m.t.toFixed(1)}s ${esc(net.nameOf(m.from))} → ${esc(net.nameOf(m.to))} <b>${esc(m.type)}</b></div>`).join('') || '<div class="muted">no messages yet</div>';
  });

  // ---------- refresh ----------
  let last = 0;
  function frame(t) {
    const tab = getActiveTab();
    if (!dock.classList.contains('hidden')) {
      if (tab === 'network') { render(); if (t - last > 250) { last = t; costLine(); if (!frozen || frozenOnce) { renderSide(false); frozenOnce = false; } } }
      else if (tab === 'spectrum' && t - last > 300) { last = t; drawSpectrum(); }
      else if (tab === 'learn' && t - last > 600) { last = t; renderLearn(false); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  renderLearn(true);
  renderSide(true);
  return { select: (id) => { sel = { kind: 'node', id }; renderSide(true); } };
}
