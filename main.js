import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  WORLD, SITE, BUILD, START_CREDITS, STRUCTURES, DRONES, ADAPT,
  makeWave, waveBonus, applyRangeScale,
} from './config.js';
import { createNetwork } from './network.js';
import { initDock } from './sapient-ui.js';
import { bus } from './sapient.js';
import { view } from './view.js';
import { seedAll, rand, waveStream } from './rng.js';

const $ = (id) => document.getElementById(id);
const SIM_STEP = 0.05; // fixed simulation step in game seconds, so a run does not depend on frame rate

// The scenario seed fixes every chance event: wave contents, sensor noise, hit rolls, message IDs.
const seedParam = new URLSearchParams(location.search).get('seed') || '1';
seedAll(seedParam);
const u = (metres) => metres / WORLD.metresPerUnit;           // metres -> scene units
const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
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

const groundR = u(WORLD.radius);
const ground = new THREE.Mesh(new THREE.CircleGeometry(groundR, 96), new THREE.MeshStandardMaterial({ color: 0x18261f, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(groundR * 2, Math.round((groundR * 2) / u(500)), 0x2c4a3c, 0x203a2e); // 500 m cells
grid.position.y = 0.05;
scene.add(grid);
const buildZone = new THREE.Mesh(
  new THREE.RingGeometry(u(BUILD.maxDist) - 0.5, u(BUILD.maxDist), 128).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x5c7bb0, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
buildZone.position.y = 0.1;
scene.add(buildZone);

// ---------- the protected site ----------
const SITE_POS = new THREE.Vector3(0, 0, 0);
const SITE_TARGET = new THREE.Vector3(0, u(SITE.targetAlt), 0);
const siteMat = new THREE.MeshStandardMaterial({ color: 0x8aa0b4, roughness: 0.7, emissive: 0xff0000, emissiveIntensity: 0 });
{
  const g = new THREE.Group();
  const box = (w, h, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), siteMat); m.position.set(x, h / 2, z); g.add(m); };
  box(8, 3, 6, 0, 0); box(3, 2, 3, 5, 3); box(3, 2, 3, -5, -3); box(2, 1.5, 4, -4, 4);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 7, 12), siteMat);
  tower.position.set(2, 3.5, -2); g.add(tower);
  g.scale.setScalar(1.5);
  scene.add(g);
  const ring = new THREE.Mesh(new THREE.RingGeometry(u(SITE.radius) - 0.3, u(SITE.radius), 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.position.y = 0.1;
  scene.add(ring);
}

// ---------- state ----------
const state = {
  seed: seedParam, health: SITE.maxHealth, credits: START_CREDITS, wave: 0, kills: 0, score: 0, time: 0,
  speed: 1, lastSpeed: 1, started: false, over: false,
  waveActive: false, queue: [], waveTime: 0, autoTimer: -1, flash: 0, showRings: true,
};
const drones = [], structures = [], missiles = [], effects = [];

// ---------- SAPIENT network ----------
const net = createNetwork({
  drones,
  getTime: () => state.time,
  // An effector decides whether it can take a task from the fusion node.
  acceptTask(s, d) {
    if (!d || d.dead) return { ok: false, reasons: ['target no longer exists'] };
    if (s.pos.distanceTo(d.pos) > u(s.def.range)) return { ok: false, reasons: ['target outside effector range'] };
    if (state.credits < (s.def.shotCost || 0)) return { ok: false, reasons: ['insufficient credits for ammunition'] };
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
    case 'turret': {
      head.position.y = 1.2;
      head.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.4), mat(def.color, 0.15)));
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2, 8).rotateX(Math.PI / 2), mat(0x333333));
      barrel.position.z = 1.2; head.add(barrel); break;
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
    case 'interceptor': {
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
function ringGeometry(rUnits, thickness) {
  return new THREE.RingGeometry(Math.max(rUnits - thickness, 0.01), rUnits, 128).rotateX(-Math.PI / 2);
}
const ringThickness = (r) => Math.max(0.4, r * 0.006);

function makeRing(s) {
  if (s.ring) { s.group.remove(s.ring); s.ring.geometry.dispose(); s.ring.material.dispose(); }
  const r = u(s.def.range);
  s.ring = new THREE.Mesh(ringGeometry(r, ringThickness(r)),
    new THREE.MeshBasicMaterial({ color: s.def.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  s.ring.position.y = 0.15;
  s.ring.visible = state.showRings;
  s.group.add(s.ring);
}

function addStructure(id, x, z) {
  const def = STRUCTURES[id];
  const holder = new THREE.Group();
  const { group: model, parts } = buildModel(id);
  model.scale.setScalar(STRUCT_SCALE);
  holder.add(model);
  holder.position.set(x, 0, z);
  scene.add(holder);
  const s = { def, group: holder, parts, pos: new THREE.Vector3(x, 0, z), cd: 0, ring: null, beam: null, pulse: null, pulseT: (structures.length * 0.37) % 1 };
  makeRing(s);
  if (id === 'laser') {
    s.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: def.color }));
    s.beam.frustumCulled = false; s.beam.visible = false; scene.add(s.beam);
  }
  if (id === 'jammer') {
    s.pulse = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    s.pulse.position.y = 0.2; holder.add(s.pulse);
  }
  structures.push(s);
  net.registerNode(s);
  return s;
}

function removeStructure(s) {
  net.deregisterNode(s);
  scene.remove(s.group);
  s.ring.geometry.dispose(); s.ring.material.dispose();
  if (s.beam) { scene.remove(s.beam); s.beam.geometry.dispose(); s.beam.material.dispose(); }
  if (s.pulse) { s.pulse.geometry.dispose(); s.pulse.material.dispose(); }
  structures.splice(structures.indexOf(s), 1);
}

const ghost = new THREE.Group();
ghost.visible = false;
scene.add(ghost);
let ghostRing = null;
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const ghostMarker = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.5, 16), ghostMat);
ghostMarker.scale.setScalar(STRUCT_SCALE);
ghost.add(ghostMarker);
function refreshGhost() {
  if (ghostRing) { ghost.remove(ghostRing); ghostRing.geometry.dispose(); ghostRing = null; }
  const def = STRUCTURES[tool];
  if (def) {
    const r = u(def.range);
    ghostRing = new THREE.Mesh(ringGeometry(r, ringThickness(r) * 1.5), ghostMat);
    ghostRing.position.y = 0.2; ghost.add(ghostRing);
  }
}

