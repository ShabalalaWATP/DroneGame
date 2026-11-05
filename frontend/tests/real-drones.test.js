// The real drones: their data is well formed, they fly in the sandbox, and adding them changes nothing about the waves.

import { beforeEach, describe, expect, it } from 'vitest';
import { DRONES, DRONE_CLASSES, FIGURE_FIELDS, RESEARCHED, STRUCTURES, THREAT_GROUPS, resetAllFigures } from '../src/sim/config/index.js';
import { REAL_DRONES } from '../src/sim/config/real-drones.js';
import { createSimulation } from '../src/sim/simulation.js';
import { makeWave } from '../src/sim/waves.js';
import { answer, reachAgainst, systemFor } from '../src/ui/assistant/guide.js';
import { MIXED, setUp } from './support/scenarios.js';

const real = Object.keys(REAL_DRONES).map((id) => DRONES[id]);
beforeEach(() => resetAllFigures());

describe('the data', () => {
  it.each(real.map((d) => [d.id, d]))('%s is complete and cites its sources', (_, d) => {
    expect(DRONE_CLASSES.map((c) => c.id)).toContain(d.variantOf);
    expect(d.name).not.toBe(DRONES[d.variantOf].name);
    expect(d.label.length).toBeGreaterThan(0);
    expect(d.published.length).toBeGreaterThan(0);
    expect(d.usedBy.length).toBeGreaterThan(0);
    expect(d.speed).toBeGreaterThan(0);
    expect(d.alt[0]).toBeLessThan(d.alt[1]);
    expect(d.cost).toBeGreaterThan(0);
    expect(d.costRef.note.length).toBeGreaterThan(0);
    expect(d.costRef.sources.length).toBeGreaterThan(0);
    for (const s of d.costRef.sources) expect(new URL(s.url).protocol).toBe('https:');
  });
  it('spells out every generic type', () => {
    expect(DRONE_CLASSES.map((d) => d.name)).toEqual(['Fixed-wing spotter drone', 'Fibre-optic strike drone', 'First-person-view strike drone', 'Fixed-wing strike drone']);
    for (const d of Object.values(DRONES)) expect(d.label).not.toMatch(/^(FO|FW|FPV|SPT)$/);
  });
  it('groups every drone exactly once, for the pickers', () => {
    const grouped = THREAT_GROUPS.flatMap((g) => g.drones.map((d) => d.id));
    expect(grouped.sort()).toEqual(Object.keys(DRONES).sort());
    expect(THREAT_GROUPS.map((g) => g.name)).toEqual(['Generic types', 'Russia', 'Iran', 'China', 'Commercial off the shelf']);
    for (const g of THREAT_GROUPS) expect(g.drones.length).toBeGreaterThan(0);
  });
  it('keeps the generic types to the damage the rule was scaled from', () => {
    expect(DRONES.fpv.damage).toBe(12);
    expect(DRONES.fw.damage).toBe(30);
    expect(DRONES.geran2.damage).toBeGreaterThan(DRONES.lancet3.damage);
    expect(DRONES.lancet3.damage).toBeGreaterThan(DRONES.mavic3.damage);
  });
  it('can be tuned like any other figure', () => {
    expect(RESEARCHED.drones.geran2.speed).toBe(DRONES.geran2.speed);
    expect(FIGURE_FIELDS.speed).toBeDefined();
  });
});

describe('in play', () => {
  const armed = () => {
    const sim = createSimulation({ seed: '1', terrainSeed: '1' });
    setUp(sim, { seed: '1', laydown: MIXED });
    sim.commands.enterSandbox();
    return sim;
  };

  it.each(real.map((d) => [d.id]))('%s launches and flies in the sandbox without error', (id) => {
    const sim = armed();
    sim.commands.launchSandboxAttack({ type: id, count: 2, bearingDeg: 'rand', gap: 0 });
    sim.run(200);
    const launched = sim.ledger.launched[id];
    expect(launched).toBe(2);
    expect(sim.state.health).toBe(100); // the sandbox still cannot be hurt
  }, 60000);

  it('a mix of real and generic drones runs the same way twice', () => {
    const go = () => {
      const sim = armed();
      for (const type of ['geran2', 'mavic3', 'kvn', 'fpv']) sim.commands.launchSandboxAttack({ type, count: 3, bearingDeg: 'rand', gap: 2 });
      sim.run(600);
      return sim.digest();
    };
    expect(go()).toBe(go());
  }, 60000);

  it('the waves still send only the four generic types', () => {
    const classes = new Set(DRONE_CLASSES.map((d) => d.id));
    let i = 0;
    const rng = () => { i = (i + 0.37) % 1; return i; };
    for (const n of [1, 3, 8, 12]) for (const q of makeWave(n, rng)) expect(classes.has(q.type)).toBe(true);
  });
});

describe('the rules of a type apply to its real drones', () => {
  it('interceptors can take what they can take of the type', () => {
    const interceptor = STRUCTURES.interceptor;
    expect(answer(DRONES.kvn, interceptor)).toBe(answer(DRONES.fo, interceptor));
    expect(answer(DRONES.mavic3, interceptor)).toBe(answer(DRONES.fpv, interceptor));
    expect(answer(DRONES.geran2, interceptor)).toBe('No');
  });
  it('an interceptor really does engage a real drone of a type it can take', () => {
    const sim = createSimulation({ seed: '1', terrainSeed: '1' });
    setUp(sim, { seed: '1', laydown: MIXED });
    sim.commands.enterSandbox();
    sim.commands.launchSandboxAttack({ type: 'kvn', count: 6, bearingDeg: 0, gap: 3 });
    sim.run(4000);
    expect(sim.ledger.launched.kvn).toBe(6);
    expect((sim.ledger.killed.kvn || 0) + (sim.ledger.leaked.kvn || 0) + (sim.ledger.escaped.kvn || 0)).toBeGreaterThan(0);
  }, 60000);
  it('the wizard plans against a real drone by its own figures', () => {
    expect(reachAgainst(STRUCTURES.radar_s, DRONES.mohajer6)).toBe(0); // flies 5 km up, and this radar never reaches that
    expect(systemFor('radar', [DRONES.mohajer6], 15e6).id).not.toBe('radar_s');
    expect(answer(DRONES.mohajer6, STRUCTURES.jammer_s)).toBe('Far');
    expect(systemFor('radar', [DRONES.geran2], 15e6).kind).toBe('radar');
    expect(reachAgainst(STRUCTURES.rf, DRONES.geran2)).toBe(0); // no radio link to hear
    expect(reachAgainst(STRUCTURES.rf, DRONES.mavic3)).toBeGreaterThan(0);
  });
});
