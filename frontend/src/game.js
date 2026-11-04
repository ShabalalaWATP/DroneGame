// Wires the simulation to the 3D view and runs the frame loop. React reads from here through useTick and never owns game state.

import * as THREE from 'three';
import { STRUCTURES, WORLD, firstClass } from './sim/config/index.js';
import { createSimulation, SIM_STEP } from './sim/simulation.js';
import { createGameView } from './render/game-view.js';
import { hereU } from './sim/units.js';
import { PLACING_PICK_PX, createPlacement, pickStructure, selectionFrom, slideToShow } from './render/placement.js';
import { createReplay } from './render/replay-view.js';
import { droneTemplate } from './render/models.js';
import { trackColour } from './render/belief-view.js';
import { view } from './render/view.js';
import { createApi } from './api/client.js';
import { createRunSaver } from './api/run-saver.js';
import { addZonePoint } from './zone.js';
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
  let tool = null; // structure id | 'sell' | 'zone' | null
  let refusal = null; // why the last placement was refused
  let selectHinted = false; // the first placement says that systems can be clicked

  const sizes = {}; // kind -> the size last picked, which the toolbar offers next
  function setTool(t) {
    tool = tool === t ? null : t;
    if (STRUCTURES[tool]) sizes[STRUCTURES[tool].kind] = tool;
    if (placement) placement.refresh();
    bump();
  }

  const toolChoice = (group) => sizes[group.kind] || firstClass(group);
  // A hotkey: the first press picks the kind, and pressing it again moves to the next size. With only one size, it switches off.
  function cycleTool(group) {
    const at = group.classes.indexOf(tool);
    if (at < 0) setTool(toolChoice(group));
    else setTool(group.classes.length > 1 ? group.classes[(at + 1) % group.classes.length] : tool);
  }

  function groundClick(x, z) {
    if (!tool || state.over || !state.started) return;
    if (tool === 'sell') { commands.sell(x, z); return; }
    if (tool === 'zone') { // a planning aid: it stays out of the simulation and its log
      view.zone = addZonePoint(view.zone, x, z);
      if (view.zone && view.zone.closed) setTool('zone'); else bump();
      return;
    }
    refusal = commands.place(tool, x, z);
    if (refusal) toast(refusal);
    else if (!selectHinted) { selectHinted = true; toast('Placed. Click a system for details, or press Esc to stop placing'); }
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
    const chosen = selectionFrom(tool, tagged, tool ? () => pickStructure(sim.structures, gameView.camera, x, y, innerWidth, innerHeight, PLACING_PICK_PX) : pick);
    if (chosen === undefined) return false;
    selectHinted = true;
    select(chosen);
    return true;
  }
  // If this ground point is hidden behind a panel or off the screen, slide the camera so it appears at (px, py) instead.
  function reveal(x, z, px, py) {
    if (!gameView) return;
    const { camera, controls } = gameView, y = hereU(x, z);
    const at = new THREE.Vector3(x, y, z).project(camera);
    const showing = document.elementFromPoint(((at.x + 1) / 2) * innerWidth, ((1 - at.y) / 2) * innerHeight);
    if (showing && showing.id === 'game') return;
    const slide = slideToShow(camera, x, y, z, px, py);
    if (!slide) return;
    camera.position.x += slide.x; camera.position.z += slide.z;
    controls.target.x += slide.x; controls.target.z += slide.z;
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
    if (!kept && !loading) view.zone = null;
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
      getTool: () => tool, onGroundClick: groundClick, onSelect: mapClick,
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
    getTool: () => tool, setTool, toolChoice, cycleTool, lastRefusal: () => refusal, select, getSelected, reveal,
    toast, onToast(fn) { toastListeners.add(fn); return () => toastListeners.delete(fn); },
    onFrame(fn) { frameListeners.add(fn); return () => frameListeners.delete(fn); },
    getReplay: () => replay,
    getView: () => gameView,
    // settings shared with the 3D view
    setViewOption(key, value) {
      view[key] = value;
      if (key === 'rings' && gameView) gameView.structures.setRingsVisible(value);
      if (key === 'osm' && gameView) {
        gameView.showOsm();
        if (value) {
          gameView.loadOsm().then(({ failed, total }) => {
            if (failed === total) { view.osm = false; gameView.showOsm(); toast('The map could not load: it needs an internet connection'); bump(); }
            else if (failed) toast(`${failed} of ${total} map tiles could not load`);
          });
        }
      }
      if (key === 'planView' && gameView) gameView.viewFromAbove(value);
      if (['baseMap', 'mapRoads', 'mapGrid', 'mapContours'].includes(key) && gameView) {
        view.mapLoading = true;
        gameView.refreshMap().then((live) => {
          if (live?.stale) return;
          view.mapLoading = false;
          bump();
          if (live?.total && live.failed === live.total) { view.baseMap = 'os'; toast('The live map could not load: it needs an internet connection'); gameView.refreshMap(); bump(); }
          else if (live?.failed) toast(`${live.failed} of ${live.total} map tiles could not load`);
        });
      }
      bump();
    },
    // Back to the start screen, to choose another world. A point makes it open on that place.
    leaveWorld(point = null) {
      if (tool) setTool(tool);
      Object.assign(view, { startAt: point, zone: null, me: null, selected: null, mapPanel: false, planView: false });
      if (gameView) gameView.viewFromAbove(false);
      commands.leave();
    },
    // a figure was edited in the Sources tab: redraw anything built from it
    figuresChanged() {
      if (gameView) gameView.structures.remakeRings();
      if (placement) placement.refresh();
      bump();
    },
  };
}
