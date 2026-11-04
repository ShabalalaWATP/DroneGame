// The heads-up display: site integrity, budget, status lines, toasts and the operator's approval cards.

import { SITE, ECONOMY, DRONES, ADAPT } from '../sim/config/index.js';
import { enemyCost, money } from '../sim/economy.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let toastTimer = 0;
export function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function createHud(sim) {
  const { state, ledger, net } = sim;
  const bb = { capex: $('bb-capex'), shots: $('bb-shots'), capexT: $('bb-capex-t'), shotsT: $('bb-shots-t'), leftT: $('bb-left-t') };
  const hud = { fill: $('health-fill'), budget: $('budget'), wave: $('wave'), kills: $('kills'), leaks: $('leaks'), btn: $('btn-wave'), status: $('status') };

  // the operator's approval prompt: one card per pending engagement request
  let approvalKey = '';
  $('approval').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) sim.commands.decide(b.dataset.id, b.dataset.ok === '1');
  });
  function renderApprovals() {
    const el = $('approval'), list = net.pendingRequests;
    const key = list.map((r) => r.id).join(',');
    if (key === approvalKey) return;
    approvalKey = key;
    el.classList.toggle('hidden', !list.length);
    el.innerHTML = list.map((r) => `<div class="req"><div class="req-h">AUTHORISE ENGAGEMENT?</div><div>${esc(r.text)}</div>` +
      `<div class="req-b"><button class="primary" data-id="${r.id}" data-ok="1">Approve</button><button data-id="${r.id}" data-ok="0">Deny</button></div></div>`).join('');
  }

  function update() {
    const k = state.health / SITE.maxHealth;
    hud.fill.style.width = (k * 100).toFixed(0) + '%';
    hud.fill.style.background = k > 0.6 ? '#4caf50' : k > 0.3 ? '#ffb300' : '#e53935';
    hud.budget.textContent = money(state.budget);
    const pct = (v) => (v > 0 ? Math.max(100 * Math.min(v / ECONOMY.budget, 1), 0.6) : 0).toFixed(2) + '%'; // a sliver stays visible
    bb.capex.style.width = pct(ledger.capex); bb.shots.style.width = pct(ledger.consumables);
    bb.capexT.textContent = money(ledger.capex); bb.shotsT.textContent = money(ledger.consumables); bb.leftT.textContent = money(state.budget);
    hud.wave.textContent = state.wave;
    hud.kills.textContent = state.kills;
    hud.leaks.textContent = state.leaks;
    const spot = sim.spotterBonus();
    const next = state.waveActive ? state.wave : state.wave + 1; // wave these numbers apply to
    const adapted = (type) => {
      const def = DRONES[type], kk = (next - 1) * (def.adapt ?? 1);
      return Math.max(Math.min(ADAPT.evadeFloor, def.evade), def.evade * (1 - ADAPT.evadePerWave * kk));
    };
    hud.status.innerHTML = (spot > 0 ? `<span class="warn">FW Spotter on station: strikes +${Math.round(spot * 100)}%</span><br>` : '')
      + `Enemy attack cost ${money(enemyCost(ledger.launched))} &middot; shots fired ${money(ledger.consumables)}`
      + `${ledger.consumables && enemyCost(ledger.killed) ? ` &middot; $${(ledger.consumables / enemyCost(ledger.killed)).toFixed(2)} per $1 destroyed` : ''}<br>`
      + `Enemy evasion (1.00 = easy to hit): FPV ${adapted('fpv').toFixed(2)} &middot; FW ${adapted('fw').toFixed(2)}<br>Seed ${esc(state.seed)} &middot; Terrain ${esc(state.terrainSeed)}`;
    hud.btn.disabled = state.waveActive || state.over || state.sandbox;
    hud.btn.textContent = state.sandbox ? 'Exit sandbox to start' : state.waveActive ? `Wave ${state.wave} in progress` : `Start wave ${state.wave + 1}`;
    const sbInfo = $('sb-info');
    if (sbInfo && state.sandbox) sbInfo.textContent = `${state.sbQueue.length} drone(s) queued · ${sim.drones.length} in the air · shots fired (free here) ${money(state.sbSpent)} · leaks ${state.leaks}`;
    renderApprovals();
  }

  return { update, forgetApprovals() { approvalKey = ''; } };
}
