// The 3D scene: reads the simulation each frame and draws it. It never changes the simulation.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITE, BUILD } from '../sim/config/index.js';
import { terrainState } from '../sim/terrain.js';
import { u } from '../sim/units.js';
import { buildWorldView, drapedRing, makeHillshade } from './terrain-view.js';
import { createLabels } from './labels.js';
import { createStructureViews } from './structure-view.js';
import { createDroneViews } from './drone-view.js';
import { createBeliefViews } from './belief-view.js';
import { createEffects } from './effects.js';
import { createZoneView } from './zone-view.js';
import { createOsmMap } from './osm-map.js';
import { view } from './view.js';

export function createGameView(canvas, labelLayer, sim) {
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
  const osmMap = createOsmMap(renderer);
  function showOsm() { // the picture on the ground, and on the 2D maps
    worldView.mesh.material = view.osm ? osmMap.material : ownMaterial;
    terrainState.hillshade = view.osm ? osmMap.canvas : relief;
  }
  function loadWorld() {
    if (worldView) { worldView.mesh.material = ownMaterial; worldView.dispose(); }
    relief = makeHillshade(terrainState.data);
    worldView = buildWorldView(scene, terrainState.data, siteMat);
    ownMaterial = worldView.mesh.material;
    showOsm();
    siteRing.update(0, 0);
    buildRing.update(0, 0);
  }
  loadWorld();
  sim.on('terrain', loadWorld);
  sim.on('siteHit', () => { flash = 0.4; });

  const labels = createLabels(labelLayer, camera);
  const structures = createStructureViews(scene, sim, labels);
  const drones = createDroneViews(scene, sim, labels, camera);
  const beliefs = createBeliefViews(scene, sim.net, camera, labelLayer);
  const effects = createEffects(scene, sim);
  const zone = createZoneView(scene);
  sim.on('terrain', zone.redraw);

  // Show the live state of the simulation. Replay runs after this and hides what it replaces.
  function update(real) {
    effects.update(real);
    structures.sync(real);
    drones.sync(real);
    beliefs.update();
    structures.updateLabels(sim.net);
    drones.updateLabels();
    zone.sync();
    flash = Math.max(0, flash - real);
    siteMat.emissiveIntensity = flash > 0 ? flash * 1.5 : 0;
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  return {
    scene, camera, controls, labels, structures, update, showOsm, loadOsm: () => osmMap.load(),
    getWorldMesh: () => worldView && worldView.mesh,
    draw() { controls.update(); renderer.render(scene, camera); },
    start(frame) { renderer.setAnimationLoop(frame); },
    clear() { effects.clear(); beliefs.clear(); },
    // While rewinding, the live objects are hidden and the replay view is shown instead.
    hideLive() { drones.hide(); beliefs.hide(); effects.hide(); structures.hideBeams(); },
  };
}
