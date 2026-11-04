// Pause and rewind. The recorder keeps a snapshot of the run every half second of game time (what every drone, track,
// missile and system was doing), plus a list of events (launches, kills, leaks). The replay view redraws a snapshot in
// the scene, and the timeline scrubs through them. Rewinding is for looking: the live simulation is not rolled back, so
// "Live" returns to where the run had got to.

import * as THREE from 'three';
import { WORLD, DRONES, STRUCTURES } from './config.js';
import { view } from './view.js';

export const SNAPSHOT_EVERY = 10; // simulation steps per snapshot (10 x 0.05 s = 0.5 s)
const MAX_FRAMES = 7200;          // one hour of game time

export function createRecorder() {
  const frames = [], events = [];
  return {
    frames, events,
    push(f) { frames.push(f); if (frames.length > MAX_FRAMES) frames.splice(0, frames.length - MAX_FRAMES); },
    event(type, text, uid) { events.push({ t: this.now ? this.now() : 0, type, text, uid }); },
    now: null, // set by the game: () => current game time
    clear() { frames.length = 0; events.length = 0; },
  };
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// deps: { scene, rec, droneTemplate, makeLabel, trackColour, getStructures, hideLive, setSpeed, getLastSpeed, setPaused }
export function createReplay(deps) {
  const { scene, rec } = deps;
  const review = { active: false, idx: 0, playing: false };
  const u = (m) => m / WORLD.metresPerUnit;

  // ---------- the view ----------
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const droneObjs = new Map(); // uid -> { group, model, unseen, label }
  const trackObjs = [];        // pool of { mesh, label }
  const missileObjs = [];
  const lineObjs = [];
  const diamondGeo = new THREE.OctahedronGeometry(1, 0);
  const coneGeo = new THREE.ConeGeometry(0.35, 1.8, 8).rotateX(Math.PI / 2);

  function droneObj(d) {
    let o = droneObjs.get(d.u);
    if (o) return o;
    const def = DRONES[d.type];
    const g = new THREE.Group();
    const model = deps.droneTemplate(d.type, false).clone();
    const unseen = deps.droneTemplate(d.type, true).clone();
    g.add(model, unseen);
    g.scale.setScalar(def.scale * WORLD.droneVisualScale);
    group.add(g);
    const code = { spotter: 'SPT', fo: 'FO', fpv: 'FPV', fw: 'FW', friend: 'FRD' }[d.type] || d.type;
    o = { group: g, model, unseen, label: deps.makeLabel(code, '#' + def.color.toString(16).padStart(6, '0'), 'dlabel') };
    droneObjs.set(d.u, o);
    return o;
  }
  const pool = (arr, make, i) => arr[i] || (arr[i] = make());

  function show(f, camera) {
    group.visible = true;
    const seen = new Set();
    for (const d of f.drones) {
      seen.add(d.u);
      const o = droneObj(d);
      o.group.visible = view.truth;
      o.group.position.set(d.x, d.y, d.z); o.group.rotation.y = d.ry;
      o.model.visible = d.tracked; o.unseen.visible = !d.tracked;
      deps.placeLabel(o.label, d.x, d.y + 4, d.z, view.truth && view.labels);
      o.label.style.opacity = d.tracked ? '1' : '0.5';
    }
    for (const [uid, o] of droneObjs) if (!seen.has(uid)) { o.group.visible = false; o.label.style.display = 'none'; }

    f.tracks.forEach((tr, i) => {
      const o = pool(trackObjs, () => {
        const mesh = new THREE.Mesh(diamondGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
        mesh.renderOrder = 20; group.add(mesh);
        return { mesh, label: deps.makeLabel('', '#ffffff', 'dlabel') };
      }, i);
      o.mesh.visible = true;
      o.mesh.position.set(tr.x, tr.y, tr.z);
      o.mesh.scale.setScalar(Math.max(1.5, camera.position.distanceTo(o.mesh.position) * 0.008));
      const col = deps.trackColour(tr);
      o.mesh.material.color.setHex(col);
      o.label.style.borderColor = '#' + col.toString(16).padStart(6, '0');
      const cls = tr.airframe && tr.airframe !== 'Unknown' ? tr.airframe : 'UAV';
      o.label.textContent = tr.status === 'tentative' ? 'tentative' : `${tr.short} · ${cls}${tr.kill ? ' · kill reported' : ''}`;
      deps.placeLabel(o.label, tr.x, tr.y, tr.z, view.labels);
    });
    for (let i = f.tracks.length; i < trackObjs.length; i++) { trackObjs[i].mesh.visible = false; trackObjs[i].label.style.display = 'none'; }

    f.missiles.forEach((m, i) => {
      const o = pool(missileObjs, () => { const mesh = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffffff })); mesh.scale.setScalar(3); group.add(mesh); return mesh; }, i);
      o.visible = true; o.position.set(m.x, m.y, m.z);
    });
    for (let i = f.missiles.length; i < missileObjs.length; i++) missileObjs[i].visible = false;

    // what each system was doing: its label says its mode and target, and a line runs to the drone it was engaging
    const byUid = new Map(f.drones.map((d) => [d.u, d]));
    let li = 0;
    for (const s of deps.getStructures()) {
      const st = f.structs.find((x) => x.id === s.nodeId);
      if (!st) { s.label.style.display = 'none'; continue; }
      s.label.textContent = `${s.short} · ${st.mode}${st.trackShort ? ' ▸ ' + st.trackShort : ''}`;
      deps.placeLabel(s.label, s.pos.x, s.pos.y + 9, s.pos.z, view.labels);
      const tgt = st.target != null ? byUid.get(st.target) : null;
      if (tgt) {
        const line = pool(lineObjs, () => {
          const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9 }));
          l.frustumCulled = false; group.add(l); return l;
        }, li++);
        line.visible = true;
        line.material.color.setHex(STRUCTURES[s.def.id].color);
        const p = line.geometry.attributes.position;
        p.setXYZ(0, s.pos.x, s.pos.y + 6, s.pos.z); p.setXYZ(1, tgt.x, tgt.y, tgt.z); p.needsUpdate = true;
      }
    }
    for (let i = li; i < lineObjs.length; i++) lineObjs[i].visible = false;
  }

  function hide() {
    if (!group.visible) return;
    group.visible = false;
    for (const o of droneObjs.values()) o.label.style.display = 'none';
    for (const o of trackObjs) o.label.style.display = 'none';
  }

  // ---------- the timeline ----------
  const bar = document.createElement('div');
  bar.id = 'timeline'; bar.className = 'panel';
  bar.innerHTML = `
    <div class="tl-row">
      <button id="tl-live" class="primary" title="Back to the live run">LIVE</button>
      <button id="tl-back" title="Back 0.5 s (Left arrow)">&#9664;|</button>
      <button id="tl-play" title="Play the replay">&#9654;</button>
      <button id="tl-fwd" title="Forward 0.5 s (Right arrow)">|&#9654;</button>
      <div class="tl-track"><input id="tl-range" type="range" min="0" max="0" value="0" step="1"><div id="tl-events"></div></div>
      <span id="tl-time">0:00</span>
    </div>`;
  document.body.appendChild(bar);
  const banner = document.createElement('div');
  banner.id = 'review-banner'; banner.className = 'hidden';
  document.body.appendChild(banner);
  const range = bar.querySelector('#tl-range'), timeEl = bar.querySelector('#tl-time'), eventsEl = bar.querySelector('#tl-events');
  const playBtn = bar.querySelector('#tl-play');

  function enter(idx) {
    if (!rec.frames.length) return;
    if (!review.active) { review.active = true; deps.setPaused(true); }
    review.idx = Math.max(0, Math.min(idx, rec.frames.length - 1));
  }
  function exit() {
    if (!review.active) return;
    review.active = false; review.playing = false; view.replayT = null;
    playBtn.innerHTML = '&#9654;';
    hide();
    deps.setSpeed(deps.getLastSpeed() || 1);
  }
  range.addEventListener('input', () => enter(Number(range.value)));
  bar.querySelector('#tl-live').onclick = exit;
  bar.querySelector('#tl-back').onclick = () => { review.playing = false; enter((review.active ? review.idx : rec.frames.length - 1) - 1); };
  bar.querySelector('#tl-fwd').onclick = () => { review.playing = false; enter((review.active ? review.idx : rec.frames.length - 1) + 1); };
  playBtn.onclick = () => {
    if (!review.active) return;
    review.playing = !review.playing;
    if (review.playing && review.idx >= rec.frames.length - 1) review.idx = 0;
  };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') { bar.querySelector('#tl-back').click(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { bar.querySelector('#tl-fwd').click(); e.preventDefault(); }
    else if (e.key === ' ' && review.active) { playBtn.click(); e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  let tickCount = -1;
  function drawEvents() {
    const total = rec.frames.length ? rec.frames[rec.frames.length - 1].t - rec.frames[0].t : 0;
    if (!total) { eventsEl.innerHTML = ''; return; }
    const t0 = rec.frames[0].t;
    const colour = { kill: '#66bb6a', leak: '#ff5252', spotter: '#ffd600', lost: '#ff9100', friendly: '#ffd54f' };
    eventsEl.innerHTML = rec.events.filter((e) => colour[e.type]).map((e) =>
      `<i style="left:${(100 * (e.t - t0) / total).toFixed(2)}%;background:${colour[e.type]}" title="${e.text} (${fmtTime(e.t)})"></i>`).join('');
  }

  // called every frame with the real elapsed time and the camera
  function update(real, camera) {
    const n = rec.frames.length;
    range.max = Math.max(n - 1, 0);
    if (n !== tickCount) { tickCount = n; drawEvents(); }
    if (!review.active) {
      range.value = n - 1;
      timeEl.textContent = n ? fmtTime(rec.frames[n - 1].t) : '0:00';
      banner.classList.add('hidden');
      return;
    }
    if (review.playing) {
      review.idx += (real * WORLD.timeScale * Math.max(deps.getLastSpeed() || 1, 1)) / 0.5;
      if (review.idx >= n - 1) { review.idx = n - 1; review.playing = false; }
    }
    const i = Math.max(0, Math.min(Math.floor(review.idx), n - 1));
    const f = rec.frames[i];
    range.value = i;
    view.replayT = f.t;
    timeEl.textContent = fmtTime(f.t);
    playBtn.innerHTML = review.playing ? '&#10074;&#10074;' : '&#9654;';
    banner.classList.remove('hidden');
    banner.innerHTML = `REPLAY <b>${fmtTime(f.t)}</b> &middot; wave ${f.wave} &middot; budget $${Math.round(f.budget).toLocaleString('en-US')} &middot; kills ${f.kills} &middot; leaks ${f.leaks}`;
    deps.hideLive();
    show(f, camera);
  }

  // forget the cached replay drones (uids restart from 1 after a reset, so they must not be reused)
  function reset() {
    exit();
    for (const o of droneObjs.values()) { group.remove(o.group); o.label.remove(); }
    droneObjs.clear();
    tickCount = -1;
  }

  return { review, update, enter, exit, hide, reset, active: () => review.active };
}
