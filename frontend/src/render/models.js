// 3D models for the systems and the drones: the shapes are in system-parts.js, sensor-models.js, effector-models.js and drone-models.js.

import * as THREE from 'three';
import { DRONES } from '../sim/config/index.js';
import { buildDrone, kit } from './drone-models.js';
import { MAX_K, systemMats } from './system-parts.js';
import { radar, rf, camera, acoustic, jammer } from './sensor-models.js';
import { interceptor, missile, laser } from './effector-models.js';
import { gun } from './gun-models.js';
import { VEHICLES } from './vehicle-models.js';
import { SYSTEM_UNIT_M } from '../sim/config/index.js';

// A system's model: what it stands on, a head that the view turns to aim (or spins, for a rotating radar), and for a sensor
// or jammer the mast or legs it is raised on. parts.raise(k) sets those for a system drawn k times larger than life. One riding
// in a patrol (def.vehicle) sits on its vehicle instead, a sensor on a pole to its mast height.
const SYSTEM_SHAPES = { radar, rf, camera, acoustic, jammer, interceptor, missile, gun, laser };
export function buildModel(def) {
  const base = kit(), head = kit(), riser = kit(), mats = systemMats(def), carrier = VEHICLES[def.vehicle];
  const own = carrier ? [kit(), kit()] : [base, riser]; // a mounted system's own stand is not drawn
  let { headY = 0, headZ = 0, spin = false, rise } = SYSTEM_SHAPES[def.kind](own[0], head, def, own[1]);
  if (carrier) {
    ({ roof: headY, z: headZ } = carrier(base));
    if (rise) { riser.cyl('metal', 0.08, 1, 0, 0.5, 0, { r2: 0.06 }); rise = { y0: headY, height: def.mount / SYSTEM_UNIT_M - headY, min: 0.3 }; }
  }
  const g = base.finish(mats), h = head.finish(mats), r = riser.finish(mats);
  h.position.set(0, headY, headZ); r.position.set(0, rise?.y0 ?? 0, headZ);
  g.add(h, r);
  const raise = (k) => {
    if (!rise) return;
    const m = Math.max(rise.min, rise.height / Math.sqrt(k));
    r.scale.y = m; h.position.y = rise.y0 + m;
  };
  raise(MAX_K);
  return { group: g, parts: { head: h, spin: spin ? h : null, raise } };
}

const rotorMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.15, depthWrite: false, side: THREE.DoubleSide });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.7, flatShading: true, side: THREE.DoubleSide });
const unseenMat = new THREE.MeshBasicMaterial({ color: 0x8a94a3, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });

// One shared model per drone type, plus a grey copy for drones that no sensor has (shown when the truth overlay is on).
const droneTemplates = {};
export function droneTemplate(type, unseen) {
  const key = type + (unseen ? ':unseen' : '');
  if (droneTemplates[key]) return droneTemplates[key];
  const def = DRONES[type];
  const body = unseen ? unseenMat : new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.4, roughness: 0.5, flatShading: true, side: THREE.DoubleSide });
  const g = buildDrone(def, unseen ? { body, dark: body, spin: body } : { body, dark: darkMat, spin: rotorMat });
  droneTemplates[key] = g;
  return g;
}
