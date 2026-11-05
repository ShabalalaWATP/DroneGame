// The wizard's logic and the zone, against a real simulation with no page. The wizard must only ever read the game.

import { beforeEach, describe, expect, it } from 'vitest';
import { BUILD, DRONES, STRUCTURES, resetAllFigures } from '../src/sim/config/index.js';
import { createSimulation } from '../src/sim/simulation.js';
import { coverageGrid, zoneScores, zoneShare } from '../src/ui/coverage.js';
import { STEP_IDS, answer, effectorFor, firstOpen, sensorChecklist, stepStatus, unanswered, undone } from '../src/ui/assistant/guide.js';
import { suggestSpot } from '../src/ui/assistant/spots.js';
import { addZonePoint, closeZone, inZone, ringZone, undoZonePoint, zoneFromSpec } from '../src/zone.js';
import { MIXED, play, setUp } from './support/scenarios.js';

const square = { points: [[-50, -50], [50, -50], [50, 50], [-50, 50]], closed: true };
let sim;
beforeEach(() => { resetAllFigures(); sim = createSimulation({ seed: '1', terrainSeed: '1' }); sim.state.started = true; });

describe('zone', () => {
  it('collects points, and closes on a click near the first or a double-click', () => {
    let zone = null;
    for (const [x, z] of [[0, 0], [50, 0], [50, 50]]) zone = addZonePoint(zone, x, z);
    expect(zone).toMatchObject({ closed: false, points: [[0, 0], [50, 0], [50, 50]] });
    expect(addZonePoint(zone, 1, 1).closed).toBe(true);
    expect(addZonePoint(zone, 50.5, 50.5).closed).toBe(true);
  });
  it('ignores a double-click before there are three points, and clicks off the ground', () => {
    const zone = addZonePoint(null, 0, 0);
    expect(addZonePoint(zone, 0.5, 0.5)).toBe(zone);
    expect(addZonePoint(zone, 999, 0)).toBe(zone);
  });
  it('starts again after a closed zone, and closes itself at the point limit', () => {
    expect(addZonePoint(square, 10, 10)).toEqual({ points: [[10, 10]], closed: false });
    let zone = null;
    for (let i = 0; i < 32; i++) zone = addZonePoint(zone, i * 5, (i % 2) * 40);
    expect(zone.closed).toBe(true);
    expect(zone.points.length).toBe(32);
  });
  it('only closes with three points, and undoes while drawing', () => {
    const two = { points: [[0, 0], [10, 0]], closed: false };
    expect(closeZone(two)).toBe(two);
    expect(closeZone(null)).toBe(null);
    expect(undoZonePoint(two).points).toEqual([[0, 0]]);
    expect(undoZonePoint(square)).toBe(square);
  });
  it('knows what is inside it', () => {
    expect(inZone(square.points, 0, 0)).toBe(true);
    expect(inZone(square.points, 60, 0)).toBe(false);
    const ring = ringZone(1000);
    expect(inZone(ring.points, 49, 0)).toBe(true);
    expect(inZone(ring.points, 51, 0)).toBe(false);
    expect(ring.points.length).toBeLessThanOrEqual(32);
  });
  it('travels with a saved laydown only once it is closed', () => {
    const spec = { structures: [] };
    expect(zoneFromSpec({ zone: square.points })).toEqual(square);
    expect(zoneFromSpec(spec)).toBeNull();
  });
});

describe('who answers which drone', () => {
  const { jammer, interceptor, missile, laser } = STRUCTURES;
  const { fpv, fo, fw } = DRONES;
  const spotter = Object.values(DRONES).find((d) => d.role === 'spotter');
  it('reads jamming from how each drone resists it', () => {
    expect(answer(fpv, jammer)).toBe('Yes');
    expect(answer(fo, jammer)).toBe('No');
    expect(answer(fw, jammer)).toBe('Part');
    expect(answer(spotter, jammer)).toBe('Hard');
  });
  it('knows interceptors cannot catch fixed wing, and missiles are saved for it', () => {
    expect(answer(fo, interceptor)).toBe('Yes');
    expect(answer(fw, interceptor)).toBe('No');
    expect(answer(fw, missile)).toBe('Yes');
    expect(answer(fpv, missile)).toBe('Last');
  });
  it('knows lasers are slow on evasive drones, and a small one cannot reach a distant spotter', () => {
    expect(answer(fpv, laser)).toBe('Slow');
    expect(answer(fo, laser)).toBe('Yes');
    expect(answer(spotter, laser)).toBe('Yes');
    expect(answer(spotter, STRUCTURES.laser_s)).toBe('Far');
  });
  it('picks the cheapest clear answer', () => {
    expect(effectorFor(fpv).id).toBe('jammer');
    expect(effectorFor(fo).id).toBe('interceptor');
    expect(effectorFor(fw).id).toBe('missile');
  });
  it('lists what the laydown cannot answer yet', () => {
    expect(unanswered(sim).length).toBe(Object.keys(DRONES).length);
    sim.addStructure('jammer', 30, 0);
    expect(unanswered(sim).map((d) => d.id)).toContain('fo');
    expect(unanswered(sim).map((d) => d.id)).not.toContain('fpv');
  });
});

