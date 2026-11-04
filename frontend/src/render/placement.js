// Turning the mouse into a point on the ground, and the green or red preview of the system being placed.

import * as THREE from 'three';
import { STRUCTURES, STRUCT_SCALE } from '../sim/config/index.js';
import { u, hereU } from '../sim/units.js';
import { drapedRing } from './terrain-view.js';
import { ringThickness } from './structure-view.js';

// getTool() is a structure id, 'sell' or null. onGroundClick(x, z) is called for a left click on the ground.
export function createPlacement({ scene, camera, canvas, getWorldMesh, sim, getTool, onGroundClick }) {
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
