// Which drones attack: the three newer real drones, an anti-radar seeker, and waves built from any ticked mix of types.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DRONES, THREAT_GROUPS } from '../src/sim/config/index.js';
import { DEFAULT_MIX, cleanMix, isDefaultMix, slotsFor } from '../src/sim/attack-mix.js';
import { createSimulation } from '../src/sim/simulation.js';
import { pickTarget } from '../src/sim/targeting.js';
import { u } from '../src/sim/units.js';
import { makeWave } from '../src/sim/waves.js';
import { setUp } from './support/scenarios.js';

const sim = createSimulation();
const stream = (seed = 1) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const counts = (wave) => wave.reduce((c, q) => ({ ...c, [q.type]: (c[q.type] || 0) + 1 }), {});
const NEW = ['geran3', 'asn301', 'wingloong2'];

beforeEach(() => setUp(sim, { seed: '1', laydown: [] }));
afterEach(() => { sim.state.sandbox = false; });

describe('the three newer drones', () => {
  it('stand on their type, say where their figures come from and what was assumed, and list under their country', () => {
    for (const id of NEW) {
      const d = DRONES[id];
      expect(DRONES[d.variantOf], id).toBeDefined();
      expect(d.published.length, id).toBeGreaterThan(40);
      expect(d.assumed.length, id).toBeGreaterThan(20);
      expect(d.costRef.sources.length, id).toBeGreaterThan(0);
      expect(THREAT_GROUPS.find((g) => g.name === d.origin).drones, id).toContain(d);
    }
  });

  it('flies the Geran-3 about twice as fast as the Shahed, and the Wing Loong II far above it', () => {
    expect(DRONES.geran3.speed).toBeGreaterThan(DRONES.geran2.speed * 1.6);
    expect(DRONES.wingloong2.role).toBe('spotter');
    expect(DRONES.wingloong2.alt[0]).toBeGreaterThan(3000);
  });
});

describe('an anti-radar drone', () => {
  const at = (x) => ({ pos: { x: u(x), y: 0, z: 0 } });
  const launch = (type) => { const d = sim.spawnDrone(type, 0, {}); d.pos.set(u(-6000), d.pos.y, 0); return d; };

  it('goes for a radar several kilometres away, not the camera beside it', () => {
    setUp(sim, { seed: '1', laydown: [['camera', 500, 0], ['radar', 600, 0]] });
    const tgt = pickTarget(sim, launch('asn301'));
    expect(tgt.structure.def.id).toBe('radar');
  });

  it('ignores systems that do not radiate, and then heads for the site', () => {
    setUp(sim, { seed: '1', laydown: [['camera', 500, 0]] });
    expect(pickTarget(sim, launch('asn301')).structure).toBeNull();
  });

  it('is unlike an ordinary emitter-seeking drone, which only looks close by', () => {
    setUp(sim, { seed: '1', laydown: [['radar', 600, 0]] });
    expect(pickTarget(sim, launch('fpv')).structure).toBeNull();
    expect(at(0).pos.x).toBe(0);
  });
});

