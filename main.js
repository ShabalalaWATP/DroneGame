import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  WORLD, SITE, BUILD, TERRAIN, ECONOMY, FUSION, WAVES, COMMS, STRUCTURES, DRONES, ADAPT,
  makeWave, applyRangeScale,
} from './config.js';
import { createNetwork } from './network.js';
import { initDock } from './sapient-ui.js';
import { bus } from './sapient.js';
import { view } from './view.js';
import { seedAll, rand, gauss, waveStream } from './rng.js';
import { createRecorder, createReplay, SNAPSHOT_EVERY } from './replay.js';
import { generateTerrain, terrainState } from './terrain.js';
import { buildWorldView, drapedRing, makeHillshade } from './terrain-view.js';

const $ = (id) => document.getElementById(id);
const SIM_STEP = 0.05; // fixed simulation step in game seconds, so a run does not depend on frame rate

// The scenario seed fixes every chance event: wave contents, sensor noise, hit rolls, message IDs.
const seedParam = new URLSearchParams(location.search).get('seed') || '1';
seedAll(seedParam);
const u = (metres) => metres / WORLD.metresPerUnit;           // metres -> scene units
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STRUCT_SCALE = 3;                                       // structures are drawn larger than true size

// ---------- scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, u(12000), u(30000));
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 4000);
camera.position.set(0, 300, 380);
const controls = new OrbitControls(camera, canvas);
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 20;
controls.maxDistance = 1200;
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x203020, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(60, 120, 40);
scene.add(sun);

// ---------- terrain and the protected site ----------
// The terrain seed is separate from the scenario seed: change the attack without changing the ground.
const terrainSeedParam = new URLSearchParams(location.search).get('terrain') || '1';
const SITE_POS = new THREE.Vector3(0, 0, 0);
const SITE_TARGET = new THREE.Vector3(0, u(SITE.targetAlt), 0); // the station base is height 0
const siteMat = new THREE.MeshStandardMaterial({ color: 0x8aa0b4, roughness: 0.7, emissive: 0xff0000, emissiveIntensity: 0 });
const siteRing = drapedRing(u(SITE.radius), 0.5, 0xff5252, 0.6);
const buildRing = drapedRing(u(BUILD.maxDist), 0.8, 0x5c7bb0, 0.4);
scene.add(siteRing.mesh, buildRing.mesh);
let worldView = null;
function loadWorld(seed) {
  if (worldView) worldView.dispose();
  const data = generateTerrain(seed);
  terrainState.data = data;
  terrainState.hillshade = makeHillshade(data);
  worldView = buildWorldView(scene, data, siteMat);
  siteRing.update(0, 0);
  buildRing.update(0, 0);
}
loadWorld(terrainSeedParam);
const groundM = (xu, zu) => terrainState.data.groundAt(xu * WORLD.metresPerUnit, zu * WORLD.metresPerUnit); // metres
const hereU = (xu, zu) => groundM(xu, zu) / WORLD.metresPerUnit;                                         // scene units

// ---------- state ----------
const state = {
  seed: seedParam, terrainSeed: terrainSeedParam, health: SITE.maxHealth, budget: ECONOMY.budget, wave: 0, kills: 0, leaks: 0, hits: 0, time: 0, warnedWire: false,
  speed: 1, lastSpeed: 1, started: false, over: false,
  waveActive: false, queue: [], waveTime: 0, autoTimer: -1, flash: 0, showRings: true,
  sandbox: false, sbLevel: 1, sbQueue: [], sbTime: 0, sbSpent: 0, // sandbox: attacks without consequences, before the first wave
};
const drones = [], structures = [], missiles = [], effects = [];
// in the sandbox shots are free, and the enemy adapts to the level chosen there instead of to the wave number
const effWave = () => (state.sandbox ? state.sbLevel : state.wave);
const affordable = (def) => state.sandbox || state.budget >= (def.shotCost || 0);

// The cost ledger: what the defence has bought and fired, and what the attack has cost the enemy.
// Tallies are per drone type (launched, destroyed, leaked through to the site, left on their own) and per effector.
const ledger = {
  capex: 0,                  // spent on buying systems
  consumables: 0,            // spent on shots (interceptors, missiles, laser)
  shots: {},                 // effector id -> { n, cost }
  launched: {}, killed: {}, leaked: {}, escaped: {},   // drone type -> count
  killedBy: {},              // effector id (or 'jammer') -> { drone type -> count }
  terminals: { starlink: 0, cellular: 0 }, // network terminals bought (counted in capex)
  lost: {}, lostValue: 0,    // systems the enemy destroyed (id -> count) and what they were worth
};
const rec = createRecorder(); // history for pause and rewind
rec.now = () => state.time;
const tally = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };
const enemyCost = (counts) => Object.entries(counts).reduce((sum, [type, n]) => sum + n * DRONES[type].cost, 0);
const money = (v) => v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M` : v >= 1e4 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v).toLocaleString('en-US')}`;

// ---------- SAPIENT network ----------
let pausedForApproval = false;
const net = createNetwork({
  drones,
  getTime: () => state.time,
  monitoring: () => state.wave > 0 || state.sandbox, // the fusion node only chases lost contact once the attack has started
  // when the fusion node asks the operator to authorise an engagement, stop the clock so there is time to decide
  onApprovalRequest() {
    if (state.speed > 0) { pausedForApproval = true; setSpeed(0); }
    toast('Engagement request: your decision is needed');
  },
  onApprovalDecided() {
    if (pausedForApproval && !net.pendingRequests.length && !replay.active()) { pausedForApproval = false; setSpeed(state.lastSpeed || 1); }
  },
  onKillConfirmed(tr) { rec.event('confirmed', `Kill confirmed on ${tr.short}`); },
  // An effector decides whether it can take a task from the fusion node.
  acceptTask(s, d) {
    if (!d || d.dead) return { ok: false, reasons: ['target no longer exists'] };
    if (s.pos.distanceTo(d.pos) > u(s.def.range)) return { ok: false, reasons: ['target outside effector range'] };
    if (!opticalLos(s, d)) return { ok: false, reasons: ['no line of sight to target'] };
    if (s.def.engages && !s.def.engages.includes(d.type)) return { ok: false, permanent: true, reasons: ['target outside engagement envelope (too fast or too high for this interceptor)'] };
    if (!affordable(s.def)) return { ok: false, reasons: ['insufficient budget for this shot'] };
    return { ok: true };
  },
});
net.init();

// ---------- structure models ----------
function buildModel(id) {
  const def = STRUCTURES[id];
  const g = new THREE.Group();
  const parts = {};
  const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.3, emissive: c, emissiveIntensity: e });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.6, 16), mat(0x3a4048));
  base.position.y = 0.3; g.add(base);
  const mast = (h) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, h, 10), mat(0x6b7480)); m.position.y = 0.6 + h / 2; g.add(m); };
  const head = new THREE.Group(); parts.head = head; g.add(head);

  switch (id) {
    case 'radar': {
      mast(3); head.position.y = 3.8;
      head.add(new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 0.15), mat(def.color, 0.3)));
      parts.spin = head; break;
    }
    case 'rf': {
      mast(3); head.position.y = 3.8;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.15), mat(def.color, 0.3));
        p.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7); p.rotation.y = -a; head.add(p);
      }
      parts.spin = head; break;
    }
    case 'camera': {
      mast(2.6); head.position.y = 3.5;
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), mat(def.color, 0.3)));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10).rotateX(Math.PI / 2), mat(0x111111));
      lens.position.z = 0.7; head.add(lens);
      parts.spin = head; break;
    }
    case 'radar_s': {
      mast(2); head.position.y = 2.8;
      head.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 0.15), mat(def.color, 0.3)));
      parts.spin = head; break;
    }
    case 'jammer': {
      mast(3);
      head.position.y = 3.8;
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), mat(def.color, 0.5)));
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), mat(def.color, 0.3));
        const a = (i / 3) * Math.PI * 2;
        p.position.set(Math.cos(a) * 0.7, 0.5, Math.sin(a) * 0.7);
        p.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
        head.add(p);
      }
      parts.spin = head; break;
    }
    case 'interceptor': { // a rack of launch tubes
      head.position.y = 1.0;
      for (let i = 0; i < 4; i++) {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8).rotateX(Math.PI / 2), mat(def.color, 0.25));
        tube.position.set((i % 2) * 0.6 - 0.3, 0.5 + Math.floor(i / 2) * 0.6, 0.2); tube.rotation.x = -0.6; head.add(tube);
      }
      break;
    }
    case 'missile': {
      head.position.y = 1.2;
      const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 2.8), mat(def.color, 0.15));
      l.position.set(0, 0.6, 0.3); l.rotation.x = -0.7; head.add(l); break;
    }
    case 'laser': {
      mast(1.4); head.position.y = 2.4;
      head.add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 16, 12), mat(def.color, 0.35)));
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.8, 10).rotateX(Math.PI / 2), mat(0xffffff, 0.6));
      lens.position.z = 0.7; head.add(lens); break;
    }
  }
  return { group: g, parts };
}

// ---------- ranges / ghost ----------
const ringThickness = (r) => Math.max(0.4, r * 0.006);

// Range rings follow the ground, so hills and valleys show where coverage really lies.
function makeRing(s) {
  if (s.ringObj) { s.group.remove(s.ringObj.mesh); s.ringObj.dispose(); }
  const r = u(s.def.range);
  s.ringObj = drapedRing(r, ringThickness(r), s.def.color, 0.35);
  s.ringObj.update(s.pos.x, s.pos.z);
  s.ring = s.ringObj.mesh;
  s.ring.visible = state.showRings;
  s.group.add(s.ring);
}

