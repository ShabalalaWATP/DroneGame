// Systems worked by a crew off the network: they cannot be wired, nothing tasks them, and they fire or jam at what they can see.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CREW, DRONES, STRUCTURES, TOOLBAR, resetAllFigures } from '../src/sim/config/index.js';
import { ENV } from '../src/sim/conditions.js';
import { createSimulation } from '../src/sim/simulation.js';
import { sightRange } from '../src/sim/crew.js';
import { jamReaches } from '../src/sim/jamming.js';
import { hereU, u } from '../src/sim/units.js';
import { setUp } from './support/scenarios.js';

const SPOT = [20, 20]; // scene units: open, flat ground near the station on terrain 1
let sim;
beforeEach(() => { sim = createSimulation(); setUp(sim, { seed: '1', laydown: [] }); });
afterEach(() => { ENV.now = 'day'; resetAllFigures(); });

// a drone hovering in view this far from the spot, at this height (m)
function droneAt(type, metres, height = 150) {
  const d = sim.spawnDrone(type, 0), x = SPOT[0] + u(metres), z = SPOT[1];
  d.pos.set(x, hereU(x, z) + u(height), z);
  d.def = { ...d.def, speed: 0 }; // it stays put while the crew deals with it
  return d;
}
const placed = (id) => sim.structures.find((s) => s.def.id === id); // starting the wave rebuilds the laydown
const stepFor = (seconds) => { for (let t = 0; t < seconds; t += 0.05) sim.step(); };

describe('the Gun row', () => {
  it('holds every gun, apart from the missiles', () => {
    const row = (kind) => TOOLBAR.find((r) => r.kind === kind).classes;
    expect(row('gun')).toEqual(expect.arrayContaining(['gun_s', 'gun_50', 'gun_hmg', 'missile_paladin', 'gun_skyranger', 'gun_gepard', 'gun_l']));
    for (const id of row('missile')) expect(STRUCTURES[id].kind).toBe('missile');
  });
});

describe('a crew off the network', () => {
  it('cannot be wired, and is not counted as unwired', () => {
    sim.commands.reset('clear');
    const gun = sim.addStructure('gun_50', ...SPOT);
    expect(sim.unwired()).not.toContain(gun);
    sim.commands.autoWire();
    expect(gun.uplink).toBeFalsy();
  });

  it('sees a drone 100 to 200 m off by eye, the bigger the further, and less at night', () => {
    const at = (type) => sightRange({ def: DRONES[type] });
    expect(at('fpv7inch')).toBeGreaterThanOrEqual(100); expect(at('fpv7inch')).toBeLessThan(120);
    expect(at('shahed136')).toBe(200);
    ENV.now = 'night';
    expect(at('shahed136')).toBe(200 * CREW.nightFloor);
  });

  it('keeps the guns with a radar of their own networked', () => {
    for (const id of ['missile_paladin', 'gun_hmg', 'gun_skyranger', 'gun_gepard', 'gun_l']) expect(STRUCTURES[id].networked).not.toBe(false);
    for (const id of ['gun_s', 'gun_50', 'jammer_mk4', 'jammer_skywiper', 'jammer_kvertus']) expect(STRUCTURES[id].networked).toBe(false);
    expect(STRUCTURES.gun_s.pk).toBeLessThan(STRUCTURES.gun_hmg.pk); // a gunner by eye hits far less than a networked station
  });

  it('fires at a drone in sight and reach, after reacting, with nothing tasking it', () => {
    sim.addStructure('gun_50', ...SPOT);
    sim.commands.startWave();
    const gun = placed('gun_50'), d = droneAt('fw', 150, 60); // a generic fixed-wing strike drone has no radio link to warn of
    stepFor(1);
    expect(gun.task).toMatchObject({ drone: d, crew: true });
    expect(sim.missiles.length).toBe(0); // still reacting
    stepFor(CREW.reaction + 1);
    expect(sim.missiles.some((m) => m.target === d) || d.dead).toBe(true);
  });

  it('is ready when warned, firing the moment a drone comes into sight', () => {
    sim.addStructure('gun_50', ...SPOT);
    sim.commands.startWave();
    const gun = placed('gun_50'), d = droneAt('fpv7inch', 300, 60); // heard on its radio link, not yet seen
    stepFor(CREW.reaction + 1);
    expect(gun.task).toBeNull();
    d.pos.x = SPOT[0] + u(90);
    stepFor(0.6);
    expect(gun.task).toMatchObject({ drone: d });
    expect(gun.task.activeAt).toBeLessThanOrEqual(sim.state.time);
  });

  it('leaves a drone beyond its reach alone', () => {
    sim.addStructure('gun_s', ...SPOT);
    sim.commands.startWave();
    const gun = placed('gun_s');
    droneAt('shahed136', STRUCTURES.gun_s.range + 200);
    stepFor(2);
    expect(gun.task?.drone?.type === 'shahed136').toBe(false);
  });

  it('switches a handheld jammer on while its soldier sees a drone, pointed at it', () => {
    sim.addStructure('jammer_kvertus', ...SPOT);
    sim.commands.startWave();
    const jam = placed('jammer_kvertus');
    expect(jam.mode).not.toBe('Jam');
    const d = droneAt('mavic3t', 350, 60); // too far to see, but its radio link sets off the soldier's detector
    stepFor(CREW.reaction + 1);
    expect(jam.mode).toBe('Jam');
    expect(jam.aim).toBeCloseTo(Math.atan2(d.pos.x - jam.pos.x, d.pos.z - jam.pos.z));
  });

  it('jams only what is in the beam it points', () => {
    sim.addStructure('jammer_dgtac', ...SPOT);
    sim.commands.startWave();
    const jam = placed('jammer_dgtac'), ahead = droneAt('fpv7inch', 300, 60), x = SPOT[0], z = SPOT[1] + u(300);
    const beside = sim.spawnDrone('fpv7inch', 0);
    beside.pos.set(x, hereU(x, z) + u(60), z); // a right angle away
    jam.aim = Math.atan2(ahead.pos.x - jam.pos.x, ahead.pos.z - jam.pos.z); jam.mode = 'Jam';
    expect(jamReaches(jam, ahead, 'control24')).toBe(true);
    expect(jamReaches(jam, beside, 'control24')).toBe(false);
  });

  it('keeps the standard jammers networked on tripods, with the DroneGuns themselves handheld', () => {
    for (const id of ['jammer_s', 'jammer']) expect(STRUCTURES[id].networked).not.toBe(false);
    for (const id of ['jammer_dgmk3', 'jammer_dgtac']) expect(STRUCTURES[id]).toMatchObject({ networked: false, handheld: true });
  });
});
