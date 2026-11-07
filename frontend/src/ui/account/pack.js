// Deployment packs: what one holds, what it costs, and how much of it is already on the map.

import { createContext, useContext } from 'react';
import { STRUCTURES, UNIT_LIMITS } from '../../sim/config/index.js';

// The signed-in account, for panels inside the game. Null in tests and anywhere outside the login gate.
export const AccountContext = createContext(null);
export const useAccount = () => useContext(AccountContext);

export const emptyAssets = () => ({ systems: [], vehicles: [], people: [] });
export const blankPack = () => ({ name: '', echelon: 'section', callsign: '', assets: emptyAssets() });

export function packTotals({ systems = [], vehicles = [], people = [] }) {
  const of = (role) => systems.filter((l) => STRUCTURES[l.id]?.role === role).reduce((n, l) => n + l.count, 0);
  return {
    sensors: of('sensor'),
    effectors: of('effector'),
    vehicles: vehicles.reduce((n, l) => n + l.count, 0),
    people: people.reduce((n, g) => n + g.count, 0),
    cost: systems.reduce((sum, l) => sum + (STRUCTURES[l.id]?.cost ?? 0) * l.count, 0),
  };
}

export const describeTotals = (t) => [
  [t.sensors, 'sensor'], [t.effectors, 'effector'], [t.vehicles, 'vehicle'], [t.people, 'person', 'people'],
].filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many ?? `${one}s`}`).join(' · ') || 'Empty';

// A line's count changed by `by`, keeping each id once and dropping lines that reach zero.
export function bump(lines, id, by) {
  const at = lines.findIndex((l) => l.id === id), count = Math.min((at < 0 ? 0 : lines[at].count) + by, UNIT_LIMITS.count);
  if (at < 0) return count > 0 ? [...lines, { id, count }] : lines;
  return count > 0 ? lines.map((l, i) => (i === at ? { id, count } : l)) : lines.filter((_, i) => i !== at);
}

// How many of each system and people group are still to place, counting what is on the map now.
export function remaining(assets, sim) {
  const placed = {};
  for (const s of sim.structures) placed[s.def.id] = (placed[s.def.id] ?? 0) + 1;
  const systems = assets.systems.map((l) => {
    const used = Math.min(placed[l.id] ?? 0, l.count); // each system has one line, so none is counted twice
    return { ...l, left: l.count - used };
  });
  const groups = sim.people.map((g) => `${g.count}:${g.protection}`);
  const people = assets.people.map((g) => {
    const at = groups.indexOf(`${g.count}:${g.protection}`);
    if (at >= 0) groups.splice(at, 1);
    return { ...g, left: at < 0 ? 1 : 0 };
  });
  return { systems, people };
}
