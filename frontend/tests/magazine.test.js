// Magazines, storage and reloading, against the real simulation. These limit firing on top of the budget.

import { beforeEach, describe, expect, it } from 'vitest';
import { STRUCTURES, resetAllFigures } from '../src/sim/config/index.js';
import { canFire, canResupply, magazineWord, resupplyNeed, updateMagazine, useRound } from '../src/sim/magazine.js';
import { createSimulation } from '../src/sim/simulation.js';
import { MIXED, playWave, setUp } from './support/scenarios.js';

let sim;
const notes = [];
const w = () => ({ state: sim.state, rec: sim.rec, emit: (event, text) => notes.push(text) });
const place = (id) => sim.addStructure(id, 25, 0);
const emptyMagazine = (s) => { for (let n = s.rounds; n > 0; n--) useRound(w(), s); };
// Starting the first wave rebuilds every system, so the units to change are only known after it.
const begin = (laydown, id) => {
  setUp(sim, { seed: '1', laydown });
  sim.state.warnedWire = true;
  sim.commands.startWave();
  return sim.structures.filter((u) => u.def.id === id);
};
const finishWave = () => { for (let n = 0; sim.state.waveActive && !sim.state.over && n < 60000; n += 200) sim.run(200); };

beforeEach(() => {
  resetAllFigures();
  notes.length = 0;
  sim = createSimulation({ seed: '1', terrainSeed: '1' });
});

describe('a launcher', () => {
  it('comes with the rounds its type carries, and has fired none', () => {
    const s = place('missile');
    expect([s.rounds, s.storage, s.fired, s.reload]).toEqual([STRUCTURES.missile.magazine, STRUCTURES.missile.storage, 0, 0]);
    expect(canFire(s)).toBe(true);
  });

  it('every launcher and laser has a magazine, a reload time and a price per round', () => {
    for (const def of Object.values(STRUCTURES).filter((d) => d.role === 'effector' && d.fire !== 'jam')) {
      expect(def.magazine, def.id).toBeGreaterThan(0);
      expect(def.reloadTime, def.id).toBeGreaterThan(0);
      expect(def.shotCost, def.id).toBeGreaterThan(0);
    }
  });

  it('counts down as it fires, and cannot fire while reloading', () => {
    const s = place('missile');
    useRound(w(), s);
    expect([s.rounds, s.fired]).toEqual([3, 1]);
    expect(magazineWord(s, s.def)).toBe('Ready');
    useRound(w(), s); useRound(w(), s);
    expect(magazineWord(s, s.def)).toBe('LOW');
    useRound(w(), s);
    expect(s.reload).toBe(STRUCTURES.missile.reloadTime);
    expect(magazineWord(s, s.def)).toBe('Reloading');
    expect(canFire(s)).toBe(false);
  });

  it('refills the magazine from storage once the reload is over', () => {
    const s = place('missile');
    emptyMagazine(s);
    updateMagazine(w(), s, s.def.reloadTime - 1);
    expect(s.rounds).toBe(0);
    updateMagazine(w(), s, 1);
    expect([s.rounds, s.storage, s.reload]).toEqual([4, 4, 0]);
    expect(canFire(s)).toBe(true);
  });

  it('loads what is left when storage cannot fill the magazine', () => {
    const s = place('missile');
    s.storage = 2;
    emptyMagazine(s);
    updateMagazine(w(), s, s.def.reloadTime);
    expect([s.rounds, s.storage]).toEqual([2, 0]);
  });

  it('says so when magazine and storage are both gone, and stays empty', () => {
    const s = place('missile');
    s.storage = 0;
    emptyMagazine(s);
    expect(magazineWord(s, s.def)).toBe('EMPTY');
    expect(s.reload).toBe(0);
    expect(notes[0]).toContain('out of rounds');
    expect(sim.rec.events.at(-1).type).toBe('empty');
    expect(canFire(s)).toBe(false);
  });

  it('does not use up storage in the sandbox', () => {
    const s = place('missile');
    sim.state.sandbox = true;
    emptyMagazine(s);
    updateMagazine(w(), s, s.def.reloadTime);
    expect([s.rounds, s.storage]).toEqual([4, 8]);
  });

  it('refuses to engage while it cannot fire', () => {
    const [s] = begin([['radar', 600, 0], ['interceptor', 500, 0]], 'interceptor');
    s.rounds = 0; s.storage = 0;
    finishWave();
    expect(s.fired).toBe(0);
    expect(sim.ledger.shots.interceptor).toBeUndefined();
  });

  it('gives its target up when it runs dry, so another launcher can take it', () => {
    const [a, b] = begin([['radar', 600, 0], ['interceptor', 500, 0], ['interceptor', -500, 0]], 'interceptor');
    a.rounds = 1; a.storage = 0;
    finishWave();
    expect(a.fired).toBe(1);
    expect(b.fired).toBeGreaterThan(0);
    expect(a.task).toBeFalsy();
    expect(sim.bus.entries.some((e) => JSON.stringify(e.msg).includes('out of rounds'))).toBe(true);
  });

  it('fires again after a reload, in a real wave', () => {
    const [s] = begin([['radar', 600, 0], ['interceptor', 500, 0]], 'interceptor');
    s.rounds = 1;
    finishWave();
    expect(s.fired).toBeGreaterThan(1);
    expect(s.storage).toBeLessThan(STRUCTURES.interceptor.storage);
  });

  it('is restored by starting the run again', () => {
    setUp(sim, { seed: '1', laydown: MIXED });
    sim.structures.find((u) => u.def.magazine).rounds = 0;
    sim.commands.reset('keep');
    for (const s of sim.structures) if (s.def.magazine) expect(s.rounds).toBe(s.def.magazine);
  });

  it('still needs the budget: a full magazine cannot fire without money', () => {
    const [s] = begin([['radar', 600, 0], ['interceptor', 500, 0]], 'interceptor');
    sim.state.budget = 0;
    finishWave();
    expect(s.fired).toBe(0);
    expect(s.rounds).toBe(s.def.magazine);
  });
});

