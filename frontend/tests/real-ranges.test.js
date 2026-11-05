// The researched ranges, the UK systems, and the radio path a jammer needs.

import { afterEach, describe, expect, it } from 'vitest';
import { DRONES, STRUCTURES, TOOLBAR, resetAllFigures } from '../src/sim/config/index.js';
import { jamReaches } from '../src/sim/drones.js';
import { reachFor } from '../src/sim/network/sensors.js';
import { terrainState } from '../src/sim/terrain.js';
import { u } from '../src/sim/units.js';
import { makeWorld } from '../src/sim/world.js';

const UK = ['radar_a400', 'radar_giraffe', 'jammer_auds', 'missile_rr', 'missile_hvm', 'missile_paladin', 'missile_skysabre', 'laser_rfdew'];
const realTerrain = terrainState.data;
afterEach(() => { terrainState.data = realTerrain; resetAllFigures(); });

describe('the researched ranges', () => {
  it('scales radar reach as the A400 datasheet does', () => {
    const a400 = STRUCTURES.radar_a400;
    for (const [rcs, km] of [[0.1, 4.87], [1, 8.66], [10, 15.4]]) {
      expect(reachFor(a400, { rcs }) / 1000).toBeCloseTo(km, 0);
    }
  });

  it('puts every RF sensor and RF effector on a 9 m mast', () => {
    const rf = Object.values(STRUCTURES).filter((d) => d.kind === 'rf' || d.kind === 'jammer' || d.id === 'laser_rfdew');
    expect(rf.length).toBeGreaterThan(7);
    for (const d of rf) expect(d.mount).toBe(9);
  });

  it('lets a large RF detector hear further than the map, but never a silent drone', () => {
    expect(STRUCTURES.rf_l.range).toBe(14000);
    expect(reachFor(STRUCTURES.rf_l, DRONES.fw)).toBe(0);
  });
});

describe('the UK systems', () => {
  it('can all be bought from the toolbar, with a source or a stated assumption', () => {
    const offered = TOOLBAR.flatMap((g) => g.classes);
    for (const id of UK) {
      expect(offered).toContain(id);
      expect(STRUCTURES[id].product).toBeTruthy();
      expect(STRUCTURES[id].ref.confidence).toBeTruthy();
      expect(STRUCTURES[id].ref.cost.capex).toBeTruthy();
    }
  });

  it('fits the budget, even for Sky Sabre', () => {
    for (const id of UK) expect(STRUCTURES[id].cost).toBeLessThan(15000000);
  });
});

describe('a jammer needs a radio path', () => {
  const at = (x, y = 0) => ({ x, y, z: 0, distanceTo(o) { return Math.hypot(x - o.x, y - o.y, o.z); } });
  const jammer = { def: STRUCTURES.jammer, pos: at(0) }; // 1 km in an open field
  const drone = (m, agl = 60) => ({ def: DRONES.fpv, freq: 2.4e9, pos: at(u(m), u(agl)) });
  // Flat ground, with a bank of ground or trees running north to south from 200 m east.
  function ground({ ridge = 0, trees = 0 } = {}) {
    const R = 2000, cell = 20, N = Math.round((2 * R) / cell) + 1, heights = new Float32Array(N * N), canopy = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -R + i * cell;
      if (x >= 200 && x <= 300) heights[j * N + i] = ridge;
      if (x >= 200 && x <= 500) canopy[j * N + i] = trees;
    }
    terrainState.data = makeWorld({ seed: 't', N, cell, R, ground: heights, canopy, bldg: new Uint8Array(N * N), cover: new Uint8Array(N * N), buildings: [], lines: [], towers: [], station: [] });
  }

  it('reaches its open-field range with a clear path, and no further', () => {
    ground();
    expect(jamReaches(jammer, drone(900))).toBe(true);
    expect(jamReaches(jammer, drone(1100))).toBe(false);
  });

  it('is cut short by a hill', () => {
    ground({ ridge: 150 });
    expect(jamReaches(jammer, drone(900, 20))).toBe(false);
  });

  it('is cut short by trees when the drone flies low behind them', () => {
    ground({ trees: 20 });
    expect(jamReaches(jammer, drone(900, 60))).toBe(true);
    expect(jamReaches(jammer, drone(900, 10))).toBe(false);
  });
});
