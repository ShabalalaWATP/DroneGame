import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIGURE_FIELDS, PATROL, RESEARCHED, exportFigures, resetAllFigures } from '../src/sim/config/index.js';
import { createSimulation } from '../src/sim/simulation.js';
import { along, routeProblem } from '../src/sim/patrol.js';
import { pickTarget } from '../src/sim/targeting.js';
import { u } from '../src/sim/units.js';
import { play, setUp } from './support/scenarios.js';

// Scene units on terrain 1: a 400 m square of open, flat ground near the station, and one that runs into water.
const square = (cx, cz, r) => [[cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r]];
const ROUTE = square(20, 20, 10);
const WET = square(40, 40, 10);
const FOOT = PATROL.foot;

let sim;
beforeEach(() => { sim = createSimulation(); setUp(sim, { seed: '1', laydown: [] }); });
afterEach(() => resetAllFigures());

describe('the route', () => {
  it('accepts a loop on open ground', () => expect(routeProblem(ROUTE)).toBeNull());
  it('refuses water, the far side of the build zone and malformed waypoints', () => {
    expect(routeProblem(WET)).toMatch(/water/);
    expect(routeProblem(square(130, 0, 10))).toMatch(/within 2500 m/);
    expect(routeProblem([[1, 1]])).toMatch(/2 to 32/);
    expect(routeProblem([[1, 1], [2, 'x']])).toMatch(/2 to 32/);
    expect(routeProblem([[1, 1], [1, 1]])).toMatch(/no length/);
    expect(routeProblem('nonsense')).toMatch(/2 to 32/);
  });
  it('walks round the loop and back to the start', () => {
    const p = { route: ROUTE, ends: [0, 20, 40, 60, 80] };
    expect(along(p, 0)).toEqual({ x: 10, z: 10 });
    expect(along(p, 30)).toEqual({ x: 30, z: 20 });
    expect(along(p, 80)).toEqual({ x: 10, z: 10 });
    expect(along(p, -10)).toEqual({ x: 10, z: 20 });
  });
});

describe('setting a patrol', () => {
  it('adds the escort and the people, paid from the budget, and refunds them when cleared', () => {
    const before = sim.state.budget;
    expect(sim.commands.setPatrol(ROUTE)).toBeNull();
    const p = sim.getPatrol();
    expect(sim.structures.map((s) => s.def.id).sort()).toEqual([FOOT.effector, FOOT.sensor].sort());
    expect(sim.structures.every((s) => s.escort && s.uplink === 'starlink')).toBe(true);
    expect(sim.people).toEqual([p.group]);
    expect(p.group.count).toBe(FOOT.groupSize);
    expect(sim.state.budget).toBeLessThan(before);
    sim.commands.setPatrol(null);
    expect(sim.getPatrol()).toBeNull();
    expect(sim.structures).toHaveLength(0);
    expect(sim.people).toHaveLength(0);
    expect(sim.state.budget).toBe(before);
  });

  it('refuses a bad route, leaving nothing behind', () => {
    expect(sim.commands.setPatrol(WET)).toMatch(/water/);
    expect(sim.getPatrol()).toBeNull();
    expect(sim.structures).toHaveLength(0);
  });

  it('cannot be set beside a drawn area, or once the attack has started', () => {
    sim.commands.setZone(square(0, 0, 20));
    expect(sim.commands.setPatrol(ROUTE)).toMatch(/area to defend/);
    sim.commands.setZone(null);
    expect(sim.commands.setPatrol(ROUTE)).toBeNull();
    play(sim, 1);
    expect(sim.commands.setPatrol(null)).toMatch(/locked/);
    expect(sim.getPatrol()).not.toBeNull();
  });

  it('keeps its escort out of the sell tool', () => {
    sim.commands.setPatrol(ROUTE);
    const s = sim.getPatrol().sensor;
    sim.commands.sell(s.pos.x, s.pos.z);
    expect(sim.structures).toContain(s);
  });
});

