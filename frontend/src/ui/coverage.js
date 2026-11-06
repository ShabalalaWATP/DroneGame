// How many sensors would see a drone of a given type at each spot. The plan map draws this, and the wizard scores the zone with it.

import { BUILD, DRONES, DRONE_CLASSES, WORLD, exportFigures } from '../sim/config/index.js';
import { terrainState } from '../sim/terrain.js';
import { inZone } from '../zone.js';

const caches = new WeakMap(); // sim -> drone type -> the last grid worked out

// For each cell, how many sensors would see a drone of this type there (it flies at that type's usual height).
export function coverageGrid(sim, threat) {
  const { net } = sim;
  const def = DRONES[threat];
  const agl = (def.alt[0] + def.alt[1]) / 2;
  // everything the answer depends on: node ids repeat after a reload, so they cannot tell two laydowns apart
  const key = [threat, sim.state.terrainSeed, JSON.stringify(exportFigures()), ...[...net.nodes.values()].map((n) => `${n.nodeId}:${n.pos.x}:${n.pos.z}:${n.def.range}:${n.def.mount}:${n.def.fov}:${n.def.panels}:${n.def.facing}`)].join('|');
  if (!caches.has(sim)) caches.set(sim, new Map());
  const cache = caches.get(sim), hit = cache.get(threat);
  if (hit && hit.key === key) return hit;
  const cell = 250, half = terrainState.data.R - 200, n = Math.round((2 * half) / cell);
  const counts = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) counts[j * n + i] = net.coverageAt(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell, agl, def);
  const grid = { key, n, cell, half, counts };
  cache.set(threat, grid);
  return grid;
}

// The share of the zone at least one sensor can see (0 to 1). With no zone drawn, it scores everything inside the build limit.
export function zoneShare(sim, threat, zone) {
  const g = coverageGrid(sim, threat), mpu = WORLD.metresPerUnit;
  const inside = zone && zone.closed ? (xm, zm) => inZone(zone.points, xm / mpu, zm / mpu) : (xm, zm) => Math.hypot(xm, zm) <= BUILD.maxDist;
  let cells = 0, seen = 0;
  for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) {
    if (!inside(-g.half + (i + 0.5) * g.cell, -g.half + (j + 0.5) * g.cell)) continue;
    cells++;
    if (g.counts[j * g.n + i] > 0) seen++;
  }
  return cells ? seen / cells : 0;
}

// Each of the four types, with its height and how much of the zone is seen, with the weakest first.
export function zoneScores(sim, zone) {
  return DRONE_CLASSES
    .map((def) => ({ id: def.id, name: def.name, height: Math.round((def.alt[0] + def.alt[1]) / 2), share: zoneShare(sim, def.id, zone) }))
    .sort((a, b) => a.share - b.share);
}