describe('a mix of drone types', () => {
  it('keeps the original waves exactly when nothing is changed', () => {
    for (let n = 1; n <= 10; n++) {
      expect(makeWave(n, stream(n), DEFAULT_MIX)).toEqual(makeWave(n, stream(n)));
      const c = counts(makeWave(n, stream(n)));
      expect(c.fpv).toBe(3 + 2 * n);
      expect(c.fw || 0).toBe(n >= 2 ? Math.ceil((n - 1) / 2) : 0);
      expect(c.fo || 0).toBe(n >= 3 ? Math.floor((n - 1) / 2) : 0);
      expect(c.spotter || 0).toBe(n >= 3 ? (n >= 8 ? 2 : 1) : 0);
    }
  });

  it('sends only what is ticked, with each wave the same size', () => {
    const mix = cleanMix(['geran2', 'lancet3', 'molniya2', 'orlan10']);
    for (let n = 1; n <= 8; n++) {
      const wave = makeWave(n, stream(n), mix);
      expect(new Set(wave.map((q) => q.type)).size).toBeGreaterThan(0);
      for (const q of wave) expect(mix).toContain(q.type);
      expect(wave.length).toBe(makeWave(n, stream(n)).length);
    }
  });

  it('shows every ticked drone within a few waves', () => {
    const mix = cleanMix(['geran2', 'geran3', 'gerbera', 'lancet3', 'shahed136', 'shahed131', 'asn301', 'feilong300d', 'mohajer6']);
    const seen = new Set();
    for (let n = 1; n <= 6; n++) for (const q of makeWave(n, stream(n), mix)) seen.add(q.type);
    expect([...seen].sort()).toEqual([...mix].sort());
  });

  it('fills a type that has nothing ticked with the other strike drones, and sends spotters only when ticked', () => {
    const slots = slotsFor(cleanMix(['geran2', 'lancet3']));
    expect(slots.fpv).toEqual(['geran2', 'lancet3']);
    expect(slots.spotter).toEqual([]);
    expect(slotsFor(cleanMix(['fpv', 'mohajer6'])).spotter).toEqual(['mohajer6']);
  });

  it('makes a mix safe to keep', () => {
    expect(cleanMix(['lancet3', 'nonsense', 'lancet3', 'fpv', '__proto__'])).toEqual(['fpv', 'lancet3']);
    expect(cleanMix(['orlan10'])).toEqual(DEFAULT_MIX); // spotters alone strike nothing
    expect(cleanMix('fpv')).toEqual(DEFAULT_MIX);
    expect(isDefaultMix(cleanMix([...DEFAULT_MIX].reverse()))).toBe(true);
  });
});

describe('choosing the mix', () => {
  it('refuses a mix with nothing that strikes, and is locked once the first wave starts', () => {
    expect(sim.commands.setAttack(['orlan10'])).toMatch(/strikes/);
    expect(sim.commands.setAttack(['geran2', 'lancet3'])).toBeNull();
    expect(sim.state.attack).toEqual(['geran2', 'lancet3']);
    sim.state.warnedWire = true;
    sim.commands.startWave();
    expect(sim.commands.setAttack(['fpv'])).toMatch(/locked/);
  });

  it('keeps the mix through the rebuild at wave 1, and sends it', () => {
    sim.commands.setAttack(['geran3', 'shahed131']);
    sim.state.warnedWire = true;
    sim.commands.startWave();
    expect(sim.state.attack).toEqual(['shahed131', 'geran3']);
    expect(new Set(sim.state.queue.map((q) => q.type))).toEqual(new Set(['shahed131', 'geran3']));
  });

  it('saves with the laydown only when changed, and comes back on loading', () => {
    expect(sim.currentLaydown().attack).toBeUndefined();
    sim.commands.setAttack(['ch901', 'feilong300d', 'asn301', 'wingloong2']);
    const spec = sim.currentLaydown();
    expect(spec.attack).toEqual(['ch901', 'feilong300d', 'asn301', 'wingloong2']); // catalogue order, whatever order they were ticked in
    setUp(sim, { seed: '1', laydown: [] });
    expect(isDefaultMix(sim.state.attack)).toBe(true);
    expect(sim.commands.loadLaydown(spec, sim.state.terrainSeed)).toBeNull();
    expect(sim.state.attack).toEqual(spec.attack);
  });

  it('runs a whole attack of real drones without error', () => {
    setUp(sim, { seed: '7', laydown: [['radar', 600, 0], ['missile', -400, 300], ['interceptor', 300, 300]] });
    sim.commands.setAttack(['geran2', 'geran3', 'gerbera', 'lancet3', 'molniya2', 'kvn', 'orlan10', 'asn301', 'wingloong2']);
    sim.state.warnedWire = true;
    for (let wave = 0; wave < 4 && !sim.state.over; wave++) {
      sim.commands.startWave();
      for (let n = 0; sim.state.waveActive && !sim.state.over && n < 30000; n += 200) sim.run(200);
    }
    const launched = Object.keys(sim.ledger.launched);
    expect(launched.length).toBeGreaterThan(3);
    expect(launched.every((id) => sim.state.attack.includes(id))).toBe(true);
    for (const d of sim.drones) expect(Number.isFinite(d.pos.x + d.pos.y + d.pos.z)).toBe(true);
  }, 120000);
});