describe('resupply', () => {
  const between = (laydown, id) => {
    const units = begin(laydown, id);
    sim.state.waveActive = false; // no need to play it, and a small laydown could lose its systems if it did
    return units;
  };

  it('is only allowed between waves', () => {
    expect(canResupply(sim.state)).toBe(false); // before the first wave nothing has been fired
    const [s] = begin([['radar', 600, 0], ['missile', 500, 0]], 'missile');
    s.rounds = 1;
    sim.commands.resupply();
    expect(s.rounds).toBe(1);
    sim.state.waveActive = false;
    sim.commands.resupply();
    expect(s.rounds).toBe(4);
  });

  it('charges for the rounds missing, fills magazine and storage, and finishes a reload', () => {
    const [s] = between([['missile', 500, 0]], 'missile');
    s.rounds = 0; s.storage = 2; s.reload = 20;
    expect(resupplyNeed(sim.structures)).toEqual({ rounds: 10, cost: 2000000 });
    const budget = sim.state.budget, spent = sim.ledger.consumables;
    sim.commands.resupply();
    expect([s.rounds, s.storage, s.reload, s.prepaid]).toEqual([4, 8, 0, 10]);
    expect(sim.state.budget).toBe(budget - 2000000);
    expect(sim.ledger.consumables).toBe(spent + 2000000);
    expect(resupplyNeed(sim.structures).rounds).toBe(0);
  });

  it('never charges twice for a round', () => {
    const [s] = between([['radar', 600, 0], ['interceptor', 500, 0]], 'interceptor');
    s.rounds = 11;
    sim.commands.resupply();
    const prepaid = s.prepaid;
    expect(prepaid).toBeGreaterThan(0);
    const budget = sim.state.budget;
    sim.commands.startWave();
    const before = s.fired;
    for (let n = 0; sim.state.waveActive && s.fired < before + prepaid && n < 60000; n += 20) sim.run(20);
    expect(s.fired - before).toBeLessThanOrEqual(prepaid);
    expect(s.prepaid).toBe(prepaid - (s.fired - before));
    expect(sim.state.budget).toBe(budget);
  });

  it('a prepaid round can be fired with an empty budget', () => {
    const [s] = between([['radar', 600, 0], ['interceptor', 500, 0]], 'interceptor');
    s.prepaid = 3;
    sim.state.budget = 0;
    sim.commands.startWave();
    finishWave();
    expect(s.prepaid).toBeLessThan(3);
    expect(sim.state.budget).toBe(0);
  });

  it('fills the emptiest launcher first when the budget runs short, and says so', () => {
    const [a, b] = between([['missile', 500, 0], ['missile', -500, 0]], 'missile');
    a.rounds = 4; a.storage = 4;
    b.rounds = 0; b.storage = 0;
    sim.state.budget = 400000; // two missiles
    const toasts = [];
    sim.on('toast', (text) => toasts.push(text));
    sim.commands.resupply();
    expect([b.rounds, b.storage]).toEqual([2, 0]);
    expect([a.rounds, a.storage]).toEqual([4, 4]);
    expect(sim.state.budget).toBe(0);
    expect(toasts.at(-1)).toContain('could not cover another 14');
  });

  it('moves rounds from storage to the magazine for free when there is no money', () => {
    const [s] = between([['missile', 500, 0]], 'missile');
    s.rounds = 1; s.storage = 5;
    sim.state.budget = 0;
    sim.commands.resupply();
    expect([s.rounds, s.storage]).toEqual([4, 2]);
  });

  it('is free in the sandbox, and leaves the laser alone', () => {
    sim.state.started = true;
    const m = place('missile'), l = sim.addStructure('laser', -25, 0);
    sim.state.sandbox = true;
    m.rounds = 0; m.storage = 0; l.rounds = 10;
    const budget = sim.state.budget;
    expect(resupplyNeed([l]).rounds).toBe(0);
    sim.commands.resupply();
    expect([m.rounds, m.storage, m.prepaid]).toEqual([4, 8, 0]);
    expect(l.rounds).toBe(10);
    expect(sim.state.budget).toBe(budget);
  });

  it('is logged, so a run can be reproduced', () => {
    between([['missile', 500, 0]], 'missile');
    sim.commands.resupply();
    expect(sim.log.at(-1).name).toBe('resupply');
  });
});

