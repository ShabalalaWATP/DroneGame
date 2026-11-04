// Wires the simulation to the 3D view and runs the frame loop. React reads from here through useTick and never owns game state.

import * as THREE from 'three';
import { WORLD } from './sim/config/index.js';
import { createSimulation, SIM_STEP } from './sim/simulation.js';
import { createGameView } from './render/game-view.js';
import { createPlacement } from './render/placement.js';
import { createReplay } from './render/replay-view.js';
import { droneTemplate } from './render/models.js';
import { trackColour } from './render/belief-view.js';
import { view } from './render/view.js';
import { createApi } from './api/client.js';
import { createRunSaver } from './api/run-saver.js';
import { createPackStore } from './api/pack-store.js';
import { parseWorldId } from './sim/world-pack.js';

const PANEL_INTERVAL = 100; // ms between panel refreshes: panels never update per frame

// Seeds are saved, so they obey the limits the backend enforces.
// eslint-disable-next-line no-control-regex
export const cleanSeed = (text) => (text || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64) || '1';

export function createGame({ seed, terrainSeed, api = createApi(), storage = globalThis.localStorage }) {
  const sim = createSimulation({ seed, terrainSeed });
  const { state, net } = sim;

  // ---------- what panels subscribe to ----------
  const subscribers = new Set();
  let tick = 0;
  const bump = () => { tick++; for (const fn of subscribers) fn(); };
  const subscribe = (fn) => { subscribers.add(fn); return () => subscribers.delete(fn); };
  const getTick = () => tick;

  // Every command the UI sends refreshes the panels straight away, so controls never lag behind a click.
  const commands = Object.fromEntries(Object.entries(sim.commands).map(([name, fn]) => [name, (...args) => { const r = fn(...args); bump(); return r; }]));

  // ---------- game speed ----------
  const clock = { speed: 1, lastSpeed: 1 };
  const setSpeed = (s) => { if (s > 0) clock.lastSpeed = s; clock.speed = s; bump(); };

  const toastListeners = new Set();
  const toast = (msg) => { for (const fn of toastListeners) fn(msg); };
  sim.on('toast', toast);
  sim.on('gameOver', bump);

  // ---------- saving finished runs ----------
  const saver = createRunSaver({ api, storage, notify: toast, onChange: bump });
  let closing = false; // no request while closing: if it arrived, the kept copy would be saved a second time
  sim.on('runEnded', (run) => { if (closing) saver.keep(run); else saver.save(run); });
  // shortcut: a page restored from the back/forward cache keeps playing, but that run was already recorded when it closed. Clear runEnded on pageshow if that ever matters.
  const pageClosing = () => { closing = true; sim.endRun(); closing = false; };
  sim.on('sandbox', bump);

  // ---------- real map packs ----------
  const packs = createPackStore({ api });
  const usePack = ({ pack }) => sim.registerPack({ hash: pack.hash, header: pack.header, grids: pack.grids, features: pack.features });
  async function loadPack(entry) {
    const decoded = await packs.load(entry);
    usePack(decoded);
    return decoded;
  }
  // Make sure a saved world's pack is loaded. Returns why not, or null.
  async function ensureWorld(world) {
    const id = parseWorldId(world);
    if (!id || packs.get(id.hash)) return null;
    const { packs: all } = await packs.list();
    const entry = all.find((p) => p.hash.startsWith(id.hash));
    if (!entry) return 'The map pack for this laydown is not available here. Import or build it first.';
    await loadPack(entry);
    return null;
  }
  const mapSource = (world) => {
    const id = parseWorldId(world), found = id && packs.get(id.hash);
    return found ? { pictures: found.pictures, features: found.pack.features, credits: found.pack.header.credits } : null;
  };

  // ---------- filled in once the canvas exists ----------
  let gameView = null, placement = null, replay = null;
  const frameListeners = new Set();
  let tool = null; // structure id | 'sell' | null

  function setTool(t) {
    tool = tool === t ? null : t;
    if (placement) placement.refresh();
    bump();
  }

  function groundClick(x, z) {
    if (!tool || state.over || !state.started) return;
    if (tool === 'sell') { commands.sell(x, z); return; }
    const problem = commands.place(tool, x, z);
    if (problem) toast(problem);
  }

  // when the fusion node asks the operator to authorise an engagement, stop the clock so there is time to decide
  let pausedForApproval = false, simAcc = 0;
  sim.on('approvalRequest', () => { if (clock.speed > 0) { pausedForApproval = true; setSpeed(0); } });
  sim.on('approvalDecided', () => {
    if (pausedForApproval && !net.pendingRequests.length && !reviewing) { pausedForApproval = false; setSpeed(clock.lastSpeed || 1); }
  });

  // Reviewing stops the clock, and going back to live puts it back as it was. It never runs past a decision still waiting,
  // and a decision made during the review lets it run again.
  let reviewing = false, speedBeforeReview = 1;
  const reviewClock = {
    setPaused() { reviewing = true; speedBeforeReview = clock.speed; setSpeed(0); },
    resume() {
      reviewing = false;
      if (clock.speed > 0 || net.pendingRequests.length) return; // the player chose a speed during the review, or a decision is waiting
      setSpeed(pausedForApproval ? clock.lastSpeed || 1 : speedBeforeReview);
      pausedForApproval = false;
    },
  };
  sim.on('reset', ({ kept, begin, loading }) => {
    if (replay) replay.reset();
    if (gameView) gameView.clear();
    simAcc = 0; pausedForApproval = false;
    if (!begin) setSpeed(1);
    if (!begin && !loading) toast(kept ? 'Run reset: same laydown and seed' : 'New laydown: the site is empty');
    bump();
  });

  const debug = { frozen: false }; // scripted browser runs drive the simulation themselves
  const frameClock = new THREE.Clock();
  let lastBump = 0;
  function frame() {
    const real = Math.min(frameClock.getDelta(), 0.05);
    if (!debug.frozen && state.started && !state.over && clock.speed > 0) {
      // fixed-size steps: the same seed and laydown give the same run at any frame rate or speed
      simAcc += real * WORLD.timeScale * clock.speed;
      let n = 0;
      while (simAcc >= SIM_STEP && n < 400 && !state.over) { sim.step(); simAcc -= SIM_STEP; n++; }
      if (n >= 400) simAcc = 0;
    }
    gameView.update(real);
    for (const fn of frameListeners) fn(real);
    replay.update(real, gameView.camera);
    placement.update();
    gameView.draw();
    const now = performance.now();
    if (now - lastBump >= PANEL_INTERVAL) { lastBump = now; bump(); }
  }

  // Called once, when the canvas and label layer are in the page.
  function attach(canvas, labelLayer) {
    gameView = createGameView(canvas, labelLayer, sim, mapSource);
    placement = createPlacement({
      scene: gameView.scene, camera: gameView.camera, canvas, getWorldMesh: gameView.getWorldMesh, sim,
      getTool: () => tool, onGroundClick: groundClick,
    });
    replay = createReplay({
      scene: gameView.scene, rec: sim.rec, droneTemplate, makeLabel: gameView.labels.make, placeLabel: gameView.labels.place, trackColour,
      getStructures: () => sim.structures, labelOf: gameView.structures.labelOf, hideLive: gameView.hideLive,
      getLastSpeed: () => clock.lastSpeed, ...reviewClock,
    });
    gameView.start(frame);
    bump();
  }

  return {
    packs, loadPack, ensureWorld, mapSource, cursor: () => placement?.cursor() ?? null,
    sim, commands, clock, setSpeed, reviewClock, subscribe, getTick, bump, attach, debug, api, saver, pageClosing,
    getTool: () => tool, setTool,
    toast, onToast(fn) { toastListeners.add(fn); return () => toastListeners.delete(fn); },
    onFrame(fn) { frameListeners.add(fn); return () => frameListeners.delete(fn); },
    getReplay: () => replay,
    getView: () => gameView,
    // settings shared with the 3D view
    setViewOption(key, value) {
      view[key] = value;
      if (key === 'rings' && gameView) gameView.structures.setRingsVisible(value);
      if (key === 'planView' && gameView) gameView.viewFromAbove(value);
      if (['baseMap', 'mapRoads', 'mapGrid'].includes(key) && gameView) {
        gameView.refreshMap().then((live) => {
          if (live?.total && live.failed === live.total) { view.baseMap = 'os'; toast('The live map could not load: it needs an internet connection'); gameView.refreshMap(); bump(); }
          else if (live?.failed) toast(`${live.failed} of ${live.total} map tiles could not load`);
        });
      }
      bump();
    },
    // a figure was edited in the Sources tab: redraw anything built from it
    figuresChanged() {
      if (gameView) gameView.structures.remakeRings();
      if (placement) placement.refresh();
      bump();
    },
  };
}