function addStructure(id, x, z) {
  const def = STRUCTURES[id];
  const y = hereU(x, z);
  const holder = new THREE.Group();
  const { group: model, parts } = buildModel(id);
  model.scale.setScalar(STRUCT_SCALE);
  holder.add(model);
  holder.position.set(x, y, z);
  scene.add(holder);
  const s = { def, health: def.health || 30, group: holder, parts, pos: new THREE.Vector3(x, y, z), cd: 0, ring: null, ringObj: null, beam: null, pulse: null, pulseT: (structures.length * 0.37) % 1 };
  makeRing(s);
  if (id === 'laser') {
    s.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: def.color }));
    s.beam.frustumCulled = false; s.beam.visible = false; scene.add(s.beam);
  }
  if (id === 'jammer') {
    s.pulse = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    s.pulse.position.y = 0.5; holder.add(s.pulse);
  }
  structures.push(s);
  net.registerNode(s);
  s.label = makeLabel(s.short, hexCss(def.color), 'slabel');
  return s;
}

function removeStructure(s) {
  net.deregisterNode(s);
  s.label.remove();
  scene.remove(s.group);
  s.ringObj.dispose();
  if (s.beam) { scene.remove(s.beam); s.beam.geometry.dispose(); s.beam.material.dispose(); }
  if (s.pulse) { s.pulse.geometry.dispose(); s.pulse.material.dispose(); }
  structures.splice(structures.indexOf(s), 1);
}

const ghost = new THREE.Group();
ghost.visible = false;
scene.add(ghost);
let ghostRing = null;
let ghostAt = { x: NaN, z: NaN };
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const ghostMarker = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.5, 16), ghostMat);
ghostMarker.scale.setScalar(STRUCT_SCALE);
ghost.add(ghostMarker);
function refreshGhost() {
  if (ghostRing) { ghost.remove(ghostRing.mesh); ghostRing.mesh.geometry.dispose(); ghostRing = null; }
  const def = STRUCTURES[tool];
  if (def) {
    const r = u(def.range);
    ghostRing = drapedRing(r, ringThickness(r) * 1.5, 0xffffff, 0.5);
    ghostRing.mesh.material.dispose();
    ghostRing.mesh.material = ghostMat; // shares the green/red placement colour
    ghost.add(ghostRing.mesh);
    ghostAt = { x: NaN, z: NaN };
  }
}

// ---------- tools / input ----------
let tool = null; // structure id | 'sell' | null
const toolButtons = {};
function rebuildToolbar() {
  const keep = tool;
  $('toolbar').innerHTML = '';
  for (const k of Object.keys(toolButtons)) delete toolButtons[k];
  buildToolbar();
  if (keep) toolButtons[keep]?.classList.add('active');
}
function buildToolbar() {
  const bar = $('toolbar');
  for (const def of Object.values(STRUCTURES)) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.style.borderLeftColor = '#' + def.color.toString(16).padStart(6, '0');
    b.title = `${def.desc}\nModelled on: ${def.ref.analogues.join(', ')}`;
    b.title += `\nCost ${money(def.cost)}${def.shotCost ? `, ${money(def.shotCost)} per shot` : ''}`;
    b.innerHTML = `<div class="n">${def.name}</div><div class="c">${money(def.cost)}</div>${def.shotCost ? `<div class="s">${money(def.shotCost)}/shot</div>` : ''}<div class="k">[${def.key}]</div>`;
    b.onclick = () => setTool(def.id);
    bar.appendChild(b);
    toolButtons[def.id] = b;
  }
  const sell = document.createElement('button');
  sell.className = 'tool';
  sell.title = 'Click a structure to sell it for a refund';
  sell.innerHTML = `<div class="n">Sell</div><div class="c">${Math.round(BUILD.sellRefund * 100)}%</div><div class="k">[X]</div>`;
  sell.onclick = () => setTool('sell');
  bar.appendChild(sell);
  toolButtons.sell = sell;
}
function setTool(t) {
  tool = tool === t ? null : t;
  for (const [id, b] of Object.entries(toolButtons)) b.classList.toggle('active', id === tool);
  refreshGhost();
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const mouseGround = new THREE.Vector3();
let mouseOnGround = false;
function updateMouse(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = worldView ? raycaster.intersectObject(worldView.mesh, false)[0] : null; // the terrain
  if (hit) { mouseGround.copy(hit.point); mouseOnGround = true; }
  else mouseOnGround = !!raycaster.ray.intersectPlane(groundPlane, mouseGround);
  if (mouseOnGround) mouseGround.y = hereU(mouseGround.x, mouseGround.z);
}
let downPos = null;
canvas.addEventListener('pointermove', updateMouse);
canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY, b: e.button }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downPos || downPos.b !== 0) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 5) return;
  updateMouse(e);
  handleClick();
});

// Why a structure can't go here, or null if it can.
function placementProblem(x, z, def) {
  const r = Math.hypot(x, z);
  const xm = x * WORLD.metresPerUnit, zm = z * WORLD.metresPerUnit;
  if (BUILD.lockAfterStart && state.wave > 0) return 'The laydown is locked once the first wave starts';
  if (r < u(BUILD.minDist)) return `Too close to the station (minimum ${BUILD.minDist} m)`;
  if (r > u(BUILD.maxDist)) return `Outside the build zone (maximum ${BUILD.maxDist} m)`;
  if (terrainState.data.bldgAt(xm, zm)) return 'There is a building here';
  if (terrainState.data.coverAt(xm, zm) === 4) return 'You cannot build in water';
  if (terrainState.data.slope(xm, zm) > 0.4) return 'The ground is too steep';
  if (structures.some((s) => hdist(s.pos, { x, z }) < u(BUILD.spacing))) return 'Too close to another structure';
  if (state.budget < def.cost) return `Not enough budget (${money(def.cost)} needed, ${money(state.budget)} left)`;
  return null;
}
const canPlace = (x, z, def) => !placementProblem(x, z, def);

function handleClick() {
  if (!tool || state.over || !state.started || !mouseOnGround) return;
  if (tool === 'sell') {
    if (BUILD.lockAfterStart && state.wave > 0) { toast('The laydown is locked once the first wave starts'); return; }
    let best = null, bd = u(150);
    for (const s of structures) { const d = hdist(s.pos, mouseGround); if (d < bd) { bd = d; best = s; } }
    if (best) {
      const refund = Math.round(best.def.cost * BUILD.sellRefund);
      state.budget += refund; ledger.capex -= refund;
      if (best.uplink) buyTerminal(best.uplink, null); // its terminal is refunded too
      removeStructure(best);
    }
    return;
  }
  const def = STRUCTURES[tool];
  const problem = placementProblem(mouseGround.x, mouseGround.z, def);
  if (!problem) {
    state.budget -= def.cost; ledger.capex += def.cost;
    addStructure(def.id, mouseGround.x, mouseGround.z);
  } else toast(problem);
}

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') { if (tool) setTool(tool); return; }
  if (e.key === ' ') { e.preventDefault(); setSpeed(state.speed === 0 ? state.lastSpeed || 1 : 0); return; }
  if (e.key === 'r' || e.key === 'R') { $('rings').click(); return; }
  if (e.key === 't' || e.key === 'T') { $('truth').click(); return; }
  if (e.key === 'l' || e.key === 'L') { $('labels-toggle').click(); return; }
  if (e.key === 'x' || e.key === 'X') { setTool('sell'); return; }
  const def = Object.values(STRUCTURES).find((d) => d.key === e.key);
  if (def) setTool(def.id);
});

// ---------- drones ----------
const rotorMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.7 });
const unseenMat = new THREE.MeshBasicMaterial({ color: 0x8a94a3, transparent: true, opacity: 0.4, depthWrite: false });
const barGeo = new THREE.PlaneGeometry(2, 0.25).translate(1, 0, 0);
const dropGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0)]);
const _v = new THREE.Vector3();
let droneCount = 0, droneUid = 0;

// One shared model per drone type, plus a grey copy for drones that no sensor has (shown when the truth overlay is on).
const droneTemplates = {};
function droneTemplate(type, unseen) {
  const key = type + (unseen ? ':unseen' : '');
  if (droneTemplates[key]) return droneTemplates[key];
  const def = DRONES[type];
  const mat = unseen ? unseenMat : new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.4, roughness: 0.5 });
  const dark = unseen ? unseenMat : darkMat;
  const spin = unseen ? unseenMat : rotorMat;
  const g = new THREE.Group();
  const box = (w, h, d, x = 0, y = 0, z = 0, m = mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); g.add(mesh); return mesh;
  };
  const rotor = (x, y, z, len, axis = 'y') => {
    const r = box(len, 0.04, 0.14, x, y, z, spin);
    r.name = 'rotor'; r.userData.axis = axis;
  };
  const quadRotors = (arm, len) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) rotor(sx * arm, 0.25, sz * arm, len); };
  if (def.model === 'fw') {
    box(0.3, 0.3, 2.4); box(3.4, 0.06, 0.55, 0, 0.05, 0.15); box(1.1, 0.05, 0.35, 0, 0.1, -1.0);
    box(0.05, 0.45, 0.35, 0, 0.3, -1.0); rotor(0, 0, 1.25, 0.9, 'z');
  } else { // quadcopter airframe, shared by the FPV and FO strikes
    box(0.6, 0.25, 1.0); quadRotors(0.6, 0.7);
    if (def.fibre) box(0.25, 0.25, 0.4, 0, -0.05, -0.55, dark); // fibre spool
  }
  droneTemplates[key] = g;
  return g;
}