describe('a laser', () => {
  it('stores seconds of beam, recharges only while not firing, and locks out when drained', () => {
    const s = place('laser');
    useRound(w(), s);
    expect(s.rounds).toBe(299);
    s.beamOn = true;
    updateMagazine(w(), s, 10);
    expect(s.rounds).toBe(299);
    s.beamOn = false;
    updateMagazine(w(), s, 0.5);
    expect(s.rounds).toBeCloseTo(299.5);
    s.rounds = 1;
    useRound(w(), s);
    expect(canFire(s)).toBe(false);
    expect(s.reload).toBe(s.def.reloadTime);
    updateMagazine(w(), s, s.def.reloadTime);
    expect(s.rounds).toBe(s.def.magazine);
    expect(canFire(s)).toBe(true);
  });
});

describe('what has no rounds', () => {
  it('is never held back', () => {
    for (const id of ['radar', 'rf', 'camera', 'jammer']) expect(canFire(place(id))).toBe(true);
  });

  it('counts its own work: scans and detections for a sensor, time for a jammer', () => {
    setUp(sim, { seed: '1', laydown: [['radar', 600, 0], ['jammer', 500, 0]] });
    sim.state.warnedWire = true;
    playWave(sim);
    const radar = sim.structures.find((u) => u.def.id === 'radar'), jammer = sim.structures.find((u) => u.def.id === 'jammer');
    expect(radar.scanId).toBeGreaterThan(0);
    expect(radar.detections).toBeGreaterThan(0);
    expect(jammer.jamTime).toBeGreaterThan(0);
  });
});

describe('replay', () => {
  it('records the magazine, so rewinding shows the count at that moment', () => {
    setUp(sim, { seed: '1', laydown: [['radar', 600, 0], ['interceptor', 500, 0]] });
    sim.state.warnedWire = true;
    playWave(sim);
    const s = sim.structures.find((u) => u.def.id === 'interceptor');
    const first = sim.rec.frames[0].structs.find((f) => f.id === s.nodeId);
    expect(first.rounds).toBe(s.def.magazine);
    expect(first.fired).toBe(0);
  });
});
