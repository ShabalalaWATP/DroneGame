// The end-of-deployment report: how it ended, what was fired and jammed, what it stopped, what got through, what it cost and
// who was hurt. Everything comes from the ledger and the state, so it reads the same for a fixed site and a patrol.

import { DRONES, SITE, STRUCTURES } from './config/index.js';
import { enemyCost } from './economy.js';
import { wavesCompleted } from './run-record.js';

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const nameOf = (by) => STRUCTURES[by]?.name ?? (by === 'jammer' ? 'Jamming' : by);
const byCount = (a, b) => b.n - a.n;

export function deploymentReport(w) {
  const { state, ledger } = w;
  const intercepted = sum(ledger.killed);
  const fired = Object.entries(ledger.shots).map(([id, { n, cost }]) => ({
    id, name: STRUCTURES[id].name, kind: STRUCTURES[id].kind, beam: STRUCTURES[id].fire === 'beam', n, cost, kills: sum(ledger.killedBy[id] || {}),
  })).sort(byCount);
  const jammed = Object.entries(ledger.jamTime).map(([id, seconds]) => ({ id, name: STRUCTURES[id].name, seconds })).sort((a, b) => b.seconds - a.seconds);
  const killers = Object.entries(ledger.killedBy).map(([by, types]) => ({
    by, name: nameOf(by), n: sum(types),
    of: Object.entries(types).map(([type, n]) => ({ name: DRONES[type].name, n })).sort(byCount),
  })).sort(byCount);
  const spent = ledger.capex + ledger.consumables;
  return {
    outcome: state.ended ? 'ended' : w.patrol ? 'patrol' : 'site',
    waves: wavesCompleted(state),
    launched: sum(ledger.launched), intercepted, leaked: sum(ledger.leaked), left: sum(ledger.escaped),
    killers, fired, jammed, jamKills: sum(ledger.killedBy.jammer || {}),
    cost: {
      systems: ledger.capex, munitions: ledger.consumables, lost: ledger.lostValue, spent,
      enemy: enemyCost(ledger.launched), destroyed: enemyCost(ledger.killed),
      perIntercept: intercepted ? ledger.consumables / intercepted : null,
    },
    lost: Object.entries(ledger.lost).map(([id, n]) => ({ name: STRUCTURES[id].name, n })),
    health: Math.max(state.health, 0) / SITE.maxHealth,
    killed: state.killed, injured: state.injured, people: w.people.reduce((n, g) => n + g.count, 0),
  };
}