describe('walking', () => {
  beforeEach(() => sim.commands.setPatrol(ROUTE));

  it('waits for the attack, then walks at its speed with the escort ahead and behind', () => {
    sim.run(100);
    expect(sim.getPatrol().dist).toBe(0);
    sim.commands.startWave();
    sim.run(200);
    const p = sim.getPatrol(), metres = p.dist * 20;
    expect(metres).toBeCloseTo(FOOT.walkSpeed * 200 * 0.05, 3);
    const at = along(p, p.dist);
    expect(p.group.x).toBeCloseTo(at.x); expect(p.group.z).toBeCloseTo(at.z);
    expect(p.sensor.pos.x).toBeCloseTo(along(p, p.dist + u(FOOT.escortGap)).x);
    expect(p.effector.pos.x).toBeCloseTo(along(p, p.dist - u(FOOT.escortGap)).x);
    expect(sim.state.zoneCentre).toEqual(at); // spotters orbit it
  });

  it('halts while its weapon is engaging', () => {
    sim.commands.startWave();
    const p = sim.getPatrol();
    sim.spawnDrone('fw', 0);
    for (let n = 0; n < 6000 && !p.effector.task; n++) sim.step();
    expect(p.effector.task).toBeTruthy();
    const held = p.dist;
    sim.step();
    expect(p.halted).toBe(true);
    expect(p.dist).toBe(held);
  });

  it('is what strike drones go for', () => {
    const fw = sim.spawnDrone('fw', 0);
    expect(pickTarget({ structures: sim.structures, patrol: sim.getPatrol() }, fw)).toMatchObject({ x: sim.getPatrol().group.x, patrol: true });
  });
});

describe('a whole run', () => {
  it('is struck, can cause casualties, and plays out the same every time', () => {
    const digests = [0, 1].map(() => {
      setUp(sim, { seed: '1', laydown: [] });
      sim.commands.setPatrol(ROUTE);
      play(sim, 4);
      return sim.digest();
    });
    expect(digests[0]).toBe(digests[1]);
    expect(sim.rec.events.some((e) => e.text.endsWith('hit the patrol'))).toBe(true);
    expect(sim.state.casualties).toBeGreaterThan(0);
  }, 60000);

  it('lands a small drone among the people, not where it was when it came within reach', () => {
    sim.commands.setPatrol(ROUTE);
    sim.commands.startWave();
    sim.commands.setFigure('drones', 'fw', 'casualtyRadius', 25);
    const { group } = sim.getPatrol(), d = sim.spawnDrone('fw', 0);
    d.pos.set(group.x + u(29), d.pos.y, group.z); // inside the 30 m strike distance, beyond its 25 m casualty radius
    sim.step();
    expect(sim.state.leaks).toBe(1);
    expect(sim.state.casualties).toBeGreaterThan(0);
  });

  it('saves as its route, and is rebuilt from it', () => {
    sim.commands.setPatrol(ROUTE);
    const spec = sim.currentLaydown();
    expect(spec.patrol).toEqual(ROUTE);
    expect(spec.structures).toEqual([]);
    expect(spec.people).toBeUndefined();
    sim.commands.reset('clear');
    sim.state.started = true;
    expect(sim.commands.loadLaydown(spec, '1')).toBeNull();
    expect(sim.getPatrol().route).toEqual(ROUTE);
    expect(sim.structures).toHaveLength(2);
    sim.commands.reset('keep');
    expect(sim.getPatrol().route).toEqual(ROUTE);
    expect(sim.people).toHaveLength(1);
  });

  it('leaves out a saved route that is no longer walkable', () => {
    const spec = { ...sim.currentLaydown(), patrol: WET };
    expect(sim.commands.loadLaydown(spec, '1')).toBeNull();
    expect(sim.getPatrol()).toBeNull();
  });
});

describe('figures', () => {
  it('labels every patrol figure as an assumption, and leaves saved sets as they were until one is edited', () => {
    for (const key of Object.keys(RESEARCHED.patrol.foot)) expect(FIGURE_FIELDS[key].basis).toBe('assumption');
    expect(exportFigures().patrol).toBeUndefined();
    sim.commands.setFigure('patrol', 'foot', 'walkSpeed', 2);
    expect(exportFigures().patrol).toEqual({ foot: { walkSpeed: 2 } });
  });
});