// ---------- tools / input ----------
let tool = null; // structure id | 'sell' | null
const toolButtons = {};
function buildToolbar() {
  const bar = $('toolbar');
  for (const def of Object.values(STRUCTURES)) {
    const b = document.createElement('button');
    b.className = 'tool';
    b.style.borderTopColor = '#' + def.color.toString(16).padStart(6, '0');
    b.title = `${def.desc}\nModelled on: ${def.ref.analogues.join(', ')}`;
    b.innerHTML = `<div class="n">${def.name}</div><div class="c">$${def.cost}</div><div class="k">[${def.key}]</div>`;
    b.onclick = () => setTool(def.id);
    bar.appendChild(b);
    toolButtons[def.id] = b;
  }
  const sell = document.createElement('button');
  sell.className = 'tool';
  sell.title = 'Click a structure to sell it for a partial refund';
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
  mouseOnGround = !!raycaster.ray.intersectPlane(groundPlane, mouseGround);
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

function canPlace(x, z, def) {
  const r = Math.hypot(x, z);
  if (r < u(BUILD.minDist) || r > u(BUILD.maxDist)) return false;
  if (state.credits < def.cost) return false;
  return !structures.some((s) => hdist(s.pos, { x, z }) < u(BUILD.spacing));
}

function handleClick() {
  if (!tool || state.over || !state.started || !mouseOnGround) return;
  if (tool === 'sell') {
    let best = null, bd = u(150);
    for (const s of structures) { const d = hdist(s.pos, mouseGround); if (d < bd) { bd = d; best = s; } }
    if (best) {
      state.credits += Math.round(best.def.cost * BUILD.sellRefund);
      removeStructure(best);
    }
    return;
  }
  const def = STRUCTURES[tool];
  if (canPlace(mouseGround.x, mouseGround.z, def)) {
    state.credits -= def.cost;
    addStructure(def.id, mouseGround.x, mouseGround.z);
  } else if (state.credits < def.cost) {
    toast('Not enough credits');
  } else {
    toast(`Build between ${BUILD.minDist} m and ${BUILD.maxDist} m from the site, clear of other structures`);
  }
}

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') { if (tool) setTool(tool); return; }
  if (e.key === ' ') { e.preventDefault(); setSpeed(state.speed === 0 ? state.lastSpeed || 1 : 0); return; }
  if (e.key === 'r' || e.key === 'R') { $('rings').click(); return; }
  if (e.key === 't' || e.key === 'T') { $('truth').click(); return; }
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
let droneCount = 0;

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
  // the enemy adapts: later waves spawn harder to hit and harder to jam
  const k = Math.max(state.wave - 1, 0) * (def.adapt ?? 1);
  const evade = Math.max(Math.min(ADAPT.evadeFloor, def.evade), def.evade * (1 - ADAPT.evadePerWave * k));
  const jamResist = Math.max(def.jamResist, Math.min(ADAPT.jamResistCap, def.jamResist + ADAPT.jamResistPerWave * k));

  // chance is pre-rolled by the wave's seeded stream; ad-hoc spawns (console, tests) draw from the sim stream
  const jitter = rolls.jitter ?? (rand() - 0.5) * 0.3;
  const altFrac = rolls.altFrac ?? rand();
  const freq = rolls.freq ?? (rand() < 0.5 ? 2.4e9 : 5.8e9);
  const a = bearing + jitter;
  const y = u(def.alt[0] + altFrac * (def.alt[1] - def.alt[0]));
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
  const pos = new THREE.Vector3(Math.cos(a) * u(WORLD.spawnDist), y, Math.sin(a) * u(WORLD.spawnDist));
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

  drones.push({
    def, type, pos, group, model, unseen, rotors, bar, fill, fillMat, drop, dropMat, fibre,
    hp: def.hp, evade, jamResist, jamT: 0, detected: false, dead: false, phase: (droneCount++ * 1.7) % 6,
    mode: 'approach', angle: 0, orbitT: 0, bank: 0,         // spotter state
    vel: new THREE.Vector3(), freq, track: null,
  });
}