function spawnDrone(type, bearing, rolls = {}) {
  const def = DRONES[type];
  tally(ledger.launched, type); // the attacker pays for every drone it launches
  // the enemy adapts: later waves spawn harder to hit and harder to jam
  const k = Math.max(effWave() - 1, 0) * (def.adapt ?? 1);
  const evade = Math.max(Math.min(ADAPT.evadeFloor, def.evade), def.evade * (1 - ADAPT.evadePerWave * k));
  const jamResist = Math.max(def.jamResist, Math.min(ADAPT.jamResistCap, def.jamResist + ADAPT.jamResistPerWave * k));

  // chance is pre-rolled by the wave's seeded stream; ad-hoc spawns (console, tests) draw from the sim stream
  const jitter = rolls.jitter ?? (rand() - 0.5) * 0.3;
  const altFrac = rolls.altFrac ?? rand();
  const freq = rolls.freq ?? (rand() < 0.5 ? 2.4e9 : 5.8e9);
  const a = bearing + jitter;
  const sx = Math.cos(a) * u(WORLD.spawnDist), sz = Math.sin(a) * u(WORLD.spawnDist);
  const agl = def.alt[0] + altFrac * (def.alt[1] - def.alt[0]); // metres above the ground at the spawn point
  const y = hereU(sx, sz) + u(agl);
  const group = new THREE.Group();
  const model = droneTemplate(type, false).clone();
  const unseen = droneTemplate(type, true).clone();
  unseen.visible = false;
  group.add(model, unseen);
  const rotors = [...model.children, ...unseen.children].filter((c) => c.name === 'rotor');

  const bar = new THREE.Group();
  bar.position.y = 1.6;
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x66ff66, depthTest: false });
  const fill = new THREE.Mesh(barGeo, fillMat);
  fill.position.x = -1; fill.renderOrder = 10;
  bar.add(fill); group.add(bar);

  // thin line down to the ground so altitude is readable
  const dropMat = new THREE.LineBasicMaterial({ color: def.color, transparent: true, opacity: 0.35 });
  const drop = new THREE.Line(dropGeo, dropMat);
  drop.frustumCulled = false;
  group.add(drop);

  group.scale.setScalar(def.scale * WORLD.droneVisualScale);
  const pos = new THREE.Vector3(sx, y, sz);
  group.position.copy(pos);
  scene.add(group);

  // fibre-optic drones pay out a line from where they launched
  let fibre = null;
  if (def.fibre) {
    fibre = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos.clone(), pos.clone()]),
      new THREE.LineBasicMaterial({ color: 0xd7ccc8, transparent: true, opacity: 0.6 }));
    fibre.frustumCulled = false;
    scene.add(fibre);
  }

  const uid = ++droneUid;
  const d = {
    uid, label: makeLabel(DRONE_CODE[type], hexCss(def.color), 'dlabel'),
    def, type, pos, group, model, unseen, rotors, bar, fill, fillMat, drop, dropMat, fibre,
    hp: def.hp, evade, jamResist, jamT: 0, detected: false, dead: false, phase: (droneCount++ * 1.7) % 6,
    agl0: agl, h0: Math.hypot(sx, sz),                       // launch height above ground and distance, for the descent profile
    mode: 'approach', angle: 0, orbitT: 0, bank: 0,         // spotter state
    vel: new THREE.Vector3(), freq, track: null, nav: 0, videoJammed: false, targetStructure: null,
  };
  drones.push(d);
  rec.event('launch', `${def.name} launched`, d.uid);
}

function removeDrone(d) {
  d.dead = true;
  net.onDroneRemoved(d);
  d.label.remove();
  scene.remove(d.group);
  if (d.fibre) { scene.remove(d.fibre); d.fibre.geometry.dispose(); d.fibre.material.dispose(); }
  d.fillMat.dispose(); d.dropMat.dispose();
  const i = drones.indexOf(d);
  if (i >= 0) drones.splice(i, 1);
}

// `by` is the id of whatever did the damage ('laser', 'interceptor', 'missile', ...), for the cost ledger.
function recordKill(d, by) {
  rec.event('kill', `${d.def.name} destroyed by ${by}`, d.uid);
  state.kills++;
  tally(ledger.killed, d.type);
  ledger.killedBy[by] = ledger.killedBy[by] || {};
  tally(ledger.killedBy[by], d.type);
}
function damageDrone(d, amount, by) {
  if (d.dead) return;
  d.hp -= amount;
  const k = Math.max(d.hp / d.def.hp, 0);
  d.fill.scale.x = k;
  d.fillMat.color.setHSL(k * 0.33, 1, 0.5);
  if (d.hp <= 0) {
    recordKill(d, by);
    addExplosion(d.pos, u(80), 0xffcc66);
    removeDrone(d);
  }
}

// each spotter on station makes every strike hit harder
const spotterBonus = () => drones.reduce((sum, d) => sum + (d.mode === 'orbit' && !d.videoJammed ? d.def.spotBonus || 0 : 0), 0); // a spotter with jammed video can't help

function impact(d) {
  rec.event('leak', `${d.def.name} hit the site`, d.uid);
  state.leaks++; tally(ledger.leaked, d.type);
  if (!state.sandbox) state.health = Math.max(state.health - d.def.damage * (1 + spotterBonus()), 0);
  state.flash = 0.4;
  net.raiseAlert('critical', `Site impact by ${d.def.name}: integrity ${Math.round(state.health)}%`, d.pos, 'DISCRETE_PRIORITY_HIGH');
  addExplosion(d.pos, u(150), 0xff5252);
  removeDrone(d);
  if (state.health <= 0 && !state.sandbox) gameOver();
}

// Spotter: flies out to its standoff radius, orbits for loiterTime, then leaves. Returns false if it was removed.
function moveSpotter(d, spd, dt) {
  const r = u(d.def.loiterDist);
  if (d.mode === 'approach') {
    if (hdist(d.pos, SITE_POS) <= r) {
      d.mode = 'orbit'; d.angle = Math.atan2(d.pos.z, d.pos.x); d.orbitT = 0;
      rec.event('spotter', `${d.def.name} on station`, d.uid);
      toast(`${d.def.name} on station: strikes +${Math.round(d.def.spotBonus * 100)}% damage`);
    } else {
      _v.set(-d.pos.x, 0, -d.pos.z).normalize().multiplyScalar(spd);
      d.pos.add(_v);
    }
  } else if (d.mode === 'orbit') {
    d.angle += spd / r;
    d.pos.set(Math.cos(d.angle) * r, d.pos.y, Math.sin(d.angle) * r);
    d.orbitT += dt;
    if (d.orbitT >= d.def.loiterTime) d.mode = 'egress';
  } else {
    _v.set(d.pos.x, 0, d.pos.z).normalize().multiplyScalar(spd);
    d.pos.add(_v);
    if (hdist(d.pos, SITE_POS) > u(WORLD.spawnDist)) { tally(ledger.escaped, d.type); removeDrone(d); return false; }
  }
  return true;
}

// ---------- what the enemy goes for ----------
// FPV and FO strikes look for the loudest radio emitter near them and go for that instead of the site: a radar, a jammer
// that is switched on, a system with a Starlink or cellular terminal. Everything else heads for the station.
function emitterScore(s) {
  const def = s.def;
  let sig = def.signature || 0;
  if (def.id === 'jammer' && s.mode !== 'Jam') sig *= 0.1; // a jammer is quiet until it is jamming
  if (s.uplink) sig += COMMS[s.uplink].signature;
  return sig;
}
const SITE_AIM = { x: 0, z: 0, structure: null };
function pickTarget(d) {
  if (!d.def.seeksEmitters) return SITE_AIM;
  if (d.targetStructure && structures.includes(d.targetStructure)) return { x: d.targetStructure.pos.x, z: d.targetStructure.pos.z, structure: d.targetStructure };
  d.targetStructure = null;
  let best = null, bs = 0.3;
  for (const s of structures) {
    const dist = hdist(s.pos, d.pos);
    if (dist > u(3000)) continue;
    const score = emitterScore(s) / (1 + dist / u(1500));
    if (score > bs) { bs = score; best = s; }
  }
  if (!best) return SITE_AIM;
  d.targetStructure = best;
  d.h0 = hdist(d.pos, best.pos); d.agl0 = Math.max((d.pos.y - hereU(d.pos.x, d.pos.z)) * WORLD.metresPerUnit, 5); // restart the descent profile
  return { x: best.pos.x, z: best.pos.z, structure: best };
}
function hitStructure(d, s) {
  addExplosion(d.pos, u(60), 0xff5252);
  if (!state.sandbox) s.health -= d.def.damage * (1 + spotterBonus()); // the sandbox protects the laydown too
  state.hits++;
  removeDrone(d);
  net.raiseAlert('critical', `${d.def.name} struck ${s.name}: ${Math.max(Math.round(s.health), 0)}% health left`, s.pos, 'DISCRETE_PRIORITY_HIGH');
  if (s.health <= 0) {
    tally(ledger.lost, s.def.id); ledger.lostValue += s.def.cost;
    rec.event('lost', `${s.name} destroyed`);
    net.raiseAlert('critical', `${s.name} destroyed`, s.pos, 'DISCRETE_PRIORITY_HIGH');
    toast(`${s.name} destroyed`);
    removeStructure(s);
  }
}

