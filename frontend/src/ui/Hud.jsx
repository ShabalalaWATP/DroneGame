// Site integrity, budget and the status lines.

import { SITE, ECONOMY, DRONES, ADAPT } from '../sim/config/index.js';
import { enemyCost, money } from '../sim/economy.js';
import { useGame, useTick } from './hooks.js';

const pct = (v) => (v > 0 ? Math.max(100 * Math.min(v / ECONOMY.budget, 1), 0.6) : 0).toFixed(2) + '%'; // a sliver stays visible

export function Hud() {
  useTick();
  const { sim } = useGame();
  const { state, ledger } = sim;
  const k = state.health / SITE.maxHealth;
  const spot = sim.spotterBonus();
  const next = state.waveActive ? state.wave : state.wave + 1; // the wave these numbers apply to
  const adapted = (type) => {
    const def = DRONES[type], kk = (next - 1) * (def.adapt ?? 1);
    return Math.max(Math.min(ADAPT.evadeFloor, def.evade), def.evade * (1 - ADAPT.evadePerWave * kk)).toFixed(2);
  };
  const destroyed = enemyCost(ledger.killed);
  return (
    <div id="hud-top-left" className="panel">
      <div className="label">SITE INTEGRITY</div>
      <div className="bar"><div id="health-fill" style={{ width: (k * 100).toFixed(0) + '%', background: k > 0.6 ? '#4caf50' : k > 0.3 ? '#ffb300' : '#e53935' }} /></div>
      <div className="label" style={{ marginTop: 8 }}>BUDGET <b id="budget" className="budget-num">{money(state.budget)}</b></div>
      <div className="budget-bar" title="The whole budget: systems bought, shots fired, and what is left">
        <span className="b-capex" style={{ width: pct(ledger.capex) }} /><span className="b-shots" style={{ width: pct(ledger.consumables) }} /><span className="b-left" />
      </div>
      <div className="bb-legend">
        <i className="d-capex" />systems <b>{money(ledger.capex)}</b> <i className="d-shots" />shots <b>{money(ledger.consumables)}</b> <i className="d-left" />left <b>{money(state.budget)}</b>
      </div>
      <div className="stats">
        <span>Wave <b id="wave">{state.wave}</b></span>
        <span>Kills <b id="kills">{state.kills}</b></span>
        <span>Leaks <b id="leaks">{state.leaks}</b></span>
      </div>
      <div id="status" className="hint">
        {spot > 0 && <><span className="warn">FW Spotter on station: strikes +{Math.round(spot * 100)}%</span><br /></>}
        Enemy attack cost {money(enemyCost(ledger.launched))} · shots fired {money(ledger.consumables)}
        {ledger.consumables > 0 && destroyed > 0 && ` · $${(ledger.consumables / destroyed).toFixed(2)} per $1 destroyed`}<br />
        Enemy evasion (1.00 = easy to hit): FPV {adapted('fpv')} · FW {adapted('fw')}<br />
        Seed {state.seed} · Terrain {state.terrainSeed}
      </div>
    </div>
  );
}
