// What you have spent, against what the attack cost the enemy.

import { COMMS, DRONES, ECONOMY, STRUCTURES } from '../../sim/config/index.js';
import { enemyCost } from '../../sim/economy.js';
import { hex, usd, useGame, useTick } from '../hooks.js';
import { SourceLinks } from './SourceLinks.jsx';

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const pct = (v) => ((100 * v) / ECONOMY.budget).toFixed(1) + '%';

function LaydownTable({ net, ledger }) {
  const owned = {};
  for (const s of net.nodes.values()) if ((s.def.role === 'sensor' || s.def.role === 'effector') && s.def.id !== 'perimeter') owned[s.def.id] = (owned[s.def.id] || 0) + 1;
  const terminals = ['starlink', 'cellular'].filter((k) => ledger.terminals[k] > 0);
  const lost = sum(ledger.lost);
  const empty = !Object.keys(owned).length && !terminals.length && !lost;
  return (
    <table className="mini">
      <thead><tr><th>System</th><th>Count</th><th>Each</th><th>Total</th></tr></thead>
      <tbody>
        {Object.entries(owned).map(([id, n]) => <tr key={id}><td>{STRUCTURES[id].name}</td><td>{n}</td><td>{usd(STRUCTURES[id].cost)}</td><td>{usd(n * STRUCTURES[id].cost)}</td></tr>)}
        {terminals.map((k) => <tr key={k}><td>{COMMS[k].name} terminal</td><td>{ledger.terminals[k]}</td><td>{usd(COMMS[k].cost)}</td><td>{usd(ledger.terminals[k] * COMMS[k].cost)}</td></tr>)}
        {lost > 0 && <tr><td colSpan="4" className="muted" style={{ color: '#ff8a80' }}>Lost to enemy strikes: {lost} system{lost > 1 ? 's' : ''} worth {usd(ledger.lostValue)} ({Object.entries(ledger.lost).map(([id, n]) => n + ' ' + STRUCTURES[id].name).join(', ')})</td></tr>}
        {empty && <tr><td colSpan="4" className="muted">Nothing placed yet</td></tr>}
      </tbody>
    </table>
  );
}

export function CostTab({ active }) {
  useTick(active);
  const { sim } = useGame();
  const { net, ledger, state } = sim;
  const launched = enemyCost(ledger.launched), destroyed = enemyCost(ledger.killed);
  const capex = ledger.capex, shots = ledger.consumables, spend = capex + shots;
  return (
    <>
      <div className="sys">
        <div className="sys-h"><b>Budget</b> <span className="muted">{usd(ECONOMY.budget)} for the whole run</span></div>
        <div className="budget-bar"><span className="b-capex" style={{ width: pct(capex) }} /><span className="b-shots" style={{ width: pct(shots) }} /></div>
        <div className="muted">Systems {usd(capex)} ({pct(capex)}) · shots fired {usd(shots)} ({pct(shots)}) · <b>left {usd(state.budget)}</b></div>
      </div>
      <div className="sys">
        <div className="sys-h"><b>Cost exchange</b></div>
        <div><span className="k">Enemy attack</span> {usd(launched)} launched, {usd(destroyed)} of it destroyed</div>
        <div><span className="k">Defence</span> {usd(spend)} ({usd(capex)} systems + {usd(shots)} shots)</div>
        <div><span className="k">Per $1 destroyed</span> {destroyed ? `$${(shots / destroyed).toFixed(2)} of shots · $${(spend / destroyed).toFixed(2)} including systems` : '–'}</div>
        <div className="muted">Under 1.00 means each dollar of shots destroys more than a dollar of enemy hardware. Jammers cost nothing per use; {sum(ledger.killedBy.jammer || {})} kills so far came from jamming.</div>
      </div>
      <div className="sys"><div className="sys-h"><b>Laydown</b></div><LaydownTable net={net} ledger={ledger} /></div>
      <div className="sys">
        <div className="sys-h"><b>Shots fired</b></div>
        <table className="mini">
          <thead><tr><th>Effector</th><th>Per shot</th><th>Shots</th><th>Spent</th><th>Kills</th><th>Per kill</th></tr></thead>
          <tbody>
            {Object.values(STRUCTURES).filter((d) => d.shotCost > 0).map((d) => {
              const fired = ledger.shots[d.id] || { n: 0, cost: 0 }, kills = sum(ledger.killedBy[d.id] || {});
              return <tr key={d.id}><td>{d.name}</td><td>{usd(d.shotCost)}</td><td>{fired.n}</td><td>{usd(fired.cost)}</td><td>{kills}</td><td>{kills ? usd(fired.cost / kills) : '–'}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="sys">
        <div className="sys-h"><b>Enemy attack</b> <span className="muted">cost to the attacker per drone</span></div>
        <table className="mini">
          <thead><tr><th>Drone</th><th>Each</th><th>Launched</th><th>Destroyed</th><th>Leaked</th><th>Left</th><th>Attack cost</th></tr></thead>
          <tbody>
            {Object.values(DRONES).map((d) => {
              const l = ledger.launched[d.id] || 0;
              return <tr key={d.id}><td><i style={{ background: hex(d.color) }} />{d.name}</td><td>{usd(d.cost)}</td><td>{l}</td><td>{ledger.killed[d.id] || 0}</td><td>{ledger.leaked[d.id] || 0}</td><td>{ledger.escaped[d.id] || 0}</td><td>{usd(l * d.cost)}</td></tr>;
            })}
          </tbody>
        </table>
        <div className="muted">Leaked = reached the site. Left = a spotter that withdrew after its time on station, or a strike that drifted away.</div>
      </div>
      <div className="sys">
        <div className="sys-h"><b>Where the enemy costs come from</b></div>
        {Object.values(DRONES).map((d) => (
          <div className="cost-src" key={d.id}>
            <b>{d.name}</b> {usd(d.cost)}: {d.costRef.note} <span className="conf">{d.costRef.confidence}</span><br /><SourceLinks sources={d.costRef.sources} />
          </div>
        ))}
      </div>
    </>
  );
}
