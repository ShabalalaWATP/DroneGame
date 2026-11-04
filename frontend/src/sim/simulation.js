// The simulation: rules only, with no rendering and no UI, so a full game can run in Node. It exposes three small surfaces:
//  - commands: everything that changes the game, logged by simulation step so a run can be reproduced
//  - state and collections: read by the rendering and the UI, which never change them
//  - on(event, fn): moments the rendering and UI need to hear about (explosion, toast, siteHit, gameOver, reset, terrain, sandbox...)

import { ADAPT, ECONOMY, FUSION, RESEARCHED, SITE, WAVES, WORLD, applyRangeScale, exportFigures, importFigures, resetAllFigures, resetFigure, setFigure } from './config/index.js';
import { seedAll } from './rng.js';
import { generateTerrain, terrainState } from './terrain.js';
import { bus } from './sapient.js';
import { createNetwork } from './network/index.js';
import { createRecorder, takeSnapshot, SNAPSHOT_EVERY } from './recorder.js';
import { runRecord } from './run-record.js';
import { u } from './units.js';
import { affordable, createLedger, resetLedger } from './economy.js';
import * as laydown from './laydown.js';
import { spawnDrone, removeDrone, updateDrones, spotterBonus } from './drones.js';
import { opticalLos, updateStructures, updateMissiles } from './effectors.js';
import { startWave, updateWaves } from './waves.js';
import { enterSandbox, launchSandboxWave, launchSandboxAttack, clearSandboxDrones } from './sandbox.js';

export const SIM_STEP = 0.05; // fixed simulation step in game seconds, so a run does not depend on frame rate