function updateDrones(dt) {
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i];
    d.detected = net.isTracked(d);

    // Jamming. Each jammer that is on and in range jams the bands it is set to, and what that does depends on what the
    // drone relies on: a jammed control link slows it and eventually crashes it, a jammed video link does the same more
    // slowly (it is flying blind), and jammed GNSS makes a navigating drone drift off course (and the drift stays).
    const links = d.def.links || {};
    let ctrl = false, vid = false, gnss = false, killTime = Infinity;
    for (const s of structures) {
      if (s.def.id !== 'jammer' || s.mode !== 'Jam' || s.pos.distanceTo(d.pos) > u(s.def.range)) continue;
      if (links.control && s.jamBands.has(links.control)) ctrl = true;
      if (links.video && s.jamBands.has(links.video)) vid = true;
      if (links.gnss && s.jamBands.has('gnss')) gnss = true;
      killTime = Math.min(killTime, s.def.killTime);
    }
    const eff = 1 - d.jamResist;
    let slow = 1;
    const jamRate = ctrl ? 1 : vid ? 0.5 : 0;
    if (jamRate && eff > 0) {
      slow = 1 - (1 - (ctrl ? STRUCTURES.jammer.slow : 0.7)) * eff;
      d.jamT += dt * eff * jamRate;
      if (d.jamT >= killTime) {
        recordKill(d, 'jammer');
        addExplosion(d.pos, u(80), 0xba68c8);
        removeDrone(d);
        continue;
      }
    } else d.jamT = Math.max(0, d.jamT - dt * 0.5);
    d.videoJammed = vid;
    if (gnss) d.nav += gauss() * 0.08 * Math.sqrt(dt);

    const px = d.pos.x, py = d.pos.y, pz = d.pos.z;
    const spd = u(d.def.speed) * slow * dt;
    if (d.def.role === 'spotter') {
      if (!moveSpotter(d, spd, dt)) continue;
    } else {
      if (hdist(d.pos, SITE_POS) > u(WORLD.radius)) { tally(ledger.escaped, d.type); rec.event('escaped', `${d.def.name} left the area`, d.uid); removeDrone(d); continue; } // GNSS drift can turn it away for good
      const tgt = pickTarget(d);
      const hrem = Math.hypot(tgt.x - d.pos.x, tgt.z - d.pos.z);
      if (tgt.structure ? hrem < u(30) : hrem < u(SITE.radius)) { if (tgt.structure) hitStructure(d, tgt.structure); else impact(d); continue; }
      // fly at the target, hugging the terrain: height above ground eases from the launch height down to the target
      // height, never below the type's minimum until it is within 400 m, and climbing early over rising ground
      let dirx = (tgt.x - d.pos.x) / hrem, dirz = (tgt.z - d.pos.z) / hrem;
      if (d.nav) { const c = Math.cos(d.nav), sn = Math.sin(d.nav); [dirx, dirz] = [dirx * c - dirz * sn, dirx * sn + dirz * c]; } // GNSS drift
      d.pos.x += dirx * spd; d.pos.z += dirz * spd;
      const f = 1 - clamp(hrem / d.h0, 0, 1);
      const want = Math.max(d.agl0 + (SITE.targetAlt - d.agl0) * f, (d.def.minAgl || 0) * Math.min(1, hrem / u(400)));
      const ahead = Math.max(groundM(d.pos.x, d.pos.z), groundM(d.pos.x + dirx * u(150), d.pos.z + dirz * u(150)));
      d.pos.y += clamp(u(ahead + want) - d.pos.y, -spd * 1.2, spd * 0.8);
      d.pos.y = Math.max(d.pos.y, hereU(d.pos.x, d.pos.z) + u(3));
    }
    const dx = d.pos.x - px, dz = d.pos.z - pz;
    if (dt > 0) d.vel.set(dx, d.pos.y - py, dz).divideScalar(dt);
    if (dx || dz) d.group.rotation.y = Math.atan2(dx, dz);
    if (d.def.bank) { // fixed-wing banks into its orbit
      d.bank += ((d.mode === 'orbit' ? d.def.bank : 0) - d.bank) * Math.min(1, dt * 2);
      d.model.rotation.z = d.bank; d.unseen.rotation.z = d.bank;
    }
    d.group.position.copy(d.pos);
  }
}

// ---------- what the fusion node believes ----------
// Each track is drawn where the fusion node thinks the drone is, with a circle for its position error: gold when confirmed,
// orange when coasting (no recent update), small and grey while still tentative (it might be a false alarm). Bearings that
// no track claims (RF, camera) are drawn as rays from the sensor; where two cross, the tracker may start a track there,
// which can be a ghost if the rays came from different drones. With the truth overlay on, a line joins each track to the
// real drone it last matched.
const diamondGeo = new THREE.OctahedronGeometry(1, 0);
const ringUnit = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 49 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2), 0, Math.sin((i / 48) * Math.PI * 2))));
const beliefs = new Map(); // track id -> markers
const rayPool = [];
const labelLayer = $('labels');
const _p = new THREE.Vector3();
// A track's diamond is coloured by what the fusion node thinks it is: white = unclassified, red = multirotor,
// magenta = fixed-wing. Grey = tentative (might be a false alarm); coasting tracks are drawn dimmer.
// Tracks are drawn faint and grey so they do not crowd the view; "Highlight tracks" switches to the class colours.
let trackHi = false;
const CLASS_COLOUR = { Unknown: 0xffffff, Multirotor: 0xff5a3c, 'Fixed wing': 0xe040fb };
const CLASS_DIM = { Unknown: 0x9aa4b4, Multirotor: 0xa8938e, 'Fixed wing': 0x9d93aa };
const trackColour = (tr) => {
  if (tr.status === 'tentative') return trackHi ? 0x8a94a3 : 0x5f6978;
  const c = new THREE.Color((trackHi ? CLASS_COLOUR : CLASS_DIM)[tr.airframe] ?? (trackHi ? 0xffffff : 0x9aa4b4));
  return tr.status === 'coasting' ? c.multiplyScalar(0.55).getHex() : c.getHex();
};

// ---------- name tags ----------
const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');
const DRONE_CODE = { spotter: 'SPT', fo: 'FO', fpv: 'FPV', fw: 'FW' };
function makeLabel(text, colour, cls) {
  const el = document.createElement('div');
  el.className = cls; el.textContent = text; el.style.borderColor = colour;
  $('labels').appendChild(el);
  return el;
}
function placeLabel(el, x, y, z, show) {
  _p.set(x, y, z).project(camera);
  if (!show || _p.z >= 1) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = ((_p.x + 1) / 2) * innerWidth + 'px';
  el.style.top = ((1 - _p.y) / 2) * innerHeight + 'px';
}
function updateLabels() {
  for (const s of structures) {
    const target = s.task && net.tracks.get(s.task.trackId);
    s.label.textContent = `${s.short} · ${s.mode}${target ? ' ▸ ' + (target.short || '?') : ''}`;
    placeLabel(s.label, s.pos.x, s.pos.y + 9, s.pos.z, view.labels);
  }
  for (const d of drones) {
    d.label.style.opacity = d.detected ? '1' : '0.5';
    placeLabel(d.label, d.pos.x, d.pos.y + 4, d.pos.z, view.labels && view.truth && view.replayT == null);
  }
}

function makeBelief() {
  const group = new THREE.Group();
  const diamond = new THREE.Mesh(diamondGeo, new THREE.MeshBasicMaterial({ color: 0xffcc66, depthTest: false, transparent: true }));
  diamond.renderOrder = 20;
  const ring = new THREE.LineLoop(ringUnit, new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.7 }));
  const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x8a94a3, transparent: true, opacity: 0.6 }));
  link.frustumCulled = false;
  group.add(diamond, ring);
  scene.add(group, link);
  const label = document.createElement('div');
  label.className = 'tlabel';
  labelLayer.appendChild(label);
  return { group, diamond, ring, link, label, pos: new THREE.Vector3(), placed: false };
}

function disposeBelief(b) {
  scene.remove(b.group, b.link);
  b.diamond.material.dispose(); b.ring.material.dispose(); b.link.geometry.dispose(); b.link.material.dispose();
  b.label.remove();
}

function updateBeliefs() {
  const m = WORLD.metresPerUnit;
  for (const [id, b] of beliefs) if (!net.tracks.has(id)) { disposeBelief(b); beliefs.delete(id); }
  for (const tr of net.tracks.values()) {
    if (!tr.est) continue;
    let b = beliefs.get(tr.id);
    if (!b) { b = makeBelief(); beliefs.set(tr.id, b); }
    _p.set(tr.est.east / m, tr.est.up / m, -tr.est.north / m);
    if (!b.placed) { b.pos.copy(_p); b.placed = true; } else b.pos.lerp(_p, 0.5);
    const colour = trackColour(tr);
    b.diamond.material.color.setHex(colour); b.ring.material.color.setHex(colour);
    b.diamond.material.opacity = trackHi ? 1 : 0.55; b.ring.material.opacity = trackHi ? 0.7 : 0.25; b.link.material.opacity = trackHi ? 0.6 : 0.2;
    const size = Math.max(1.5, camera.position.distanceTo(b.pos) * (tr.status === 'tentative' ? 0.004 : trackHi ? 0.008 : 0.006));
    b.diamond.scale.setScalar(size);
    b.group.position.copy(b.pos);
    const errU = Math.max(u(tr.estErr || 0), 0.001);
    b.ring.scale.set(errU, 1, errU);
    b.link.visible = view.truth && !!tr.drone;
    if (b.link.visible) {
      const p = b.link.geometry.attributes.position;
      p.setXYZ(0, b.pos.x, b.pos.y, b.pos.z); p.setXYZ(1, tr.drone.pos.x, tr.drone.pos.y, tr.drone.pos.z); p.needsUpdate = true;
    }
    _p.copy(b.pos).project(camera);
    const show = _p.z < 1 && (trackHi || tr.status !== 'tentative'); // tentative labels only when highlighting
    b.label.style.display = show ? 'block' : 'none';
    b.label.style.opacity = trackHi ? (tr.status === 'tentative' ? '0.55' : '1') : (tr.status === 'tentative' ? '0.4' : '0.75');
    if (show) {
      b.label.style.left = ((_p.x + 1) / 2) * innerWidth + 'px';
      b.label.style.top = ((1 - _p.y) / 2) * innerHeight + 'px';
      const cls = tr.airframe && tr.airframe !== 'Unknown' ? tr.airframe : 'UAV';
      const err = `±${Math.round(tr.estErr || 0)} m`;
      b.label.textContent = tr.status === 'tentative' ? `tentative ${err}` : `${tr.short} · ${cls} ${err}${tr.status === 'coasting' ? ' · coasting' : ''}`;
    }
  }
  // bearing candidates: rays from the sensor, coloured by sensor type
  const cands = net.bearingCandidates();
  while (rayPool.length < cands.length) {
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 }));
    ray.frustumCulled = false; scene.add(ray); rayPool.push(ray);
  }
  rayPool.forEach((ray, i) => {
    const c = cands[i];
    ray.visible = !!c;
    if (!c) return;
    const el = c.el ?? 0, len = 3500;
    const p = ray.geometry.attributes.position;
    p.setXYZ(0, c.from[0] / m, c.from[2] / m, -c.from[1] / m);
    p.setXYZ(1, (c.from[0] + len * Math.cos(el) * Math.sin(c.az)) / m, (c.from[2] + len * Math.sin(el)) / m, -(c.from[1] + len * Math.cos(el) * Math.cos(c.az)) / m);
    p.needsUpdate = true;
    ray.material.color.setHex(c.color);
    ray.material.opacity = trackHi ? 0.6 : 0.22;
  });
}

