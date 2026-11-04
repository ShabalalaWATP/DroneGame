// The start screen, game over card, control panel toggles, tuning panel and sandbox panel.

import { WORLD, ADAPT, DRONES, FUSION } from '../sim/config/index.js';
import { enemyCost, money } from '../sim/economy.js';
import { clamp } from '../sim/units.js';
import { view } from '../render/view.js';

const $ = (id) => document.getElementById(id);

export function initStartScreen(sim) {
  $('seed-input').value = sim.state.seed;
  $('terrain-input').value = sim.state.terrainSeed;
  $('btn-seed-random').onclick = () => { $('seed-input').value = String(Math.floor(Math.random() * 900000) + 100000); }; // a UI action, not part of the sim
  $('btn-deploy').onclick = () => {
    const seed = $('seed-input').value.trim() || '1';
    const terrainSeed = $('terrain-input').value.trim() || '1';
    sim.commands.deploy(seed, terrainSeed);
    history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}&terrain=${encodeURIComponent(terrainSeed)}`);
    $('overlay').classList.add('hidden');
  };
}

export function showGameOver(sim) {
  const { state, ledger } = sim;
  const card = document.querySelector('#overlay .card');
  card.innerHTML = `<h1>SITE LOST</h1><p>You held out for <b>${Math.max(state.wave - 1, 0)}</b> full wave(s).</p>
    <p>Kills <b>${state.kills}</b> &middot; Enemy attack cost <b>${money(enemyCost(ledger.launched))}</b> &middot; Defence spend <b>${money(ledger.capex + ledger.consumables)}</b></p>
    <button id="btn-restart" class="primary">Retry with the same laydown</button> <button id="btn-restart-clear">New laydown</button>`;
  $('overlay').classList.remove('hidden');
  $('btn-restart').onclick = () => sim.commands.reset('keep');
  $('btn-restart-clear').onclick = () => sim.commands.reset('clear');
}

// setSpeed and getClock come from the main loop, which owns game speed.
export function initControls(sim, gameView, setSpeed, getClock) {
  const { state, commands } = sim;
  document.querySelectorAll('.speed').forEach((b) => { b.onclick = () => setSpeed(Number(b.dataset.speed)); });
  $('btn-wave').onclick = () => commands.startWave();
  $('auto').onchange = (e) => commands.setAutoStart(e.target.checked);
  $('truth').onchange = (e) => { view.truth = e.target.checked; };
  $('labels-toggle').onchange = (e) => { view.labels = e.target.checked; };
  $('rings').onchange = (e) => { view.rings = e.target.checked; gameView.structures.setRingsVisible(view.rings); };
  $('track-hi').onchange = (e) => { view.trackHi = e.target.checked; document.body.classList.toggle('track-hi', view.trackHi); };
  $('authority').value = FUSION.authority;
  $('authority').onchange = (e) => commands.setAuthority(e.target.value);
  $('btn-tuning').onclick = () => $('tuning').classList.toggle('hidden');
  $('btn-sandbox').onclick = () => (state.sandbox ? commands.exitSandbox() : commands.enterSandbox());
  $('btn-reset').onclick = () => { if (state.started) commands.reset('keep'); };
  let clearArmed = 0;
  $('btn-clear').onclick = (e) => { // two clicks, since it throws the laydown away
    if (!state.started) return;
    if (!clearArmed) {
      e.target.textContent = 'Sure? Click again';
      clearArmed = setTimeout(() => { clearArmed = 0; e.target.textContent = 'New laydown'; }, 3000);
      return;
    }
    clearTimeout(clearArmed); clearArmed = 0; e.target.textContent = 'New laydown';
    commands.reset('clear');
  };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === ' ') { e.preventDefault(); const c = getClock(); setSpeed(c.speed === 0 ? c.lastSpeed || 1 : 0); return; }
    if (e.key === 'r' || e.key === 'R') { $('rings').click(); return; }
    if (e.key === 't' || e.key === 'T') { $('truth').click(); return; }
    if (e.key === 'l' || e.key === 'L') $('labels-toggle').click();
  });
}

function numberField(parent, label, obj, key, { step = 1, min = 0 } = {}) {
  const row = document.createElement('label');
  row.textContent = label;
  const input = document.createElement('input');
  input.type = 'number'; input.value = obj[key]; input.step = step; input.min = min;
  input.onchange = () => {
    const v = Number(input.value);
    if (Number.isFinite(v) && v >= min) obj[key] = v; else input.value = obj[key];
  };
  row.appendChild(input);
  parent.appendChild(row);
}

export function buildTuning() {
  const el = $('tuning');
  el.innerHTML = '';
  const head = (t) => { const h = document.createElement('div'); h.className = 'label'; h.textContent = t; el.appendChild(h); };
  head('GAME');
  numberField(el, 'Time scale (x)', WORLD, 'timeScale', { step: 0.5, min: 0.5 });
  const note = document.createElement('div');
  note.className = 'muted'; note.style.margin = '6px 0';
  note.textContent = 'Ranges, prices and drone figures are in the SAPIENT panel, Sources tab.';
  el.appendChild(note);
  head('ENEMY LEARNING (per wave)');
  numberField(el, 'Evade gain', ADAPT, 'evadePerWave', { step: 0.01 });
  numberField(el, 'Jam resist gain', ADAPT, 'jamResistPerWave', { step: 0.01 });
}

const COMPASS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
export function initSandboxPanel(sim) {
  const { commands } = sim;
  const el = $('sandbox');
  const types = Object.entries(DRONES).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('');
  const dirs = COMPASS.map(([n, b]) => `<option value="${b}">${n}</option>`).join('') + '<option value="rand">Random</option>';
  el.innerHTML = `<h3>SANDBOX</h3>
    <div class="note">Attack your laydown without consequences: the site and your systems cannot be damaged and shots are free. Leaving resets the run and keeps your laydown, so you can still place and wire systems here.</div>
    <label>Enemy has adapted to wave <select id="sb-level">${[1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
    <div class="row"><button id="sb-wave" class="primary">Launch that wave's attack</button></div>
    <div class="label" style="margin-top:8px">CUSTOM ATTACK</div>
    <label>Drone <select id="sb-type">${types}</select></label>
    <label>Number <input id="sb-count" type="number" min="1" max="30" value="3"></label>
    <label>From <select id="sb-dir">${dirs}</select></label>
    <label>Seconds apart <input id="sb-gap" type="number" min="0" max="60" value="4"></label>
    <div class="row"><button id="sb-launch" class="primary">Launch</button><button id="sb-clear">Clear drones</button><button id="sb-exit">Exit sandbox</button></div>
    <div id="sb-info" class="note"></div>`;
  $('sb-level').onchange = (e) => commands.setSandboxLevel(Number(e.target.value));
  $('sb-wave').onclick = () => commands.launchSandboxWave();
  $('sb-launch').onclick = () => commands.launchSandboxAttack({
    type: $('sb-type').value, bearingDeg: $('sb-dir').value,
    count: clamp(Math.round(Number($('sb-count').value) || 1), 1, 30), gap: Math.max(Number($('sb-gap').value) || 0, 0),
  });
  $('sb-clear').onclick = () => commands.clearSandboxDrones();
  $('sb-exit').onclick = () => commands.exitSandbox();
  sim.on('sandbox', () => {
    $('sandbox').classList.remove('hidden'); $('sandbox-banner').classList.remove('hidden'); $('tuning').classList.add('hidden');
    $('btn-sandbox').textContent = 'Exit sandbox';
  });
  sim.on('reset', () => {
    $('sandbox').classList.add('hidden'); $('sandbox-banner').classList.add('hidden');
    $('btn-sandbox').textContent = 'Sandbox';
    $('overlay').classList.add('hidden');
  });
}