// shortcut: bus, clock, terrainState and the random streams are module-level singletons, so only one simulation can exist at a time. Pass them in if parallel runs are ever needed.
export function createSimulation({ seed = '1', terrainSeed = '1' } = {}) {
  const listeners = new Map();
  const emit = (event, payload) => { for (const fn of listeners.get(event) || []) fn(payload); };
  const on = (event, fn) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); };
  const off = (event, fn) => { listeners.get(event)?.delete(fn); };

  seedAll(seed);
  terrainState.data = generateTerrain(terrainSeed);

  const state = {
    seed, terrainSeed, health: SITE.maxHealth, budget: ECONOMY.budget, wave: 0, kills: 0, leaks: 0, hits: 0, time: 0, warnedWire: false,
    started: false, over: false, autoStart: false,
    waveActive: false, queue: [], waveTime: 0, autoTimer: -1,
    sandbox: false, sbLevel: 1, sbQueue: [], sbTime: 0, sbSpent: 0, // sandbox: attacks without consequences, before the first wave
  };
  const w = { state, drones: [], structures: [], missiles: [], ledger: createLedger(), emit, droneUid: 0, startLaydown: null, startFigures: null, runEnded: false };
  w.rec = createRecorder(() => state.time);
  w.net = createNetwork({
    drones: w.drones,
    getTime: () => state.time,
    monitoring: () => state.wave > 0 || state.sandbox, // the fusion node only chases lost contact once the attack has started
    onApprovalRequest() { emit('approvalRequest'); emit('toast', 'Engagement request: your decision is needed'); },
    onApprovalDecided() { emit('approvalDecided'); },
    onKillConfirmed(tr) { w.rec.event('confirmed', `Kill confirmed on ${tr.short}`); },
    // An effector decides whether it can take a task from the fusion node.
    acceptTask(s, d) {
      if (!d || d.dead) return { ok: false, reasons: ['nothing found at the cued position'] };
      if (s.pos.distanceTo(d.pos) > u(s.def.range)) return { ok: false, reasons: ['target outside effector range'] };
      if (!opticalLos(s, d)) return { ok: false, reasons: ['no line of sight to target'] };
      if (s.def.engages && !s.def.engages.includes(d.type)) return { ok: false, permanent: true, reasons: ['target outside engagement envelope (too fast or too high for this interceptor)'] };
      if (!affordable(w, s.def)) return { ok: false, reasons: ['insufficient budget for this shot'] };
      return { ok: true };
    },
  });
  w.net.init();

  let stepCount = 0;
  function step(dt = SIM_STEP) {
    state.time += dt;
    updateWaves(w, dt, beginRun);
    w.net.update(dt);
    updateStructures(w, dt);
    updateMissiles(w, dt);
    updateDrones(w, dt);
    if (++stepCount % SNAPSHOT_EVERY === 0) w.rec.push(takeSnapshot(w));
  }

  // Start the run again from the beginning, on the same seed. 'keep' rebuilds the laydown the run started with (or the
  // current one, before any wave); 'clear' starts empty; 'load' also starts empty, for a saved laydown about to be restored.
  function resetRun(mode = 'keep', begin = false) {
    endRun();
    const spec = mode === 'keep' ? w.startLaydown || laydown.captureLaydown(w) : null;
    w.startLaydown = null; w.runEnded = false;
    for (const s of w.structures.slice()) laydown.removeStructure(w, s);
    for (const d of w.drones.slice()) removeDrone(w, d);
    w.missiles.length = 0;
    Object.assign(state, {
      health: SITE.maxHealth, budget: ECONOMY.budget, wave: 0, kills: 0, leaks: 0, hits: 0, time: 0, warnedWire: false, over: false,
      waveActive: false, queue: [], waveTime: 0, autoTimer: -1, sandbox: false, sbLevel: 1, sbQueue: [], sbTime: 0, sbSpent: 0,
    });
    resetLedger(w.ledger);
    w.rec.clear(); stepCount = 0; w.droneUid = 0;
    log.length = 0;
    seedAll(state.seed);
    w.net.init();
    if (spec) laydown.restoreLaydown(w, spec);
    emit('reset', { kept: !!spec, begin, loading: mode === 'load' });
  }

  // The first wave starts from a clean rebuild, so time spent building (sensor sweeps, random draws, messages) cannot affect the run.
  // Time between later waves is an operator input: it changes the run's noise, and is captured by the command log.
  function beginRun() {
    resetRun('keep', true);
    state.warnedWire = true;
    w.startLaydown = laydown.captureLaydown(w);
    w.startFigures = exportFigures();
    // settings from before the rebuild that still apply, so the log alone can reproduce the run
    log.push({ step: 0, name: 'setAuthority', args: [FUSION.authority] }, { step: 0, name: 'setAutoStart', args: [state.autoStart] });
  }

  // A run that has started is reported once, however it ends.
  function endRun() {
    if (state.wave === 0 || w.runEnded) return;
    w.runEnded = true;
    emit('runEnded', runRecord(w, log, stepCount, digest()));
  }
  on('gameOver', endRun);

  // Replace the current run with a saved laydown, on the ground it was made for. Returns the reason if it can't.
  function loadLaydown(spec, world) {
    const problem = laydown.costProblem(spec);
    if (problem) return problem;
    endRun();
    setWorld(world);
    resetRun('load');
    laydown.restoreLaydown(w, spec);
    return null;
  }
  function setWorld(terrainSeed) {
    if (terrainSeed === state.terrainSeed) return;
    state.terrainSeed = terrainSeed;
    terrainState.data = generateTerrain(terrainSeed);
    emit('terrain');
  }

  // Nothing has happened yet, so re-seeding, restarting the network and rebuilding the ground are all safe.
  function deploy(newSeed, newTerrainSeed) {
    if (newSeed !== state.seed) { state.seed = newSeed; seedAll(newSeed); w.net.init(); }
    setWorld(newTerrainSeed);
    state.started = true;
  }

  // ---------- commands ----------
  const log = []; // [{ step, name, args }]: this run's operator inputs. Systems are logged by node id.
  const logged = (fns) => Object.fromEntries(Object.entries(fns).map(([name, fn]) => [name, (...args) => {
    const result = fn(...args);
    log.push({ step: stepCount, name, args: args.map((a) => (a && a.nodeId ? { node: a.nodeId } : a)) });
    return result;
  }]));
  const commands = logged({
    deploy,
    place: (id, x, z) => laydown.place(w, id, x, z),
    sell: (x, z) => laydown.sell(w, x, z),
    startWave: () => startWave(w, beginRun),
    reset: (mode) => resetRun(mode),
    setAutoStart: (on) => { state.autoStart = on; },
    setAuthority: (mode) => { FUSION.authority = mode; },
    decide: (id, approve) => w.net.decide(id, approve),
    injectFault: () => w.net.injectFault(),
    clearMessages: () => { bus.entries.length = 0; },
    wireNode: (s, kind) => laydown.wireNode(w, s, kind),
    wireFusion: (kind, on) => laydown.wireFusion(w, kind, on),
    setCellBand: (s, band) => laydown.setCellBand(w, s, band),
    setFusionCellBand: (band) => laydown.setFusionCellBand(w, band),
    toggleJamBand: (s, band, on) => laydown.toggleJamBand(w, s, band, on),
    configureUnit: (s, key, value) => laydown.configureUnit(w, s, key, value),
    renameUnit: (s, name, callsign) => laydown.renameUnit(w, s, name, callsign),
    autoWire: () => laydown.autoWire(w),
    clearAll: () => laydown.clearWires(w),
    enterSandbox: () => enterSandbox(w),
    exitSandbox: () => { resetRun('keep'); emit('toast', 'Sandbox closed: run reset, laydown kept'); },
    setSandboxLevel: (n) => { state.sbLevel = n; },
    launchSandboxWave: () => launchSandboxWave(w),
    launchSandboxAttack: (attack) => launchSandboxAttack(w, attack),
    clearSandboxDrones: () => clearSandboxDrones(w),
    loadLaydown,
    // figures change results, so changing them is logged like any other input
    setFigure: (kind, id, key, value) => setFigure(kind, id, key, value),
    resetFigure: (kind, id, key) => resetFigure(kind, id, key),
    resetAllFigures: () => resetAllFigures(),
    applyFigures: (figures) => { resetAllFigures(); importFigures(figures); },
    importFigures: (figures) => importFigures(figures),
    setRangeScale: (v) => { WORLD.rangeScale = v; applyRangeScale(); },
    setFpvGap: (v) => { WAVES.fpvGap = v; },
    setAdapt: (key, v) => { if (Object.hasOwn(RESEARCHED.adapt, key)) ADAPT[key] = v; },
  });

  // FNV-1a over the messages still kept (the newest bus.max at most), plus the headline numbers: a fingerprint of a run.
  function digest() {
    let h = 0x811c9dc5;
    const feed = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
    for (const e of bus.entries) feed(JSON.stringify(e.msg));
    feed(JSON.stringify([state.kills, state.health, state.budget, state.leaks, state.time, bus.seq, w.ledger]));
    return (h >>> 0).toString(16);
  }

  return {
    state, drones: w.drones, structures: w.structures, missiles: w.missiles, ledger: w.ledger, net: w.net, rec: w.rec, bus,
    commands, log, on, off, step, digest, endRun, stepCount: () => stepCount,
    currentLaydown: () => w.startLaydown || laydown.captureLaydown(w),
    run(steps) { state.started = true; for (let i = 0; i < steps && !state.over; i++) step(); },
    canPlace: (x, z, def) => !laydown.placementProblem(w, x, z, def),
    designLocked: () => laydown.designLocked(w),
    unwired: () => laydown.unwired(w),
    spotterBonus: () => spotterBonus(w),
    // for scripted experiments and tests: no budget or placement checks
    addStructure: (id, x, z) => laydown.addStructure(w, id, x, z),
    spawnDrone: (type, bearing, rolls) => spawnDrone(w, type, bearing, rolls),
  };
}
