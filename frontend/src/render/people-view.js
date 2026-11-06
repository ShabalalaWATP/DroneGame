// Draws the simulated people at true scale. Instancing keeps large groups cheap, and the matrices are only rebuilt when somebody
// is placed, removed or hurt. People in a building or bunker are drawn too, and its walls hide them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PEOPLE, PEOPLE_LIMITS } from '../sim/config/index.js';
import { bunkerSide } from '../sim/people.js';
import { hashSeed, mulberry32 } from '../sim/rng.js';
import { u } from '../sim/units.js';
import { groundU } from './terrain-view.js';
import { hexCss } from './labels.js';
import { view } from './view.js';

const CAPACITY = PEOPLE_LIMITS.groups * PEOPLE_LIMITS.perGroup;
const CLOTHES = [0x3f5a78, 0x6b7f58, 0x8a8f96, 0x7a4a3a, 0xb8b2a4, 0x2f3b4a, 0xa8743c];
const SKIN = [0xf1c8a8, 0xd9a47e, 0xa9744f, 0x6f4a32];
const HURT = 0x8c2f2f;
const MODEL_HEIGHT = 1.75; // metres
const BUNKER_HEIGHT = 2.6; // metres, over the heads of those inside
const FOOTING = 3; // metres of block below the ground, so it does not float on a slope
const LABEL_LIFT = 6; // metres above the group

// A grey vertex colour, so the instance's colour shows through it.
function shaded(geo, shade) {
  const flat = geo.deleteAttribute('uv').toNonIndexed();
  flat.setAttribute('color', new THREE.BufferAttribute(new Float32Array(flat.attributes.position.count * 3).fill(shade), 3));
  return flat;
}
const limb = (top, bottom, length, x, y, shade) => shaded(new THREE.CylinderGeometry(top, bottom, length, 5, 1, true).translate(x, y, 0), shade);

// A figure in metres with its feet at the origin: legs darker than the clothes, then arms and a slightly flattened torso.
function bodyGeometry() {
  return mergeGeometries([
    limb(0.085, 0.06, 0.86, -0.09, 0.43, 0.3), limb(0.085, 0.06, 0.86, 0.09, 0.43, 0.3),
    limb(0.05, 0.04, 0.62, -0.235, 1.13, 0.9), limb(0.05, 0.04, 0.62, 0.235, 1.13, 0.9),
    shaded(new THREE.CylinderGeometry(0.19, 0.15, 0.62, 7).scale(1, 1, 0.65).translate(0, 1.14, 0), 1),
  ]);
}
// The head and neck in the skin colour, with dark hair on top.
function headGeometry() {
  const head = shaded(new THREE.SphereGeometry(0.11, 8, 6).translate(0, 1.62, 0), 1);
  const p = head.attributes.position, c = head.attributes.color;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.655) c.setXYZ(i, 0.25, 0.25, 0.25);
  return mergeGeometries([head, limb(0.05, 0.055, 0.1, 0, 1.49, 1)]);
}

export function createPeopleViews(scene, sim, labels) {
  const instanced = (geo, mat, n) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.count = 0; mesh.frustumCulled = false; // it spans the whole site
    scene.add(mesh);
    return mesh;
  };
  const clothed = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bodies = instanced(bodyGeometry(), clothed, CAPACITY), heads = instanced(headGeometry(), clothed, CAPACITY);
  const bunkers = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x8b8d86 }), PEOPLE_LIMITS.groups);
  const tags = new Map(); // group -> label

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0), FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  // counts: how many were down in each group at the moment being reviewed, or null for now.
  function rebuild(counts) {
    let n = 0, b = 0;
    sim.people.forEach((g, gi) => {
      const hurt = new Set(counts ? g.hits.slice(0, counts[gi]) : g.hits);
      const floor = groundU(g.x, g.z);
      const rng = mulberry32(hashSeed(g.look)); // the same look every time this group is drawn
      for (let i = 0; i < g.count; i++, n++) {
        const x = g.spots[i * 2], z = g.spots[i * 2 + 1], scale = u(1.62 + rng() * 0.3) / MODEL_HEIGHT, turn = rng() * Math.PI * 2;
        const clothes = CLOTHES[Math.floor(rng() * CLOTHES.length)], skin = SKIN[Math.floor(rng() * SKIN.length)];
        const down = hurt.has(i);
        q.setFromAxisAngle(UP, turn);
        if (down) q.multiply(FLAT);
        p.set(x, (g.protection === 'open' ? groundU(x, z) : floor) + (down ? u(0.15) : 0), z);
        m4.compose(p, q, sc.setScalar(scale));
        bodies.setMatrixAt(n, m4); heads.setMatrixAt(n, m4);
        bodies.setColorAt(n, col.setHex(down ? HURT : clothes));
        heads.setColorAt(n, col.setHex(down ? HURT : skin));
      }
      if (g.protection === 'bunker') {
        const side = u(bunkerSide(g.count));
        m4.compose(p.set(g.x, floor - u(FOOTING), g.z), q.identity(), sc.set(side, u(BUNKER_HEIGHT + FOOTING), side));
        bunkers.setMatrixAt(b++, m4);
      }
    });
    bodies.count = heads.count = n; bunkers.count = b;
    for (const mesh of [bodies, heads, bunkers]) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of [bodies, heads]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function label(g, down) {
    let tag = tags.get(g);
    if (!tag) { tag = labels.make('', hexCss(PEOPLE[g.protection].color), 'slabel'); tags.set(g, tag); }
    tag.textContent = `${g.count} ${PEOPLE[g.protection].short}${down ? ` · ${down} hurt` : ''}`;
    labels.place(tag, g.x, g.y + u(LABEL_LIFT), g.z, view.labels);
  }

  let shown = null;
  function sync() {
    const counts = view.replayCasualties;
    const key = `${sim.peopleRev()}|${counts}`;
    if (key !== shown) { shown = key; rebuild(counts); }
    const live = new Set(sim.people);
    for (const [g, tag] of tags) if (!live.has(g)) { tag.remove(); tags.delete(g); }
    sim.people.forEach((g, gi) => label(g, counts ? counts[gi] : g.hits.length));
  }

  return { sync };
}