function removeDrone(d) {
  d.dead = true;
  net.onDroneRemoved(d);
  scene.remove(d.group);
  if (d.fibre) { scene.remove(d.fibre); d.fibre.geometry.dispose(); d.fibre.material.dispose(); }
  d.fillMat.dispose(); d.dropMat.dispose();
  const i = drones.indexOf(d);
  if (i >= 0) drones.splice(i, 1);
}

function damageDrone(d, amount) {
  if (d.dead) return;
  d.hp -= amount;
  const k = Math.max(d.hp / d.def.hp, 0);
  d.fill.scale.x = k;
  d.fillMat.color.setHSL(k * 0.33, 1, 0.5);
  if (d.hp <= 0) {
    state.kills++; state.score += d.def.reward; state.credits += d.def.reward;
    addExplosion(d.pos, u(80), 0xffcc66);
    removeDrone(d);
  }
}

// each spotter on station makes every strike hit harder
const spotterBonus = () => drones.reduce((sum, d) => sum + (d.mode === 'orbit' ? d.def.spotBonus || 0 : 0), 0);

function impact(d) {
  state.health = Math.max(state.health - d.def.damage * (1 + spotterBonus()), 0);
  state.flash = 0.4;
  net.raiseAlert('critical', `Site impact by ${d.def.name}: integrity ${Math.round(state.health)}%`, d.pos, 'DISCRETE_PRIORITY_HIGH');
  addExplosion(d.pos, u(150), 0xff5252);
  removeDrone(d);
  if (state.health <= 0) gameOver();
}