// Truth overlay: when on, every drone is drawn where it really is (colour if tracked, grey if nobody has it).
// When off, only the fused tracks (the belief markers) are visible.
function updateDroneVisuals(real) {
  for (const d of drones) {
    const tracked = d.detected;
    d.group.visible = view.truth;
    d.model.visible = tracked;
    d.unseen.visible = !tracked;
    d.bar.visible = tracked;
    d.dropMat.color.setHex(tracked ? d.def.color : 0x667080);
    for (const r of d.rotors) r.rotation[r.userData.axis || 'y'] += real * 50;
    d.group.position.y = d.pos.y + Math.sin(performance.now() / 300 + d.phase) * 0.15;
    d.drop.scale.y = Math.max(d.pos.y - hereU(d.pos.x, d.pos.z), 0) / d.group.scale.y;
    d.bar.lookAt(camera.position);
    if (d.fibre) {
      d.fibre.visible = view.truth;
      const p = d.fibre.geometry.attributes.position;
      p.setXYZ(1, d.pos.x, d.pos.y, d.pos.z); p.needsUpdate = true;
    }
  }
}

// ---------- effectors (they act only on tasks from the fusion node) ----------
const muzzle = (s) => _m.set(s.pos.x, s.pos.y + (s.def.muzzleY || 2) * STRUCT_SCALE, s.pos.z);

// The laser needs a clear optical path; guided weapons (interceptor drones, missiles) are cued over the terrain.
function opticalLos(s, d) {
  if (s.def.fire === 'guided') return true;
  const m = WORLD.metresPerUnit;
  const r = terrainState.data.los(s.pos.x * m, s.pos.y * m + 4, s.pos.z * m, d.pos.x * m, d.pos.y * m, d.pos.z * m);
  return r.clear && r.canopy <= TERRAIN.opticalCanopyTol;
}
const _m = new THREE.Vector3();
const aim = (s, t) => { s.parts.head.rotation.y = Math.atan2(t.pos.x - s.pos.x, t.pos.z - s.pos.z); };

function updateStructures(dt) {
  for (const s of structures) {
    const def = s.def;
    s.cd = Math.max(0, s.cd - dt);
    if (def.role === 'sensor' || def.id === 'jammer') continue;
    const range = u(def.range);
    let t = s.task && state.time >= (s.task.activeAt || 0) && !s.task.drone.dead && s.pos.distanceTo(s.task.drone.pos) <= range ? s.task.drone : null; // acts once its task has arrived
    if (t && (def.id === 'laser' || s.cd <= 0) && !opticalLos(s, t)) t = null; // terrain or trees in the way
    if (def.id === 'laser') {
      const firing = !!t && affordable(def);
      s.beam.visible = firing;
      if (firing && !s.beamOn) { spend(def); s.beamT = 0; } // a shot is charged when the beam starts, then every second it stays on
      s.beamOn = firing;
      if (firing) {
        aim(s, t);
        const p = s.beam.geometry.attributes.position;
        const m = muzzle(s);
        p.setXYZ(0, m.x, m.y, m.z); p.setXYZ(1, t.pos.x, t.pos.y, t.pos.z); p.needsUpdate = true;
        s.beamT = (s.beamT || 0) + dt; // a "shot" is a second of beam time
        while (s.beamT >= 1) { s.beamT -= 1; spend(def); }
        damageDrone(t, def.dps * dt * (0.5 + 0.5 * t.evade), 'laser'); // evasion spoils beam dwell
      }
      continue;
    }
    if (!t) continue;
    aim(s, t);
    if (s.cd > 0 || !affordable(def)) continue;
    s.cd = def.cooldown;
    if (def.fire === 'guided') { // interceptor drones and missiles
      const pending = missiles.filter((m) => m.target === t).length * def.damage;
      if (pending >= t.hp) { s.cd = 0.3; continue; } // enough already in the air
      spend(def);
      launchMissile(s, t);
    }
  }
}

// Pay for a shot out of the budget and record it in the ledger.
function spend(def) {
  const cost = def.shotCost || 0;
  if (state.sandbox) state.sbSpent += cost; // free in the sandbox
  else { state.budget -= cost; ledger.consumables += cost; }
  const e = ledger.shots[def.id] = ledger.shots[def.id] || { n: 0, cost: 0 };
  e.n++; e.cost += cost;
}

// ---------- missiles ----------
const missileGeo = new THREE.ConeGeometry(0.35, 1.8, 8).rotateX(Math.PI / 2);
function launchMissile(s, t) {
  const mesh = new THREE.Mesh(missileGeo, new THREE.MeshBasicMaterial({ color: s.def.id === 'interceptor' ? 0xffcdd2 : 0xffffff }));
  mesh.scale.setScalar(s.def.id === 'interceptor' ? STRUCT_SCALE * 0.6 : STRUCT_SCALE);
  const pos = muzzle(s).clone();
  scene.add(mesh);
  const speed = u(s.def.missileSpeed);
  missiles.push({ def: s.def, mesh, pos, vel: new THREE.Vector3(0, speed * 0.6, 0), target: t, life: (s.def.range / s.def.missileSpeed) * 1.5 });
}
function endMissile(m, i) {
  scene.remove(m.mesh); m.mesh.material.dispose();
  missiles.splice(i, 1);
}
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    if (!m.target || m.target.dead) {
      m.target = null;
      let bd = u(1500);
      for (const d of drones) { if (!d.detected) continue; const dd = d.pos.distanceTo(m.pos); if (dd < bd) { bd = dd; m.target = d; } }
    }
    if (m.target) {
      _v.subVectors(m.target.pos, m.pos).normalize().multiplyScalar(u(m.def.missileSpeed));
      m.vel.lerp(_v, 1 - Math.exp(-4 * dt));
    }
    m.pos.addScaledVector(m.vel, dt);
    m.mesh.position.copy(m.pos);
    m.mesh.lookAt(_v.copy(m.pos).add(m.vel));
    const fuzed = m.target && m.pos.distanceTo(m.target.pos) < u(m.def.fuze) * m.target.evade; // evasive targets are harder to catch
    if (fuzed || m.life <= 0 || m.pos.y < hereU(m.pos.x, m.pos.z) + 0.2) {
      if (fuzed) {
        const r = u(m.def.splash);
        for (const d of drones.slice()) if (d.pos.distanceTo(m.pos) < r) damageDrone(d, m.def.damage, m.def.id);
      }
      addExplosion(m.pos, u(m.def.splash), 0xff8844);
      endMissile(m, i);
    }
  }
}

// ---------- effects ----------
const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
function addExplosion(pos, r, color) {
  r = Math.max(r, 3);
  const mesh = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }));
  mesh.position.copy(pos); mesh.scale.setScalar(r * 0.3);
  scene.add(mesh);
  effects.push({ mesh, r, age: 0, life: 0.5 });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.age += dt;
    const k = e.age / e.life;
    if (k >= 1) {
      scene.remove(e.mesh); e.mesh.material.dispose();
      effects.splice(i, 1);
      continue;
    }
    e.mesh.scale.setScalar(e.r * (0.3 + 0.7 * k));
    e.mesh.material.opacity = 0.8 * (1 - k);
  }
}

// ---------- waves ----------
function startWave() {
  if (state.waveActive || state.over || !state.started) return;
  if (state.sandbox) { toast('Exit the sandbox first: it resets the run and keeps your laydown'); return; }
  const loose = network.unwired().length;
  if ((loose || !net.fusion.uplinks.size) && !state.warnedWire) { // nodes with no link are offline: warn once
    state.warnedWire = true;
    toast(loose ? `${loose} system${loose > 1 ? 's have' : ' has'} no network link and will be offline. Open SAPIENT > Network (Auto-wire), or press Start wave again to go anyway` : 'The fusion node has no network terminal, so it will hear nothing. Open SAPIENT > Network, or press Start wave again to go anyway');
    return;
  }
  if (state.wave === 0) beginRun();
  state.wave++;
  state.queue = makeWave(state.wave, waveStream(state.seed, state.wave));
  state.waveTime = 0;
  state.waveActive = true;
  state.autoTimer = -1;
  toast(state.wave > 1 ? `Wave ${state.wave} inbound: the enemy has adapted` : `Wave ${state.wave} inbound`);
}
function updateWaves(dt) {
  if (state.sandbox) {
    state.sbTime += dt;
    while (state.sbQueue.length && state.sbQueue[0].t <= state.sbTime) { const q = state.sbQueue.shift(); spawnDrone(q.type, q.bearing, q); }
  }
  if (state.waveActive) {
    state.waveTime += dt;
    while (state.queue.length && state.queue[0].t <= state.waveTime) {
      const q = state.queue.shift();
      spawnDrone(q.type, q.bearing, q);
    }
    if (!state.queue.length && !drones.some((d) => d.def.role !== 'spotter')) {
      for (const d of drones) d.mode = 'egress'; // spotters withdraw once the strike is over
      state.waveActive = false;
      toast(`Wave ${state.wave} cleared. Budget left ${money(state.budget)}`);
      if ($('auto').checked) state.autoTimer = 6;
    }
  } else if (state.autoTimer >= 0) {
    state.autoTimer -= dt;
    if (state.autoTimer < 0) startWave();
  }
}

