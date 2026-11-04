// Wires the game together and runs the frame loop: the simulation, the 3D view that draws it, and the UI around it.

import * as THREE from 'three';
import { WORLD } from './sim/config/index.js';
import { createSimulation, SIM_STEP } from './sim/simulation.js';
import { money } from './sim/economy.js';
import { createGameView } from './render/game-view.js';
import { createPlacement } from './render/placement.js';
import { createReplay } from './render/replay-view.js';
import { droneTemplate } from './render/models.js';
import { trackColour } from './render/belief-view.js';
import { createToolbar } from './ui/toolbar.js';
import { createHud, toast } from './ui/hud.js';
import { createMinimap } from './ui/minimap.js';
import { initStartScreen, showGameOver, initControls, buildTuning, initSandboxPanel } from './ui/panels.js';
import { initDock } from './ui/sapient-ui.js';

const $ = (id) => document.getElementById(id);

// The scenario seed fixes every chance event: wave contents, sensor noise, message IDs. The terrain seed is separate, so you
// can change the attack without changing the ground.
const params = new URLSearchParams(location.search);
const sim = createSimulation({ seed: params.get('seed') || '1', terrainSeed: params.get('terrain') || '1' });
const { state, commands, net } = sim;

const gameView = createGameView($('game'), $('labels'), sim);
const hud = createHud(sim);
const toolbar = createToolbar({ sim, bar: $('toolbar'), toast, onToolChange: () => placement.refresh() });
const placement = createPlacement({
  scene: gameView.scene, camera: gameView.camera, canvas: $('game'), getWorldMesh: gameView.getWorldMesh, sim,
  getTool: toolbar.getTool, onGroundClick: toolbar.groundClick,
});
const minimap = createMinimap(sim, $('minimap-canvas'), gameView.camera, gameView.controls);

// ---------- game speed ----------
const clock = { speed: 1, lastSpeed: 1 };
function setSpeed(s) {
  if (s > 0) clock.lastSpeed = s;
  clock.speed = s;
  document.querySelectorAll('.speed').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === s));
}

const replay = createReplay({
  scene: gameView.scene, rec: sim.rec, droneTemplate, makeLabel: gameView.labels.make, placeLabel: gameView.labels.place, trackColour,
  getStructures: () => sim.structures, labelOf: gameView.structures.labelOf, hideLive: gameView.hideLive,
  setSpeed, getLastSpeed: () => clock.lastSpeed, setPaused: () => setSpeed(0),
});

// when the fusion node asks the operator to authorise an engagement, stop the clock so there is time to decide
let pausedForApproval = false, simAcc = 0;
sim.on('approvalRequest', () => { if (clock.speed > 0) { pausedForApproval = true; setSpeed(0); } });
sim.on('approvalDecided', () => {
  if (pausedForApproval && !net.pendingRequests.length && !replay.active()) { pausedForApproval = false; setSpeed(clock.lastSpeed || 1); }
});
sim.on('toast', toast);
sim.on('gameOver', () => showGameOver(sim));
sim.on('reset', ({ kept, begin }) => {
  replay.reset();
  gameView.clear();
  hud.forgetApprovals();
  simAcc = 0; pausedForApproval = false;
  if (!begin) { setSpeed(1); toast(kept ? 'Run reset: same laydown and seed' : 'New laydown: the site is empty'); }
});

initStartScreen(sim);
initControls(sim, gameView, setSpeed, () => clock);
initSandboxPanel(sim);
buildTuning();
initDock({
  net, drones: sim.drones, ledger: sim.ledger, state, network: { ...commands, unwired: sim.unwired }, designLocked: sim.designLocked, money,
  stepOnce: () => { state.started = true; sim.step(); }, pause: () => setSpeed(0), // for "step to next packet"
  // a figure was edited in the Sources tab: redraw anything built from it
  onFiguresChanged() { gameView.structures.remakeRings(); placement.refresh(); toolbar.rebuild(); buildTuning(); },
});

// ---------- main loop ----------
const debug = { sim, setSpeed, camera: gameView.camera, controls: gameView.controls, frozen: false }; // for the console and scripted browser runs
const frameClock = new THREE.Clock();
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
  minimap.draw();
  replay.update(real, gameView.camera);
  placement.update();
  hud.update();
  toolbar.update();
  gameView.draw();
}
gameView.start(frame);
window.game = debug;