// Spotter: flies out to its standoff radius, orbits for loiterTime, then leaves. Returns false if it was removed.
function moveSpotter(d, spd, dt) {
  const r = u(d.def.loiterDist);
  if (d.mode === 'approach') {
    if (hdist(d.pos, SITE_POS) <= r) {
      d.mode = 'orbit'; d.angle = Math.atan2(d.pos.z, d.pos.x); d.orbitT = 0;
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
    if (hdist(d.pos, SITE_POS) > u(WORLD.spawnDist)) { removeDrone(d); return false; }
  }
  return true;
}

function updateDrones(dt) {
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i];
    d.detected = net.isTracked(d);

    // jamming: slows the drone, and link-dependent ones eventually lose control and crash
    let slow = 1, jamTime = Infinity;
    const eff = 1 - d.jamResist;
    if (eff > 0) {
      for (const s of structures) {
        if (s.def.id !== 'jammer' || s.mode !== 'Jam' || s.pos.distanceTo(d.pos) > u(s.def.range)) continue;
        slow = Math.min(slow, 1 - (1 - s.def.slow) * eff);
        jamTime = Math.min(jamTime, s.def.killTime);
      }
    }
    if (jamTime < Infinity) {
      d.jamT += dt * eff;
      if (d.jamT >= jamTime) {
        state.kills++; state.score += Math.round(d.def.reward / 2); state.credits += Math.round(d.def.reward / 2);
        addExplosion(d.pos, u(80), 0xba68c8);
        removeDrone(d);
        continue;
      }
    } else d.jamT = Math.max(0, d.jamT - dt * 0.5);

    const px = d.pos.x, py = d.pos.y, pz = d.pos.z;
    const spd = u(d.def.speed) * slow * dt;
    if (d.def.role === 'spotter') {
      if (!moveSpotter(d, spd, dt)) continue;
    } else {
      if (hdist(d.pos, SITE_POS) < u(SITE.radius)) { impact(d); continue; }
      _v.subVectors(SITE_TARGET, d.pos).normalize().multiplyScalar(spd);
      d.pos.add(_v);
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
// Each fused track is drawn where the fusion node thinks the drone is, with an error circle. Tracks with no range
// fix (bearing-only sensors such as RF) also show the bearing rays, so you can see where two rays would cross.
const diamondGeo = new THREE.OctahedronGeometry(1, 0);
const ringUnit = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 49 }, (_, i) => new THREE.Vector3(Math.cos((i / 48) * Math.PI * 2), 0, Math.sin((i / 48) * Math.PI * 2))));
const beliefs = new Map(); // track id -> markers
const labelLayer = $('labels');
const _p = new THREE.Vector3();

function makeBelief(tr) {
  const group = new THREE.Group();
  const diamond = new THREE.Mesh(diamondGeo, new THREE.MeshBasicMaterial({ color: 0xffcc66, depthTest: false }));
  diamond.renderOrder = 20;
  const ring = new THREE.LineLoop(ringUnit, new THREE.LineBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.7 }));
  const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x8a94a3, transparent: true, opacity: 0.6 }));
  link.frustumCulled = false;
  group.add(diamond, ring);
  scene.add(group, link);
  const label = document.createElement('div');
  label.className = 'tlabel';
  labelLayer.appendChild(label);
  return { group, diamond, ring, link, rays: [], label, pos: new THREE.Vector3(), hasPos: false };
}

function disposeBelief(b) {
  scene.remove(b.group, b.link);
  b.diamond.material.dispose(); b.ring.material.dispose(); b.link.geometry.dispose(); b.link.material.dispose();
  for (const r of b.rays) { scene.remove(r); r.geometry.dispose(); r.material.dispose(); }
  b.label.remove();
}