describe('progress', () => {
  it('needs a radar and one other kind of sensor', () => {
    expect(stepStatus(sim, null).sensors).toBe(false);
    sim.addStructure('rf', 30, 0);
    expect(stepStatus(sim, null).sensors).toBe(false);
    sim.addStructure('radar', -30, 0);
    expect(stepStatus(sim, null).sensors).toBe(true);
    expect(sensorChecklist(sim).map((r) => [r.def.kind, r.done])).toEqual([['radar', true], ['rf', true], ['camera', false], ['acoustic', false]]);
  });
  it('needs everything wired, including the fusion node', () => {
    expect(stepStatus(sim, null).network).toBe(false);
    setUp(sim, { seed: '1', laydown: MIXED });
    const status = stepStatus(sim, square);
    expect(status).toEqual({ zone: true, sensors: true, effectors: true, network: true });
  });
  it('goes to the first step not done or passed', () => {
    expect(firstOpen({}, {})).toBe(0);
    expect(firstOpen({ zone: true }, { sensors: true })).toBe(2);
    expect(firstOpen({ zone: true, sensors: true, effectors: true, network: true }, { coverage: true, rehearse: true, refine: true })).toBe(STEP_IDS.indexOf('preflight'));
    expect(firstOpen({}, Object.fromEntries(STEP_IDS.map((id) => [id, true])))).toBe(STEP_IDS.length - 1);
  });
  it('notices when something finished comes undone', () => {
    expect(undone({ sensors: true }, { sensors: false })).toBe('sensors');
    expect(undone({ sensors: false }, { sensors: false })).toBeNull();
    expect(undone({ network: true }, { network: true })).toBeNull();
  });
});

describe('a good spot', () => {
  it('is always somewhere the game would allow', () => {
    for (const id of ['radar', 'rf', 'camera', 'jammer', 'missile']) {
      const def = STRUCTURES[id], spot = suggestSpot(sim, def);
      expect(sim.canPlace(spot.x, spot.z, def)).toBe(true);
      sim.commands.place(id, spot.x, spot.z);
    }
    expect(sim.structures.length).toBe(5);
  });
  it('is nowhere if the budget cannot cover it', () => {
    sim.state.budget = 0;
    expect(suggestSpot(sim, STRUCTURES.radar)).toBeNull();
  });
});

describe('zone coverage', () => {
  it('scores nothing with no sensors, and more with them', () => {
    expect(zoneShare(sim, 'fpv', square)).toBe(0);
    setUp(sim, { seed: '1', laydown: MIXED });
    expect(zoneShare(sim, 'fpv', square)).toBeGreaterThan(0);
    expect(zoneShare(sim, 'fpv', null)).toBeGreaterThan(0);
  });
  it('lists the weakest drone first, and keeps what it worked out', () => {
    setUp(sim, { seed: '1', laydown: MIXED });
    const scores = zoneScores(sim, square);
    expect(scores.length).toBe(Object.keys(DRONES).length);
    expect(scores[0].share).toBeLessThanOrEqual(scores[scores.length - 1].share);
    expect(coverageGrid(sim, 'fo')).toBe(coverageGrid(sim, 'fo'));
  });
  it('scores nothing for a zone too small to hold a cell', () => {
    expect(zoneShare(sim, 'fpv', { points: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]], closed: true })).toBe(0);
  });
  it('stays inside the build limit when no zone is drawn', () => {
    expect(BUILD.maxDist).toBeGreaterThan(0);
    expect(zoneShare(sim, 'fo', { points: [[0, 0]], closed: false })).toBe(zoneShare(sim, 'fo', null));
  });
});

describe('the wizard only reads the game', () => {
  const run = (look) => {
    const s = createSimulation({ seed: '7', terrainSeed: '3' });
    setUp(s, { seed: '7', laydown: MIXED });
    s.state.warnedWire = true;
    look(s);
    s.commands.startWave();
    for (let i = 0; i < 40 && s.state.waveActive; i++) { s.run(200); look(s); }
    play(s, 1);
    return s.digest();
  };
  it('gives the same run whether or not it is looking', () => {
    const untouched = run(() => {});
    const watched = run((s) => { stepStatus(s, square); unanswered(s); sensorChecklist(s); suggestSpot(s, STRUCTURES.camera); zoneScores(s, square); });
    expect(watched).toBe(untouched);
  }, 60000);
});
