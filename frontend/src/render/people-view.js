// Draws the simulated people at true scale, civilians in everyday clothes and soldiers in MultiCam (figures.js). Instancing keeps large groups cheap, and the matrices are only rebuilt when somebody
// is placed, removed or hurt. People in a building or bunker are drawn too, and its walls hide them.

import * as THREE from 'three';
import { PEOPLE, PEOPLE_LIMITS } from '../sim/config/index.js';
import { bunkerSide } from '../sim/people.js';
import { hashSeed, mulberry32 } from '../sim/rng.js';
import { u } from '../sim/units.js';
import { groundU } from './terrain-view.js';
import { hexCss } from './labels.js';
import { view } from './view.js';
import { civilianParts, soldierParts } from './figures.js';

const CAPACITY = PEOPLE_LIMITS.groups * PEOPLE_LIMITS.perGroup;
const CLOTHES = [0x3f5a78, 0x6b7f58, 0x8a8f96, 0x7a4a3a, 0xb8b2a4, 0x2f3b4a, 0xa8743c, 0x9b2d30, 0xd9d4c7];
const TROUSERS = [0x3b4f6b, 0x2b2b2e, 0x9c8d6b, 0x5f6368, 0x5a4636];
const SKIN = [0xf1c8a8, 0xd9a47e, 0xa9744f, 0x6f4a32];
const HURT = 0x8c2f2f, KILLED = 0x3a2424; // injured, and killed: darker, and both lying down
const MODEL_HEIGHT = 1.75; // metres
const BUNKER_HEIGHT = 2.6; // metres, over the heads of those inside
const FOOTING = 3; // metres of block below the ground, so it does not float on a slope
const LABEL_LIFT = 6; // metres above the group

export function createPeopleViews(scene, sim, labels) {
  const instanced = (geo, mat, n) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.count = 0; mesh.frustumCulled = false; // it spans the whole site
    scene.add(mesh);
    return mesh;
  };
  const clothed = new THREE.MeshLambertMaterial({ vertexColors: true });
  const civ = civilianParts(), sol = soldierParts();
  // each person's parts, by role, and what colours each part takes
  const meshes = {
    civilian: [instanced(civ.trousers, clothed, CAPACITY), instanced(civ.top, clothed, CAPACITY), instanced(civ.skin, clothed, CAPACITY)],
    military: [instanced(sol.body, clothed, CAPACITY), instanced(sol.skin, clothed, CAPACITY)],
  };
  const figures = [...meshes.civilian, ...meshes.military];
  const bunkers = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x8b8d86 }), PEOPLE_LIMITS.groups);
  const tags = new Map(); // group -> label

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0), FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

  // counts: how many were down in each group at the moment being reviewed, or null for now.
  function rebuild(counts) {
    const n = { civilian: 0, military: 0 };
    let b = 0;
    sim.people.forEach((g, gi) => {
      const hurt = new Set(counts ? g.hits.slice(0, counts[gi]) : g.hits);
      const floor = groundU(g.x, g.z);
      const rng = mulberry32(hashSeed(g.look)); // the same look every time this group is drawn
      const role = g.role === 'military' ? 'military' : 'civilian', parts = meshes[role];
      for (let i = 0; i < g.count; i++, n[role]++) {
        const x = g.spots[i * 2], z = g.spots[i * 2 + 1], scale = u(1.62 + rng() * 0.3) / MODEL_HEIGHT, turn = rng() * Math.PI * 2;
        const clothes = CLOTHES[Math.floor(rng() * CLOTHES.length)], skin = SKIN[Math.floor(rng() * SKIN.length)];
        const trousers = TROUSERS[Math.floor(rng() * TROUSERS.length)], kit = 0.88 + rng() * 0.12; // a soldier's kit is a little faded or new
        const down = hurt.has(i), dead = down && g.down[i] === 2;
        q.setFromAxisAngle(UP, turn);
        if (down) q.multiply(FLAT);
        p.set(x, (g.protection === 'open' ? groundU(x, z) : floor) + (down ? u(0.15) : 0), z);
        m4.compose(p, q, sc.setScalar(scale));
        const colours = role === 'military' ? [col.setScalar(kit).getHex(), skin] : [trousers, clothes, skin];
        parts.forEach((mesh, k) => { mesh.setMatrixAt(n[role], m4); mesh.setColorAt(n[role], col.setHex(dead ? KILLED : down ? HURT : colours[k])); });
      }
      if (g.protection === 'bunker') {
        const side = u(bunkerSide(g.count));
        m4.compose(p.set(g.x, floor - u(FOOTING), g.z), q.identity(), sc.set(side, u(BUNKER_HEIGHT + FOOTING), side));
        bunkers.setMatrixAt(b++, m4);
      }
    });
    for (const [role, parts] of Object.entries(meshes)) for (const mesh of parts) mesh.count = n[role];
    bunkers.count = b;
    for (const mesh of [...figures, bunkers]) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of figures) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
