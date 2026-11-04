// Turning the mouse into a point on the ground, and the green or red preview of the system being placed.

import * as THREE from 'three';
import { STRUCTURES, STRUCT_SCALE } from '../sim/config/index.js';
import { u, hereU } from '../sim/units.js';
import { drapedRing } from './terrain-view.js';
import { LABEL_LIFT, ringThickness } from './structure-view.js';

const PICK_PX = 16;
export const PLACING_PICK_PX = 8; // tighter while placing, so a click near a system can still place beside it
const _base = new THREE.Vector3(), _top = new THREE.Vector3();

// The system nearest a point on the screen, measured to the line from its base up to its name tag, or null if none is close.
// Measured on the screen, because at a low camera angle a ground point lands well behind a tall model.
export function pickStructure(structures, camera, px, py, width = innerWidth, height = innerHeight, tolerance = PICK_PX) {
  let best = null, bd = tolerance;
  for (const s of structures) {
    _base.copy(s.pos).project(camera);
    _top.copy(s.pos).setY(s.pos.y + LABEL_LIFT).project(camera);
    if (_base.z >= 1 || _top.z >= 1) continue; // behind the camera
    const ax = ((_base.x + 1) / 2) * width, ay = ((1 - _base.y) / 2) * height;
    const dx = ((_top.x + 1) / 2) * width - ax, dy = ((1 - _top.y) / 2) * height - ay;
    const along = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(px - (ax + along * dx), py - (ay + along * dy));
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

// What a left click selects, with null clearing the selection, or undefined if the click belongs to the tool. A system beats a
// placement tool: the ground behind a model can be far enough away to buy a second one. A click never selects with the Sell or zone tool.
export function selectionFrom(tool, tagged, pick) {
  if (!tool) return tagged || pick();
  return (STRUCTURES[tool] && (tagged || pick())) || undefined;
}

// getTool() is a structure id, 'sell', 'zone' or null. A left click first calls onSelect(screenX, screenY), which returns true if
// it dealt with the click. Otherwise it calls onGroundClick(x, z).
export function createPlacement({ scene, camera, canvas, getWorldMesh, sim, getTool, onGroundClick, onSelect }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mouseGround = new THREE.Vector3();
  let mouseOnGround = false, downPos = null;

  function updateMouse(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const mesh = getWorldMesh();
    const hit = mesh ? raycaster.intersectObject(mesh, false)[0] : null; // the terrain
    if (hit) { mouseGround.copy(hit.point); mouseOnGround = true; }
    else mouseOnGround = !!raycaster.ray.intersectPlane(groundPlane, mouseGround);
    if (mouseOnGround) mouseGround.y = hereU(mouseGround.x, mouseGround.z);
  }
  canvas.addEventListener('pointermove', updateMouse);
  canvas.addEventListener('pointerdown', (e) => { downPos = { x: e.clientX, y: e.clientY, b: e.button }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downPos || downPos.b !== 0) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 5) return;
    if (onSelect(e.clientX, e.clientY)) return;
    updateMouse(e);
    if (mouseOnGround) onGroundClick(mouseGround.x, mouseGround.z);
  });

  const ghost = new THREE.Group();
  ghost.visible = false;
  scene.add(ghost);
  let ghostRing = null;
  let ghostAt = { x: NaN, z: NaN };
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x66ff66, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const ghostMarker = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.5, 16), ghostMat);
  ghostMarker.scale.setScalar(STRUCT_SCALE);
  ghost.add(ghostMarker);

  function refresh() {
    if (ghostRing) { ghost.remove(ghostRing.mesh); ghostRing.mesh.geometry.dispose(); ghostRing = null; }
    const def = STRUCTURES[getTool()];
    if (def) {
      const r = u(def.range);
      ghostRing = drapedRing(r, ringThickness(r) * 1.5, 0xffffff, 0.5);
      ghostRing.mesh.material.dispose();
      ghostRing.mesh.material = ghostMat; // shares the green/red placement colour
      ghost.add(ghostRing.mesh);
      ghostAt = { x: NaN, z: NaN };
    }
  }

  function update() {
    const tool = getTool();
    if (ghostRing || tool === 'sell') {
      ghost.visible = mouseOnGround && !!tool && sim.state.started;
      ghost.position.set(mouseGround.x, mouseGround.y + 0.1, mouseGround.z);
      if (ghostRing && mouseOnGround && (ghostAt.x !== mouseGround.x || ghostAt.z !== mouseGround.z)) {
        ghostRing.update(mouseGround.x, mouseGround.z); // re-drape the ring over the ground under the cursor
        ghostAt = { x: mouseGround.x, z: mouseGround.z };
      }
      const ok = tool === 'sell' || sim.canPlace(mouseGround.x, mouseGround.z, STRUCTURES[tool]);
      ghostMat.color.set(tool === 'sell' ? 0xff9800 : ok ? 0x66ff66 : 0xff5252);
    } else ghost.visible = false;
  }

  return { refresh, update, cursor: () => (mouseOnGround ? { x: mouseGround.x, z: mouseGround.z } : null) };
}
