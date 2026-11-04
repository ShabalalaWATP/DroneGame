// What the wizard knows: which steps are done, and which weapon answers which drone. It only reads the game, and only what
// the player could see for themselves: the config and the laydown, never the wave queue or where drones really are.

import { BUILD, DRONES, STRUCTURES, WORLD } from '../../sim/config/index.js';
import { terrainState } from '../../sim/terrain.js';

export const STEP_IDS = ['zone', 'sensors', 'effectors', 'network', 'coverage', 'rehearse', 'refine', 'preflight'];

const placed = (sim, role) => sim.structures.filter((s) => s.def.role === role);
// One size of each kind: the guidance is about which kinds you need, and sizes do not change that.
const catalogue = (role) => Object.values(STRUCTURES).filter((d) => d.role === role && (d.size ?? 'M') === 'M');

// A short verdict for how this effector does against this drone, read from its rules so edits cannot make it wrong.
export function answer(drone, def) {
  if (def.fire === 'jam') return drone.jamResist >= 1 ? 'No' : drone.jamResist > 0.6 ? 'Hard' : drone.jamResist > 0 ? 'Part' : 'Yes';
  if (def.fire === 'beam') return drone.loiterDist > def.range ? 'Far' : drone.evade < 0.7 ? 'Slow' : 'Yes';
  if (def.engages && !def.engages.includes(drone.id)) return 'No';
  if (def.engagePolicy === 'fixed-wing' && drone.model !== 'fw') return 'Last';
  return 'Yes';
}
const COUNTS = new Set(['Yes', 'Slow', 'Part']);

export const effectorColumns = () => catalogue('effector');

// Drone types nothing in the laydown can answer yet, in catalogue order.
export function unanswered(sim) {
  const defs = placed(sim, 'effector').map((s) => s.def);
  return Object.values(DRONES).filter((d) => !defs.some((def) => COUNTS.has(answer(d, def))));
}

// The cheapest effector that clearly answers this drone.
export const effectorFor = (drone) => catalogue('effector').filter((def) => answer(drone, def) === 'Yes').sort((a, b) => a.cost - b.cost)[0];

// The first sensor of each kind in the catalogue, marked with whether that kind is in the laydown yet.
export function sensorChecklist(sim) {
  const have = new Set(placed(sim, 'sensor').map((s) => s.def.kind));
  const firsts = new Map();
  for (const def of catalogue('sensor')) if (!firsts.has(def.kind)) firsts.set(def.kind, def);
  return [...firsts.values()].map((def) => ({ def, done: have.has(def.kind) }));
}

export function stepStatus(sim, zone) {
  const kinds = new Set(placed(sim, 'sensor').map((s) => s.def.kind));
  return {
    zone: !!(zone && zone.closed),
    sensors: kinds.has('radar') && kinds.size >= 2,
    effectors: unanswered(sim).length === 0,
    network: sim.structures.length > 0 && sim.unwired().length === 0 && sim.net.fusion.uplinks.size > 0,
  };
}

// The step the game is really at: the first one neither done nor already passed by the player.
export const firstOpen = (status, passed) => {
  const i = STEP_IDS.findIndex((id) => !status[id] && !passed[id]);
  return i < 0 ? STEP_IDS.length - 1 : i;
};

// Something the player had finished has come undone, such as selling their only radar. Returns its step id, or null.
export function undone(before, now) {
  return ['sensors', 'effectors', 'network'].find((id) => before[id] && !now[id]) || null;
}

// A spot for this system: high, open ground away from what is already there. Null if nowhere nearby will take it.
export function suggestSpot(sim, def) {
  const mpu = WORLD.metresPerUnit, data = terrainState.data;
  const reach = Math.min(Math.max(def.range * 0.6, BUILD.minDist * 2), BUILD.maxDist);
  let best = null, bestScore = -Infinity;
  for (let r = BUILD.minDist + 50; r <= reach; r += 150) {
    for (let a = 0; a < 24; a++) {
      const x = (r * Math.cos((a / 24) * 2 * Math.PI)) / mpu, z = (r * Math.sin((a / 24) * 2 * Math.PI)) / mpu;
      if (!sim.canPlace(x, z, def)) continue;
      const nearest = Math.min(BUILD.maxDist, ...sim.structures.map((s) => Math.hypot(s.pos.x - x, s.pos.z - z) * mpu));
      const score = data.groundAt(x * mpu, z * mpu) + nearest * 0.05 - (data.canopyAt(x * mpu, z * mpu) > 0 ? 30 : 0);
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    }
  }
  return best;
}
