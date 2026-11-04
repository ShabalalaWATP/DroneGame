// Wires the simulation to the 3D view and runs the frame loop. React reads from here through useTick and never owns game state.

import * as THREE from 'three';
import { WORLD } from './sim/config/index.js';
import { createSimulation, SIM_STEP } from './sim/simulation.js';
import { createGameView } from './render/game-view.js';
import { createPlacement, pickStructure, selectionFrom } from './render/placement.js';
import { createReplay } from './render/replay-view.js';
import { droneTemplate } from './render/models.js';
import { trackColour } from './render/belief-view.js';
import { view } from './render/view.js';
import { createApi } from './api/client.js';
import { createRunSaver } from './api/run-saver.js';

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

  // ---------- filled in once the canvas exists ----------
  let gameView = null, placement = null, replay = null;
  const frameListeners = new Set();
  let tool = null; // structure id | 'sell' | null
  let selectHinted = false; // the first placement says that systems can be clicked

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
    else if (!selectHinted) { selectHinted = true; toast('Placed. Click a name tag for details, or press Esc to stop placing'); }
  }

  // The system the Unit panel shows. It is view state, not a command, so it is not logged and cannot change a run.
  function select(s) { view.selected = s; bump(); }
  function getSelected() { // sold or destroyed systems drop out of the list
    if (view.selected && !sim.structures.includes(view.selected)) view.selected = null;
    return view.selected;
  }
  // Returns true if the click was about a system on the screen, so the ground under it should not be used as well.
  function mapClick(x, y) {
    if (!state.started) return false;
    const tagged = gameView.structures.labelAt(x, y);
    const pick = () => pickStructure(sim.structures, gameView.camera, x, y);
    if (tool === 'sell') { // the command takes a point on the ground, and the system's own position can only mean that system
      const s = !state.over && (tagged || pick());
      if (s) commands.sell(s.pos.x, s.pos.z);
      return !!s;
    }
    const chosen = selectionFrom(tool, tagged, pick);
    if (chosen === undefined) return false;
    selectHinted = true;
    select(chosen);
    return true;
  }
  // Starting wave 1 rebuilds every system, with a new id and perhaps a new callsign. Only its position is sure to be the same.
  sim.on('reset', () => {
    const was = view.selected;
    view.selected = was && sim.structures.find((s) => s.def.id === was.def.id && s.pos.x === was.pos.x && s.pos.z === was.pos.z) || null;
  });

  // when the fusion node asks the operator to authorise an engagement, stop the clock so there is time to decide
  let pausedForApproval = false, simAcc = 0;
  sim.on('approvalRequest', () => { if (clock.speed > 0) { pausedForApproval = true; setSpeed(0); } });
  sim.on('approvalDecided', () => {
    if (pausedForApproval && !net.pendingRequests.length && !(replay && replay.active())) { pausedForApproval = false; setSpeed(clock.lastSpeed || 1); }
  });
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
    gameView = createGameView(canvas, labelLayer, sim);
    placement = createPlacement({
      scene: gameView.scene, camera: gameView.camera, canvas, getWorldMesh: gameView.getWorldMesh, sim,
      getTool: () => tool, onGroundClick: groundClick, onSelect: mapClick,
    });
    replay = createReplay({
      scene: gameView.scene, rec: sim.rec, droneTemplate, makeLabel: gameView.labels.make, placeLabel: gameView.labels.place, trackColour,
      getStructures: () => sim.structures, labelOf: gameView.structures.labelOf, hideLive: gameView.hideLive,
      setSpeed, getLastSpeed: () => clock.lastSpeed, setPaused: () => setSpeed(0),
    });
    gameView.start(frame);
    bump();
  }

  return {
    sim, commands, clock, setSpeed, subscribe, getTick, bump, attach, debug, api, saver, pageClosing,
    getTool: () => tool, setTool, select, getSelected,
    toast, onToast(fn) { toastListeners.add(fn); return () => toastListeners.delete(fn); },
    onFrame(fn) { frameListeners.add(fn); return () => frameListeners.delete(fn); },
    getReplay: () => replay,
    getView: () => gameView,
    // settings shared with the 3D view
    setViewOption(key, value) {
      view[key] = value;
      if (key === 'rings' && gameView) gameView.structures.setRingsVisible(value);
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
