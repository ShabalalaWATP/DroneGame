// The 3D scene: reads the simulation each frame and draws it. It never changes the simulation.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITE, BUILD } from '../sim/config/index.js';
import { terrainState } from '../sim/terrain.js';
import { u } from '../sim/units.js';
import { buildWorldView, drapedRing, groundU, makeHillshade } from './terrain-view.js';
import { createLabels } from './labels.js';
import { createStructureViews } from './structure-view.js';
import { createDroneViews } from './drone-view.js';
import { createBeliefViews } from './belief-view.js';
import { createEffects } from './effects.js';
import { createMapTexture } from './map-texture.js';
import { view } from './view.js';

// getMapSource(world): the pictures, roads and names for a real world. The simulation never sees them.
export function createGameView(canvas, labelLayer, sim, getMapSource = () => null) {
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
  const siteMat = new THREE.MeshStandardMaterial({ color: 0x8aa0b4, roughness: 0.7, emissive: 0xff0000, emissiveIntensity: 0 });
  const siteRing = drapedRing(u(SITE.radius), 0.5, 0xff5252, 0.6);
  const buildRing = drapedRing(u(BUILD.maxDist), 0.8, 0x5c7bb0, 0.4);
  scene.add(siteRing.mesh, buildRing.mesh);
  let worldView = null, flash = 0, ownMaterial = null, relief = null;
  const map = createMapTexture(renderer, () => relief);
  // Paint the chosen picture onto a real world. Resolves with how a live map's tiles went.
  function refreshMap() {
    const data = terrainState.data, source = data.geo && getMapSource(sim.state.terrainSeed);
    if (!source) return Promise.resolve(null);
    return map.paint(data, source, { baseMap: view.baseMap, roads: view.mapRoads, grid: view.mapGrid }).then((result) => {
      if (terrainState.data === data) terrainState.hillshade = map.small;
      return result;
    });
  }
  function loadWorld() {
    if (worldView) { worldView.mesh.material = ownMaterial; worldView.dispose(); }
    relief = makeHillshade(terrainState.data);
    terrainState.hillshade = relief;
    worldView = buildWorldView(scene, terrainState.data, siteMat);
    ownMaterial = worldView.mesh.material;
    if (terrainState.data.geo) { worldView.mesh.material = map.material; refreshMap(); }
    siteRing.update(0, 0);
    buildRing.update(0, 0);
  }
  // Plan view is the same camera looking straight down, as the minimap reads its field of view and placement raycasts through it.
  let beforePlan = null;
  function viewFromAbove(on) {
    if (on && !beforePlan) {
      beforePlan = { position: camera.position.clone(), target: controls.target.clone() };
      camera.position.set(controls.target.x, Math.max(camera.position.y, 500), controls.target.z + 0.01);
    } else if (!on && beforePlan) {
      camera.position.copy(beforePlan.position); controls.target.copy(beforePlan.target);
      beforePlan = null;
    }
    controls.enableRotate = !on;
  }
  // Move the camera over a point, keeping its angle and distance.
  function centreOn(x, z) {
    const dx = x - controls.target.x, dz = z - controls.target.z, dy = groundU(x, z) - controls.target.y;
    controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
  }
  const mePin = new THREE.Mesh(new THREE.CylinderGeometry(3, 0.4, 14, 12).translate(0, 7, 0), new THREE.MeshBasicMaterial({ color: 0x2979ff, depthTest: false, transparent: true }));
  mePin.renderOrder = 15; mePin.visible = false;
  scene.add(mePin);

  loadWorld();
  sim.on('terrain', loadWorld);
  sim.on('siteHit', () => { flash = 0.4; });

  const labels = createLabels(labelLayer, camera);
  const structures = createStructureViews(scene, sim, labels);
  const drones = createDroneViews(scene, sim, labels, camera);
  const beliefs = createBeliefViews(scene, sim.net, camera, labelLayer);
  const effects = createEffects(scene, sim);

  // Show the live state of the simulation. Replay runs after this and hides what it replaces.
  function update(real) {
    effects.update(real);
    structures.sync(real);
    drones.sync(real);
    beliefs.update();
    structures.updateLabels(sim.net);
    drones.updateLabels();
    mePin.visible = !!view.me;
    if (view.me) mePin.position.set(view.me.x, groundU(view.me.x, view.me.z), view.me.z);
    flash = Math.max(0, flash - real);
    siteMat.emissiveIntensity = flash > 0 ? flash * 1.5 : 0;
    siteRing.mesh.material.opacity = flash > 0 ? 1 : 0.6; // a real site has no station to light up
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return {
    scene, camera, controls, labels, structures, update, refreshMap, viewFromAbove, centreOn,
    getWorldMesh: () => worldView && worldView.mesh,
    draw() { controls.update(); renderer.render(scene, camera); },
    start(frame) { renderer.setAnimationLoop(frame); },
    clear() { effects.clear(); beliefs.clear(); },
    // While rewinding, the live objects are hidden and the replay view is shown instead.
    hideLive() { drones.hide(); beliefs.hide(); effects.hide(); structures.hideBeams(); },
  };
}