function gameOver() {
  state.over = true;
  const card = document.querySelector('#overlay .card');
  card.innerHTML = `<h1>SITE LOST</h1><p>You held out for <b>${Math.max(state.wave - 1, 0)}</b> full wave(s).</p>
    <p>Kills <b>${state.kills}</b> &middot; Enemy attack cost <b>${money(enemyCost(ledger.launched))}</b> &middot; Defence spend <b>${money(ledger.capex + ledger.consumables)}</b></p>
    <button id="btn-restart" class="primary">Retry with the same laydown</button> <button id="btn-restart-clear">New laydown</button>`;
  $('overlay').classList.remove('hidden');
  $('btn-restart').onclick = () => resetRun('keep');
  $('btn-restart-clear').onclick = () => resetRun('clear');
}

// ---------- UI ----------
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function setSpeed(s) {
  if (s > 0) state.lastSpeed = s;
  state.speed = s;
  document.querySelectorAll('.speed').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === s));
}
document.querySelectorAll('.speed').forEach((b) => { b.onclick = () => setSpeed(Number(b.dataset.speed)); });
$('btn-wave').onclick = startWave;
$('seed-input').value = state.seed;
$('btn-seed-random').onclick = () => { $('seed-input').value = String(Math.floor(Math.random() * 900000) + 100000); }; // a UI action, not part of the sim
$('terrain-input').value = terrainSeedParam;
$('btn-deploy').onclick = () => {
  // nothing has happened yet, so re-seeding, restarting the network and rebuilding the ground are all safe
  const seed = $('seed-input').value.trim() || '1';
  const terrainSeed = $('terrain-input').value.trim() || '1';
  if (seed !== state.seed) {
    state.seed = seed;
    seedAll(seed);
    net.init();
  }
  if (terrainSeed !== state.terrainSeed) { state.terrainSeed = terrainSeed; loadWorld(terrainSeed); }
  history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}&terrain=${encodeURIComponent(terrainSeed)}`);
  state.started = true;
  $('overlay').classList.add('hidden');
};
$('truth').onchange = (e) => { view.truth = e.target.checked; };
$('labels-toggle').onchange = (e) => { view.labels = e.target.checked; };
$('authority').value = FUSION.authority;
$('authority').onchange = (e) => { FUSION.authority = e.target.value; };

// the operator's approval prompt: one card per pending engagement request
let approvalKey = '';
function renderApprovals() {
  const el = $('approval'), list = net.pendingRequests;
  const key = list.map((r) => r.id).join(',');
  if (key === approvalKey) return;
  approvalKey = key;
  el.classList.toggle('hidden', !list.length);
  el.innerHTML = list.map((r) => `<div class="req"><div class="req-h">AUTHORISE ENGAGEMENT?</div><div>${r.text}</div>` +
    `<div class="req-b"><button class="primary" data-id="${r.id}" data-ok="1">Approve</button><button data-id="${r.id}" data-ok="0">Deny</button></div></div>`).join('');
}
$('approval').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) net.decide(b.dataset.id, b.dataset.ok === '1');
});
$('rings').onchange = (e) => { state.showRings = e.target.checked; structures.forEach((s) => { s.ring.visible = state.showRings; }); };
$('btn-tuning').onclick = () => $('tuning').classList.toggle('hidden');

function numberField(parent, label, obj, key, { step = 1, min = 0, onChange } = {}) {
  const row = document.createElement('label');
  row.textContent = label;
  const input = document.createElement('input');
  input.type = 'number'; input.value = obj[key]; input.step = step; input.min = min;
  input.onchange = () => {
    const v = Number(input.value);
    if (Number.isFinite(v) && v >= min) { obj[key] = v; onChange && onChange(); } else input.value = obj[key];
  };
  row.appendChild(input);
  parent.appendChild(row);
}
function buildTuning() {
  const el = $('tuning');
  el.innerHTML = '';
  const head = (t) => { const h = document.createElement('div'); h.className = 'label'; h.textContent = t; el.appendChild(h); };
  head('GAME');
  numberField(el, 'Time scale (x)', WORLD, 'timeScale', { step: 0.5, min: 0.5 });
  const note = document.createElement('div');
  note.className = 'muted'; note.style.margin = '6px 0';
  note.textContent = 'Ranges, prices and drone figures are in the SAPIENT panel, Sources tab.';
  el.appendChild(note);
  head('ENEMY LEARNING (per wave)');
  numberField(el, 'Evade gain', ADAPT, 'evadePerWave', { step: 0.01 });
  numberField(el, 'Jam resist gain', ADAPT, 'jamResistPerWave', { step: 0.01 });
}

const bb = { capex: $('bb-capex'), shots: $('bb-shots'), capexT: $('bb-capex-t'), shotsT: $('bb-shots-t'), leftT: $('bb-left-t') };
const hud = {
  fill: $('health-fill'), budget: $('budget'), wave: $('wave'), kills: $('kills'), leaks: $('leaks'), btn: $('btn-wave'), status: $('status'),
};
function updateHud() {
  const k = state.health / SITE.maxHealth;
  hud.fill.style.width = (k * 100).toFixed(0) + '%';
  hud.fill.style.background = k > 0.6 ? '#4caf50' : k > 0.3 ? '#ffb300' : '#e53935';
  hud.budget.textContent = money(state.budget);
  const pct = (v) => (v > 0 ? Math.max(100 * Math.min(v / ECONOMY.budget, 1), 0.6) : 0).toFixed(2) + '%'; // a sliver stays visible
  bb.capex.style.width = pct(ledger.capex); bb.shots.style.width = pct(ledger.consumables);
  bb.capexT.textContent = money(ledger.capex); bb.shotsT.textContent = money(ledger.consumables); bb.leftT.textContent = money(state.budget);
  hud.wave.textContent = state.wave;
  hud.kills.textContent = state.kills;
  hud.leaks.textContent = state.leaks;
  const spot = spotterBonus();
  const next = state.waveActive ? state.wave : state.wave + 1; // wave these numbers apply to
  const adapted = (type) => {
    const def = DRONES[type], kk = (next - 1) * (def.adapt ?? 1);
    return Math.max(Math.min(ADAPT.evadeFloor, def.evade), def.evade * (1 - ADAPT.evadePerWave * kk));
  };
  hud.status.innerHTML = (spot > 0 ? `<span class="warn">FW Spotter on station: strikes +${Math.round(spot * 100)}%</span><br>` : '')
    + `Enemy attack cost ${money(enemyCost(ledger.launched))} &middot; shots fired ${money(ledger.consumables)}`
    + `${ledger.consumables && enemyCost(ledger.killed) ? ` &middot; $${(ledger.consumables / enemyCost(ledger.killed)).toFixed(2)} per $1 destroyed` : ''}<br>`
    + `Enemy evasion (1.00 = easy to hit): FPV ${adapted('fpv').toFixed(2)} &middot; FW ${adapted('fw').toFixed(2)}<br>Seed ${esc(state.seed)} &middot; Terrain ${esc(state.terrainSeed)}`;
  hud.btn.disabled = state.waveActive || state.over || state.sandbox;
  hud.btn.textContent = state.sandbox ? 'Exit sandbox to start' : state.waveActive ? `Wave ${state.wave} in progress` : `Start wave ${state.wave + 1}`;
  const sbInfo = $('sb-info');
  if (sbInfo && state.sandbox) sbInfo.textContent = `${state.sbQueue.length} drone(s) queued \u00b7 ${drones.length} in the air \u00b7 shots fired (free here) ${money(state.sbSpent)} \u00b7 leaks ${state.leaks}`;
  for (const def of Object.values(STRUCTURES)) toolButtons[def.id].classList.toggle('poor', state.budget < def.cost);
}

// ---------- the network design: terminals, wires and settings ----------
// Every sensor and effector reaches the fusion node through a terminal (Starlink or cellular) that costs money; the fusion
// node needs its own. Like the laydown, the wiring is locked once the first wave starts.
const designLocked = () => BUILD.lockAfterStart && state.wave > 0;
const isNode = (s) => (s.def.role === 'sensor' || s.def.role === 'effector') && s.def.id !== 'perimeter';

function buyTerminal(oldKind, newKind) { // charge or refund the difference; false if it can't be afforded
  const delta = (newKind ? COMMS[newKind].cost : 0) - (oldKind ? COMMS[oldKind].cost : 0);
  if (delta > state.budget) { toast(`Not enough budget for a ${COMMS[newKind].name} terminal (${money(COMMS[newKind].cost)})`); return false; }
  state.budget -= delta; ledger.capex += delta;
  if (oldKind) ledger.terminals[oldKind]--;
  if (newKind) ledger.terminals[newKind]++;
  return true;
}
const network = {
  // kind: 'starlink' | 'cellular' | null (unplug)
  wireNode(s, kind) {
    if (designLocked()) { toast('The network is locked once the first wave starts'); return false; }
    if ((s.uplink || null) === kind) return true;
    if (!buyTerminal(s.uplink, kind)) return false;
    s.uplink = kind;
    return true;
  },
  wireFusion(kind, on) {
    if (designLocked()) { toast('The network is locked once the first wave starts'); return false; }
    const f = net.fusion.uplinks;
    if (on === f.has(kind)) return true;
    if (on ? !buyTerminal(null, kind) : !buyTerminal(kind, null)) return false;
    if (on) f.add(kind); else f.delete(kind);
    return true;
  },
  setCellBand(s, band) { if (!designLocked()) s.cellBand = band; },
  setFusionCellBand(band) { if (!designLocked()) net.fusion.cellBand = band; },
  toggleJamBand(s, band, on) { if (on) s.jamBands.add(band); else s.jamBands.delete(band); }, // an operating setting: allowed any time
  // wire everything unwired: cellular where a tower reaches well, otherwise Starlink if it has sky, and give the fusion node both
  autoWire() {
    if (designLocked()) { toast('The network is locked once the first wave starts'); return; }
    let cell = 0, sat = 0, none = 0;
    for (const s of net.nodes.values()) {
      if (!isNode(s) || s.uplink) continue;
      const c = net.comms.linkFor(s, 'cellular', s.cellBand), k = net.comms.linkFor(s, 'starlink');
      const pick = c.up && c.quality > 0.4 ? 'cellular' : k.up ? 'starlink' : c.up ? 'cellular' : null;
      if (pick && network.wireNode(s, pick)) pick === 'cellular' ? cell++ : sat++; else none++;
    }
    network.wireFusion('starlink', true); network.wireFusion('cellular', true);
    toast(`Wired ${cell + sat} systems (${cell} cellular, ${sat} Starlink)${none ? `; ${none} could not be connected` : ''}; fusion node on both`);
  },
  clearAll() {
    if (designLocked()) { toast('The network is locked once the first wave starts'); return; }
    for (const s of net.nodes.values()) if (isNode(s) && s.uplink) network.wireNode(s, null);
    network.wireFusion('starlink', false); network.wireFusion('cellular', false);
  },
  unwired: () => [...net.nodes.values()].filter((s) => isNode(s) && !s.uplink),
};

// ---------- history for pause and rewind ----------
function takeSnapshot() {
  const m = WORLD.metresPerUnit;
  return {
    t: state.time, wave: state.wave, budget: state.budget, kills: state.kills, leaks: state.leaks, health: state.health,
    drones: drones.map((d) => ({ u: d.uid, type: d.type, x: d.pos.x, y: d.pos.y, z: d.pos.z, ry: d.group.rotation.y, tracked: !!d.track })),
    tracks: [...net.tracks.values()].filter((tr) => tr.est).map((tr) => ({
      id: tr.id, short: tr.short, status: tr.status, airframe: tr.airframe, x: tr.est.east / m, y: tr.est.up / m, z: -tr.est.north / m, kill: !!tr.killWatch,
    })),
    missiles: missiles.map((mi) => ({ x: mi.pos.x, y: mi.pos.y, z: mi.pos.z })),
    structs: structures.map((s) => {
      const tr = s.task && net.tracks.get(s.task.trackId);
      return { id: s.nodeId, mode: s.mode, target: s.task ? s.task.drone.uid : null, trackShort: tr ? tr.short : null };
    }),
  };
}

// While rewinding, the live objects are hidden and the replay view is shown instead.
function hideLive() {
  for (const d of drones) { d.group.visible = false; if (d.fibre) d.fibre.visible = false; d.label.style.display = 'none'; }
  for (const b of beliefs.values()) { b.group.visible = false; b.link.visible = false; b.label.style.display = 'none'; }
  for (const r of rayPool) r.visible = false;
  for (const mi of missiles) mi.mesh.visible = false;
  for (const e of effects) e.mesh.visible = false;
  for (const s of structures) if (s.beam) s.beam.visible = false;
}

// ---------- minimap ----------
// A top-down map centred on the station: shaded relief, the build zone, every system with its range, the fused tracks,
// the real drones (when the truth overlay is on) and the camera's field of view. Click or drag to move the camera there.
let mmTick = 0;
const mm = { span: 6500, el: $('minimap-canvas'), drag: false };
const mmg = mm.el.getContext('2d');
const mmXY = (xm, zm) => [(xm / mm.span + 1) * mm.el.width / 2, (zm / mm.span + 1) * mm.el.width / 2];
function drawMinimap() {
  const g = mmg, w = mm.el.width, mpu = WORLD.metresPerUnit, data = terrainState.data;
  const px = (metres) => (metres / mm.span) * (w / 2);
  g.fillStyle = '#0a1120'; g.fillRect(0, 0, w, w);
  if (terrainState.hillshade) {
    const half = px(data.R);
    g.globalAlpha = 0.85; g.drawImage(terrainState.hillshade, w / 2 - half, w / 2 - half, 2 * half, 2 * half); g.globalAlpha = 1;
  }
  const [ox, oy] = mmXY(0, 0);
  const ring = (r, col, dash) => {
    g.beginPath(); g.arc(ox, oy, px(r), 0, Math.PI * 2); g.strokeStyle = col; g.setLineDash(dash || []); g.lineWidth = 1; g.stroke(); g.setLineDash([]);
  };
  ring(BUILD.maxDist, 'rgba(92,123,176,0.9)', [3, 3]);
  ring(WORLD.spawnDist, 'rgba(255,255,255,0.18)', [2, 4]);
  ring(SITE.radius, 'rgba(255,82,82,0.95)');
  for (const s of structures) {
    const [x, y] = mmXY(s.pos.x * mpu, s.pos.z * mpu);
    if (state.showRings) { g.beginPath(); g.arc(x, y, px(s.def.range), 0, Math.PI * 2); g.strokeStyle = hexCss(s.def.color) + '66'; g.lineWidth = 1; g.stroke(); }
    g.fillStyle = hexCss(s.def.color); g.fillRect(x - 3, y - 3, 6, 6);
  }
  g.fillStyle = '#ffffff'; g.fillRect(ox - 2, oy - 2, 4, 4);
  for (const tr of net.tracks.values()) {
    if (!tr.est) continue;
    const [x, y] = mmXY(tr.est.east, -tr.est.north);
    g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath();
    g.strokeStyle = hexCss(trackColour(tr)); g.lineWidth = 1.2; g.stroke();
  }
  if (view.truth && view.replayT == null) {
    for (const d of drones) {
      const [x, y] = mmXY(d.pos.x * mpu, d.pos.z * mpu);
      if (x < 0 || y < 0 || x > w || y > w) continue;
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2);
      g.fillStyle = d.detected ? hexCss(d.def.color) : '#6b7686'; g.fill();
    }
  }
  // the camera's view
  const [cx, cy] = mmXY(camera.position.x * mpu, camera.position.z * mpu);
  const ang = Math.atan2(controls.target.x - camera.position.x, controls.target.z - camera.position.z);
  const h = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), len = w * 0.22;
  g.beginPath(); g.moveTo(cx, cy);
  g.lineTo(cx + Math.sin(ang - h / 2) * len, cy + Math.cos(ang - h / 2) * len);
  g.lineTo(cx + Math.sin(ang + h / 2) * len, cy + Math.cos(ang + h / 2) * len);
  g.closePath(); g.fillStyle = 'rgba(255,255,255,0.13)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#9fb2cf'; g.font = '600 10px system-ui, sans-serif'; g.fillText('N', w / 2 - 3, 11);
  g.fillStyle = '#7f93b2'; g.fillText(`${(mm.span / 1000).toFixed(1)} km`, 5, w - 6);
}
function mmGoto(e) {
  const r = mm.el.getBoundingClientRect(), mpu = WORLD.metresPerUnit;
  const tx = (((e.clientX - r.left) / r.width) * 2 - 1) * (mm.span / mpu), tz = (((e.clientY - r.top) / r.height) * 2 - 1) * (mm.span / mpu);
  const dx = tx - controls.target.x, dz = tz - controls.target.z, dy = hereU(tx, tz) - controls.target.y;
  controls.target.x += dx; controls.target.z += dz; controls.target.y += dy;
  camera.position.x += dx; camera.position.z += dz; camera.position.y += dy;
}
mm.el.addEventListener('pointerdown', (e) => { mm.drag = true; mm.el.setPointerCapture(e.pointerId); mmGoto(e); });
mm.el.addEventListener('pointermove', (e) => { if (mm.drag) mmGoto(e); });
mm.el.addEventListener('pointerup', () => { mm.drag = false; });
mm.el.addEventListener('wheel', (e) => { e.preventDefault(); mm.span = clamp(mm.span * (e.deltaY > 0 ? 1.15 : 0.87), 1500, 9000); }, { passive: false });
$('track-hi').onchange = (e) => { trackHi = e.target.checked; document.body.classList.toggle('track-hi', trackHi); };

// ---------- reset ----------
function resetLedger() {
  Object.assign(ledger, {
    capex: 0, consumables: 0, shots: {}, launched: {}, killed: {}, leaked: {}, escaped: {}, killedBy: {},
    terminals: { starlink: 0, cellular: 0 }, lost: {}, lostValue: 0,
  });
}
let startLaydown = null; // what the current run started with, so a reset can bring back systems the enemy destroyed
function captureLaydown() {
  return {
    // sorted, so the order systems were placed in cannot change the run
    structures: structures.map((s) => ({ id: s.def.id, x: s.pos.x, z: s.pos.z, uplink: s.uplink || null, cellBand: s.cellBand, jam: s.jamBands ? [...s.jamBands] : null }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.x - b.x || a.z - b.z),
    fusionUplinks: [...net.fusion.uplinks], fusionCell: net.fusion.cellBand,
  };
}
function restoreLaydown(spec) { // rebuild the systems and their wiring, charging the budget as if they had just been bought
  const charge = (v) => { state.budget -= v; ledger.capex += v; };
  for (const l of spec.structures) {
    const s = addStructure(l.id, l.x, l.z);
    charge(s.def.cost);
    if (l.uplink) { s.uplink = l.uplink; ledger.terminals[l.uplink]++; charge(COMMS[l.uplink].cost); }
    s.cellBand = l.cellBand;
    if (l.jam && s.jamBands) s.jamBands = new Set(l.jam);
  }
  for (const k of spec.fusionUplinks) { net.fusion.uplinks.add(k); ledger.terminals[k]++; charge(COMMS[k].cost); }
  net.fusion.cellBand = spec.fusionCell;
}
// Start the run again from the beginning, on the same seed. 'keep' rebuilds the current laydown and wiring; 'clear' starts empty.
function resetRun(mode = 'keep') {
  const spec = mode === 'keep' ? startLaydown || captureLaydown() : null;
  startLaydown = null;
  replay.reset();
  for (const s of structures.slice()) removeStructure(s);
  for (const d of drones.slice()) removeDrone(d);
  for (let i = missiles.length - 1; i >= 0; i--) endMissile(missiles[i], i);
  for (const e of effects) { scene.remove(e.mesh); e.mesh.material.dispose(); }
  effects.length = 0;
  for (const b of beliefs.values()) disposeBelief(b);
  beliefs.clear();
  Object.assign(state, {
    health: SITE.maxHealth, budget: ECONOMY.budget, wave: 0, kills: 0, leaks: 0, hits: 0, time: 0, warnedWire: false, over: false,
    waveActive: false, queue: [], waveTime: 0, autoTimer: -1, flash: 0, sandbox: false, sbLevel: 1, sbQueue: [], sbTime: 0, sbSpent: 0,
  });
  resetLedger();
  rec.clear(); stepCount = 0; simAcc = 0; droneUid = 0; droneCount = 0; pausedForApproval = false; approvalKey = '';
  seedAll(state.seed);
  net.init();
  if (spec) restoreLaydown(spec);
  setSpeed(1);
  $('sandbox').classList.add('hidden'); $('sandbox-banner').classList.add('hidden');
  $('btn-sandbox').textContent = 'Sandbox';
  $('overlay').classList.add('hidden');
  toast(spec ? 'Run reset: same laydown and seed' : 'New laydown: the site is empty');
}
// The first wave starts from a clean rebuild, so time spent building (sensor sweeps, random draws, messages) cannot affect the run.
// shortcut: time between later waves still changes the run's noise, recorded as an operator input in the command log (Phase 3).
function beginRun() {
  const { speed, lastSpeed } = state;
  resetRun('keep');
  setSpeed(speed); state.lastSpeed = lastSpeed; state.warnedWire = true;
  startLaydown = captureLaydown();
}
$('btn-reset').onclick = () => { if (state.started) resetRun('keep'); };
let clearArmed = 0;
$('btn-clear').onclick = (e) => { // two clicks, since it throws the laydown away
  if (!state.started) return;
  if (!clearArmed) {
    e.target.textContent = 'Sure? Click again';
    clearArmed = setTimeout(() => { clearArmed = 0; e.target.textContent = 'New laydown'; }, 3000);
    return;
  }
  clearTimeout(clearArmed); clearArmed = 0; e.target.textContent = 'New laydown';
  resetRun('clear');
};

// ---------- sandbox ----------
// Try attacks against the laydown before committing to a real wave. The site and the systems cannot be damaged, shots are free,
// and the wave counter does not move, so the laydown stays editable. Leaving resets the run (the laydown and wiring are kept).
const COMPASS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
function buildSandbox() {
  const el = $('sandbox');
  const types = Object.entries(DRONES).map(([k, d]) => `<option value="${k}">${d.name}</option>`).join('');
  const dirs = COMPASS.map(([n, b]) => `<option value="${b}">${n}</option>`).join('') + '<option value="rand">Random</option>';
  el.innerHTML = `<h3>SANDBOX</h3>
    <div class="note">Attack your laydown without consequences: the site and your systems cannot be damaged and shots are free. Leaving resets the run and keeps your laydown, so you can still place and wire systems here.</div>
    <label>Enemy has adapted to wave <select id="sb-level">${[1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<option value="${n}">${n}</option>`).join('')}</select></label>
    <div class="row"><button id="sb-wave" class="primary">Launch that wave's attack</button></div>
    <div class="label" style="margin-top:8px">CUSTOM ATTACK</div>
    <label>Drone <select id="sb-type">${types}</select></label>
    <label>Number <input id="sb-count" type="number" min="1" max="30" value="3"></label>
    <label>From <select id="sb-dir">${dirs}</select></label>
    <label>Seconds apart <input id="sb-gap" type="number" min="0" max="60" value="4"></label>
    <div class="row"><button id="sb-launch" class="primary">Launch</button><button id="sb-clear">Clear drones</button><button id="sb-exit">Exit sandbox</button></div>
    <div id="sb-info" class="note"></div>`;
  $('sb-level').onchange = (e) => { state.sbLevel = Number(e.target.value); };
  $('sb-wave').onclick = () => {
    const lvl = state.sbLevel;
    for (const q of makeWave(lvl, waveStream(state.seed, lvl))) state.sbQueue.push({ ...q, t: q.t + state.sbTime });
    state.sbQueue.sort((a, b) => a.t - b.t);
  };
  $('sb-launch').onclick = () => {
    const n = clamp(Math.round(Number($('sb-count').value) || 1), 1, 30), gap = Math.max(Number($('sb-gap').value) || 0, 0);
    const dir = $('sb-dir').value, type = $('sb-type').value;
    for (let i = 0; i < n; i++) {
      const bearing = (dir === 'rand' ? rand() * 360 : Number(dir)) * Math.PI / 180 - Math.PI / 2; // compass bearing to a scene angle
      state.sbQueue.push({ t: state.sbTime + i * gap, type, bearing, jitter: 0, altFrac: rand(), freq: rand() < 0.5 ? 2.4e9 : 5.8e9 });
    }
    state.sbQueue.sort((a, b) => a.t - b.t);
  };
  $('sb-clear').onclick = () => { state.sbQueue.length = 0; for (const d of drones.slice()) removeDrone(d); };
  $('sb-exit').onclick = () => exitSandbox();
}
function enterSandbox() {
  if (!state.started || state.over) return;
  if (state.wave > 0) { toast('The sandbox is only available before the first wave'); return; }
  state.sandbox = true; state.sbQueue = []; state.sbTime = 0; state.sbSpent = 0;
  $('sandbox').classList.remove('hidden'); $('sandbox-banner').classList.remove('hidden'); $('tuning').classList.add('hidden');
  $('btn-sandbox').textContent = 'Exit sandbox';
}
function exitSandbox() { resetRun('keep'); toast('Sandbox closed: run reset, laydown kept'); }
$('btn-sandbox').onclick = () => (state.sandbox ? exitSandbox() : enterSandbox());
buildSandbox();

// ---------- main loop ----------
let stepCount = 0;
function step(dt) {
  state.time += dt;
  updateWaves(dt);
  net.update(dt);
  updateStructures(dt);
  updateMissiles(dt);
  updateDrones(dt);
  if (++stepCount % SNAPSHOT_EVERY === 0) rec.push(takeSnapshot());
}

const clock = new THREE.Clock();
let simAcc = 0;
function frame() {
  const real = Math.min(clock.getDelta(), 0.05);
  if (state.started && !state.over && state.speed > 0) {
    // fixed-size steps: the same seed and laydown give the same run at any frame rate or speed
    simAcc += real * WORLD.timeScale * state.speed;
    let n = 0;
    while (simAcc >= SIM_STEP && n < 400 && !state.over) { step(SIM_STEP); simAcc -= SIM_STEP; n++; }
    if (n >= 400) simAcc = 0;
  }
  updateEffects(real);

  for (const s of structures) {
    if (s.parts.spin) s.parts.spin.rotation.y += real * (s.def.id === 'radar' ? 2.2 : 0.6);
    if (s.pulse) {
      const active = s.mode === 'Jam';
      s.pulse.visible = active;
      if (active) {
        s.pulseT = (s.pulseT + real * 0.5) % 1;
        const r = u(s.def.range) * s.pulseT;
        s.pulse.scale.set(r, 1, r);
        s.pulse.material.opacity = 0.6 * (1 - s.pulseT);
      }
    }
  }
  updateDroneVisuals(real);
  updateBeliefs();
  updateLabels();
  if ((++mmTick & 1) === 0) drawMinimap();
  replay.update(real, camera);
  renderApprovals();

  if (ghostRing || tool === 'sell') {
    ghost.visible = mouseOnGround && !!tool && state.started;
    ghost.position.set(mouseGround.x, mouseGround.y + 0.1, mouseGround.z);
    if (ghostRing && mouseOnGround && (ghostAt.x !== mouseGround.x || ghostAt.z !== mouseGround.z)) {
      ghostRing.update(mouseGround.x, mouseGround.z); // re-drape the ring over the ground under the cursor
      ghostAt = { x: mouseGround.x, z: mouseGround.z };
    }
    const ok = tool === 'sell' || canPlace(mouseGround.x, mouseGround.z, STRUCTURES[tool]);
    ghostMat.color.set(tool === 'sell' ? 0xff9800 : ok ? 0x66ff66 : 0xff5252);
  } else ghost.visible = false;

  state.flash = Math.max(0, state.flash - real);
  siteMat.emissiveIntensity = state.flash > 0 ? state.flash * 1.5 : 0;

  updateHud();
  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
buildToolbar();
buildTuning();
const replay = createReplay({
  scene, rec, droneTemplate, makeLabel, placeLabel, trackColour,
  getStructures: () => structures, hideLive,
  setSpeed: (s) => setSpeed(s), getLastSpeed: () => state.lastSpeed, setPaused: () => setSpeed(0),
});
initDock({
  net, structures, drones, ledger, state, network, designLocked, money,
  stepOnce: () => { state.started = true; step(SIM_STEP); }, pause: () => setSpeed(0), // for "step to next packet"
  // a figure was edited in the Sources tab: redraw anything built from it
  onFiguresChanged() { structures.forEach(makeRing); refreshGhost(); rebuildToolbar(); buildTuning(); },
});
renderer.setAnimationLoop(frame);

// Headless helpers for experiments and tests: step the sim without rendering, and fingerprint a run.
function runHeadless(steps) {
  state.started = true;
  for (let i = 0; i < steps && !state.over; i++) step(SIM_STEP);
}
function digest() { // FNV-1a over every message sent, plus the headline numbers
  let h = 0x811c9dc5;
  const feed = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } };
  for (const e of bus.entries) feed(JSON.stringify(e.msg));
  feed(JSON.stringify([state.kills, state.health, state.budget, state.leaks, state.time, bus.seq, ledger]));
  return (h >>> 0).toString(16);
}

// handy for poking at the game from the dev console
window.game = { state, drones, structures, missiles, net, camera, controls, terrainState, addStructure, startWave, spawnDrone, runHeadless, digest, resetRun, enterSandbox, ledger, money, enemyCost, rec, replay, FUSION, network, WORLD, STRUCTURES, DRONES };