function updateBeliefs() {
  const m = WORLD.metresPerUnit;
  for (const [id, b] of beliefs) if (!net.tracks.has(id)) { disposeBelief(b); beliefs.delete(id); }
  for (const tr of net.tracks.values()) {
    let b = beliefs.get(tr.id);
    if (!b) { b = makeBelief(tr); beliefs.set(tr.id, b); }
    const srcs = [...tr.sources.values()];
    const hasFix = srcs.some((v) => v.fix);
    // position estimate
    b.hasPos = !!tr.est;
    if (tr.est) {
      _p.set(tr.est.east / m, tr.est.up / m, -tr.est.north / m);
      if (b.pos.lengthSq() === 0) b.pos.copy(_p); else b.pos.lerp(_p, 0.35);
    }
    b.group.visible = b.hasPos;
    const size = Math.max(1.5, camera.position.distanceTo(b.pos) * 0.008);
    b.diamond.scale.setScalar(size);
    b.group.position.copy(b.pos);
    const errU = Math.max(u(tr.estErr || 0), 0.001);
    b.ring.scale.set(errU, 1, errU);
    // line from belief to truth, only when the truth overlay is on
    b.link.visible = b.hasPos && view.truth;
    if (b.link.visible) {
      const p = b.link.geometry.attributes.position;
      p.setXYZ(0, b.pos.x, b.pos.y, b.pos.z); p.setXYZ(1, tr.drone.pos.x, tr.drone.pos.y, tr.drone.pos.z); p.needsUpdate = true;
    }
    // bearing rays for sources without a range fix
    const bearing = hasFix ? [] : srcs.filter((v) => v.rb && v.rb.range === undefined && v.from);
    while (b.rays.length < bearing.length) {
      const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7 }));
      ray.frustumCulled = false; scene.add(ray); b.rays.push(ray);
    }
    b.rays.forEach((ray, i) => {
      const v = bearing[i];
      ray.visible = !!v;
      if (!v) return;
      const az = (v.rb.azimuth * Math.PI) / 180, el = ((v.rb.elevation || 0) * Math.PI) / 180;
      const len = 3500; // metres drawn
      const p = ray.geometry.attributes.position;
      p.setXYZ(0, v.from.east / m, v.from.up / m, -v.from.north / m);
      p.setXYZ(1, (v.from.east + len * Math.cos(el) * Math.sin(az)) / m, (v.from.up + len * Math.sin(el)) / m, -(v.from.north + len * Math.cos(el) * Math.cos(az)) / m);
      p.needsUpdate = true;
      ray.material.color.setHex(v.color);
    });
    // label
    if (b.hasPos) _p.copy(b.pos); else if (bearing[0]) _p.set((bearing[0].from.east) / m, bearing[0].from.up / m, -bearing[0].from.north / m);
    _p.project(camera);
    const show = (b.hasPos || bearing.length) && _p.z < 1;
    b.label.style.display = show ? 'block' : 'none';
    if (show) {
      b.label.style.left = ((_p.x + 1) / 2) * innerWidth + 'px';
      b.label.style.top = ((1 - _p.y) / 2) * innerHeight + 'px';
      const cls = tr.airframe && tr.airframe !== 'Unknown' ? tr.airframe : 'UAV';
      b.label.textContent = `${tr.short} · ${cls}${tr.estErr ? ` ±${Math.round(tr.estErr)} m` : ' · bearing only'}`;
    }
  }
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
    d.drop.scale.y = d.pos.y / d.group.scale.y;
    d.bar.lookAt(camera.position);
    if (d.fibre) {
      d.fibre.visible = view.truth;
      const p = d.fibre.geometry.attributes.position;
      p.setXYZ(1, d.pos.x, d.pos.y, d.pos.z); p.needsUpdate = true;
    }
  }
}

// ---------- effectors (they act only on tasks from the fusion node) ----------
const muzzle = (s) => _m.set(s.pos.x, (s.def.muzzleY || 2) * STRUCT_SCALE, s.pos.z);
const _m = new THREE.Vector3();
const aim = (s, t) => { s.parts.head.rotation.y = Math.atan2(t.pos.x - s.pos.x, t.pos.z - s.pos.z); };

