// 3D models for the systems and the drones.

import * as THREE from 'three';
import { STRUCTURES, DRONES } from '../sim/config/index.js';

export function buildModel(id) {
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

const rotorMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x333840, roughness: 0.7 });
const unseenMat = new THREE.MeshBasicMaterial({ color: 0x8a94a3, transparent: true, opacity: 0.4, depthWrite: false });

// One shared model per drone type, plus a grey copy for drones that no sensor has (shown when the truth overlay is on).
const droneTemplates = {};
export function droneTemplate(type, unseen) {
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
