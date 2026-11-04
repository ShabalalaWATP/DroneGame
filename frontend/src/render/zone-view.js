// The wizard's marks on the ground: the area to defend, and a suggested spot. Both come from the view settings, not the simulation.

import * as THREE from 'three';
import { u, hereU } from '../sim/units.js';
import { drapedRing } from './terrain-view.js';
import { view } from './view.js';

const COLOUR = 0xc6ff00, HALF_WIDTH = 1, LIFT = 1, SAMPLE = 4; // scene units: fine enough to follow the hills

function ribbon(points, closed) {
  const positions = [], index = [];
  const edges = closed ? points.length : points.length - 1;
  for (let e = 0; e < edges; e++) {
    const [ax, az] = points[e], [bx, bz] = points[(e + 1) % points.length];
    const len = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(len / SAMPLE));
    if (!len) continue; // a saved zone can repeat a point
    const nx = ((az - bz) / len) * HALF_WIDTH, nz = ((bx - ax) / len) * HALF_WIDTH;
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps, z = az + ((bz - az) * s) / steps;
      for (const side of [1, -1]) positions.push(x + nx * side, hereU(x + nx * side, z + nz * side) + LIFT, z + nz * side);
      if (s < steps) { const a = positions.length / 3 - 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  return geo;
}

export function createZoneView(scene) {
  const mat = new THREE.MeshBasicMaterial({ color: COLOUR, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const peg = new THREE.CylinderGeometry(3, 3, 1.5, 16);
  const marks = new THREE.Group();
  const spot = drapedRing(u(150), 1.5, COLOUR, 0.95);
  spot.mesh.visible = false;
  scene.add(marks, spot.mesh);
  let drawnZone = null, drawnSpot = null;

  function drawZone() {
    for (const m of marks.children) if (m.geometry !== peg) m.geometry.dispose();
    marks.clear();
    const zone = view.zone;
    if (!zone) return;
    if (zone.points.length > 1) { const line = new THREE.Mesh(ribbon(zone.points, zone.closed), mat); line.frustumCulled = false; marks.add(line); }
    if (!zone.closed) for (const [x, z] of zone.points) { const m = new THREE.Mesh(peg, mat); m.position.set(x, hereU(x, z) + LIFT, z); marks.add(m); }
  }

  function drawSpot() {
    spot.mesh.visible = !!view.spot;
    if (view.spot) { const { x, z } = view.spot; spot.update(x, z); spot.mesh.position.set(x, hereU(x, z), z); }
  }

  return {
    sync() {
      if (view.zone !== drawnZone) { drawnZone = view.zone; drawZone(); }
      if (view.spot !== drawnSpot) { drawnSpot = view.spot; drawSpot(); }
    },
    redraw() { drawZone(); drawSpot(); }, // the ground has changed
  };
}