function updateStructures(dt) {
  for (const s of structures) {
    const def = s.def;
    s.cd = Math.max(0, s.cd - dt);
    if (def.role === 'sensor' || def.id === 'jammer') continue;
    const range = u(def.range);
    const t = s.task && !s.task.drone.dead && s.pos.distanceTo(s.task.drone.pos) <= range ? s.task.drone : null;
    if (def.id === 'laser') {
      s.beam.visible = !!t;
      if (t) {
        aim(s, t);
        const p = s.beam.geometry.attributes.position;
        const m = muzzle(s);
        p.setXYZ(0, m.x, m.y, m.z); p.setXYZ(1, t.pos.x, t.pos.y, t.pos.z); p.needsUpdate = true;
        damageDrone(t, def.dps * dt * (0.5 + 0.5 * t.evade)); // evasion spoils beam dwell
      }
      continue;
    }
    if (!t) continue;
    aim(s, t);
    if (s.cd > 0 || state.credits < (def.shotCost || 0)) continue;
    s.cd = def.cooldown;
    if (def.id === 'turret') {
      state.credits -= def.shotCost;
      const frac = s.pos.distanceTo(t.pos) / range;
      const hit = rand() < def.accuracy * t.evade * (1 - 0.5 * frac * frac); // accuracy falls with range
      const end = t.pos.clone();
      if (!hit) end.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3));
      addTracer(muzzle(s).clone(), end, def.color);
      if (hit) damageDrone(t, def.damage);
    } else if (def.id === 'interceptor') {
      const pending = missiles.filter((m) => m.target === t).length * def.damage;
      if (pending >= t.hp) { s.cd = 0.3; continue; } // enough already in the air
      state.credits -= def.shotCost;
      launchMissile(s, t);
    }
  }
}

// ---------- missiles ----------
const missileGeo = new THREE.ConeGeometry(0.35, 1.8, 8).rotateX(Math.PI / 2);
function launchMissile(s, t) {
  const mesh = new THREE.Mesh(missileGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  mesh.scale.setScalar(STRUCT_SCALE);
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
    if (fuzed || m.life <= 0 || m.pos.y < 0.2) {
      if (fuzed) {
        const r = u(m.def.splash);
        for (const d of drones.slice()) if (d.pos.distanceTo(m.pos) < r) damageDrone(d, m.def.damage);
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
  effects.push({ kind: 'boom', mesh, r, age: 0, life: 0.5 });
}
function addTracer(a, b, color) {
  const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true }));
  mesh.frustumCulled = false;
  scene.add(mesh);
  effects.push({ kind: 'tracer', mesh, age: 0, life: 0.1 });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.age += dt;
    const k = e.age / e.life;
    if (k >= 1) {
      scene.remove(e.mesh); e.mesh.material.dispose();
      if (e.kind !== 'boom') e.mesh.geometry.dispose();
      effects.splice(i, 1);
      continue;
    }
    if (e.kind === 'boom') { e.mesh.scale.setScalar(e.r * (0.3 + 0.7 * k)); e.mesh.material.opacity = 0.8 * (1 - k); }
    else e.mesh.material.opacity = 1 - k;
  }
}

// ---------- waves ----------
function startWave() {
  if (state.waveActive || state.over || !state.started) return;
  state.wave++;
  state.queue = makeWave(state.wave, waveStream(state.seed, state.wave));
  state.waveTime = 0;
  state.waveActive = true;
  state.autoTimer = -1;
  toast(state.wave > 1 ? `Wave ${state.wave} inbound: the enemy has adapted` : `Wave ${state.wave} inbound`);
}
function updateWaves(dt) {
  if (state.waveActive) {
    state.waveTime += dt;
    while (state.queue.length && state.queue[0].t <= state.waveTime) {
      const q = state.queue.shift();
      spawnDrone(q.type, q.bearing, q);
    }
    if (!state.queue.length && !drones.some((d) => d.def.role !== 'spotter')) {
      for (const d of drones) d.mode = 'egress'; // spotters withdraw once the strike is over
      const bonus = waveBonus(state.wave);
      state.waveActive = false; state.credits += bonus; state.score += bonus;
      toast(`Wave ${state.wave} cleared! +$${bonus}`);
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
    <p>Score <b>${state.score}</b> &middot; Kills <b>${state.kills}</b></p>
    <button id="btn-restart" class="primary">Play again</button>`;
  $('overlay').classList.remove('hidden');
  $('btn-restart').onclick = () => location.reload();
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
$('btn-deploy').onclick = () => {
  const seed = $('seed-input').value.trim() || '1';
  if (seed !== state.seed) { // nothing has happened yet, so re-seeding and restarting the network is safe
    state.seed = seed;
    seedAll(seed);
    net.init();
    history.replaceState(null, '', `?seed=${encodeURIComponent(seed)}`);
  }
  state.started = true;
  $('overlay').classList.add('hidden');
};
$('truth').onchange = (e) => { view.truth = e.target.checked; };
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
  const refresh = () => { structures.forEach(makeRing); refreshGhost(); };
  head('GAME');
  numberField(el, 'Time scale (x)', WORLD, 'timeScale', { step: 0.5, min: 0.5 });
  numberField(el, 'Range scale (x published)', WORLD, 'rangeScale', { step: 0.1, min: 0.1, onChange: () => { applyRangeScale(); refresh(); buildTuning(); } });
  head('STRUCTURES (range in m)');
  for (const def of Object.values(STRUCTURES)) {
    numberField(el, def.name + ' range', def, 'range', { step: 100, min: 10, onChange: refresh });
    numberField(el, def.name + ' cost', def, 'cost', { step: 10 });
  }
  head('DRONES');
  for (const def of Object.values(DRONES)) {
    numberField(el, def.name + ' speed (m/s)', def, 'speed', { step: 5, min: 1 });
    numberField(el, def.name + ' HP', def, 'hp', { step: 5, min: 1 });
    numberField(el, def.name + ' evade', def, 'evade', { step: 0.05, min: 0.05 });
    numberField(el, def.name + ' jam resist', def, 'jamResist', { step: 0.05 });
  }
  head('ENEMY LEARNING (per wave)');
  numberField(el, 'Evade gain', ADAPT, 'evadePerWave', { step: 0.01 });
  numberField(el, 'Jam resist gain', ADAPT, 'jamResistPerWave', { step: 0.01 });
}

const hud = {
  fill: $('health-fill'), credits: $('credits'), wave: $('wave'), kills: $('kills'), score: $('score'), btn: $('btn-wave'), status: $('status'),
};
function updateHud() {
  const k = state.health / SITE.maxHealth;
  hud.fill.style.width = (k * 100).toFixed(0) + '%';
  hud.fill.style.background = k > 0.6 ? '#4caf50' : k > 0.3 ? '#ffb300' : '#e53935';
  hud.credits.textContent = '$' + Math.floor(state.credits);
  hud.wave.textContent = state.wave;
  hud.kills.textContent = state.kills;
  hud.score.textContent = state.score;
  const spot = spotterBonus();
  const next = state.waveActive ? state.wave : state.wave + 1; // wave these numbers apply to
  const adapted = (type) => {
    const def = DRONES[type], kk = (next - 1) * (def.adapt ?? 1);
    return Math.max(Math.min(ADAPT.evadeFloor, def.evade), def.evade * (1 - ADAPT.evadePerWave * kk));
  };
  hud.status.innerHTML = (spot > 0 ? `<span class="warn">FW Spotter on station: strikes +${Math.round(spot * 100)}%</span><br>` : '')
    + `Enemy evasion (1.00 = easy to hit): FPV ${adapted('fpv').toFixed(2)} &middot; FW ${adapted('fw').toFixed(2)}<br>Seed ${state.seed}`;
  hud.btn.disabled = state.waveActive || state.over;
  hud.btn.textContent = state.waveActive ? `Wave ${state.wave} in progress` : `Start wave ${state.wave + 1}`;
  for (const def of Object.values(STRUCTURES)) toolButtons[def.id].classList.toggle('poor', state.credits < def.cost);
}

// ---------- main loop ----------
function step(dt) {
  state.time += dt;
  updateWaves(dt);
  net.update(dt);
  updateStructures(dt);
  updateMissiles(dt);
  updateDrones(dt);
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

  if (ghostRing || tool === 'sell') {
    ghost.visible = mouseOnGround && !!tool && state.started;
    ghost.position.set(mouseGround.x, 0.1, mouseGround.z);
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
initDock({ net, structures, drones });
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
  feed(JSON.stringify([state.kills, state.health, state.credits, state.score, state.time, bus.seq]));
  return (h >>> 0).toString(16);
}

// handy for poking at the game from the dev console
window.game = { state, drones, structures, missiles, net, addStructure, startWave, spawnDrone, runHeadless, digest, WORLD, STRUCTURES, DRONES };
