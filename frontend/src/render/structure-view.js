// Draws the systems: models, range rings that follow the ground, laser beams and jammer pulses. Views are created and
// removed to match the simulation's list each frame.

import * as THREE from 'three';
import { STRUCT_SCALE } from '../sim/config/index.js';
import { muzzle } from '../sim/effectors.js';
import { u } from '../sim/units.js';
import { buildModel } from './models.js';
import { drapedRing } from './terrain-view.js';
import { hexCss } from './labels.js';
import { view } from './view.js';

export const ringThickness = (r) => Math.max(0.4, r * 0.006);
export const LABEL_LIFT = 9; // a name tag sits this far above its system, in scene units
const RING_OPACITY = 0.35, SELECTED_RING_OPACITY = 0.95;
const _m = new THREE.Vector3();

export function createStructureViews(scene, sim, labels) {
  const views = new Map(); // structure -> view

  function makeRing(s, v) {
    if (v.ringObj) { v.holder.remove(v.ringObj.mesh); v.ringObj.dispose(); }
    const r = u(s.def.range);
    v.ringObj = drapedRing(r, ringThickness(r), s.def.color, RING_OPACITY);
    v.ringObj.update(s.pos.x, s.pos.z);
    v.ringObj.mesh.visible = view.rings;
    v.holder.add(v.ringObj.mesh);
  }

  function create(s) {
    const def = s.def;
    const holder = new THREE.Group();
    const { group: model, parts } = buildModel(def);
    model.scale.setScalar(STRUCT_SCALE * (def.modelScale || 1));
    holder.add(model);
    holder.position.copy(s.pos);
    scene.add(holder);
    const v = { holder, parts, ringObj: null, beam: null, pulse: null, pulseT: (views.size * 0.37) % 1, label: labels.make(s.short, hexCss(def.color), 'slabel') };
    makeRing(s, v);
    if (def.fire === 'beam') {
      v.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: def.color }));
      v.beam.frustumCulled = false; v.beam.visible = false; scene.add(v.beam);
    }
    if (def.fire === 'jam') {
      v.pulse = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      v.pulse.position.y = 0.5; holder.add(v.pulse);
    }
    views.set(s, v);
    return v;
  }

  function dispose(s, v) {
    v.label.remove();
    scene.remove(v.holder);
    // the model, ring and pulse all sit under the holder, and buildModel makes new geometry and materials for each system
    v.holder.traverse((o) => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } });
    if (v.beam) { scene.remove(v.beam); v.beam.geometry.dispose(); v.beam.material.dispose(); }
    views.delete(s);
  }

  function sync(real) {
    const live = new Set(sim.structures);
    for (const [s, v] of views) if (!live.has(s)) dispose(s, v);
    for (const s of sim.structures) {
      const v = views.get(s) || create(s);
      const selected = s === view.selected;
      v.ringObj.mesh.visible = view.rings || selected;
      v.ringObj.mesh.material.opacity = selected ? SELECTED_RING_OPACITY : RING_OPACITY;
      v.label.classList.toggle('selected', selected);
      if (v.parts.spin) v.parts.spin.rotation.y += real * (s.def.id === 'radar' ? 2.2 : 0.6);
      else v.parts.head.rotation.y = s.aim;
      if (v.pulse) {
        const active = s.mode === 'Jam';
        v.pulse.visible = active;
        if (active) {
          v.pulseT = (v.pulseT + real * 0.5) % 1;
          const r = u(s.def.range) * v.pulseT;
          v.pulse.scale.set(r, 1, r);
          v.pulse.material.opacity = 0.6 * (1 - v.pulseT);
        }
      }
      if (v.beam) {
        const t = s.beamTarget;
        v.beam.visible = !!t;
        if (t) {
          const p = v.beam.geometry.attributes.position, m = muzzle(s, _m);
          p.setXYZ(0, m.x, m.y, m.z); p.setXYZ(1, t.pos.x, t.pos.y, t.pos.z); p.needsUpdate = true;
        }
      }
    }
  }

  return {
    sync,
    labelOf: (s) => views.get(s)?.label,
    // The system whose name tag is under this point on the screen. The tags take no pointer events, so they are checked here.
    labelAt(x, y) {
      let hit = null; // the last one drawn is on top
      for (const [s, v] of views) {
        const r = v.label.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = s;
      }
      return hit;
    },
    setRingsVisible(on) { for (const v of views.values()) v.ringObj.mesh.visible = on; },
    remakeRings() { for (const [s, v] of views) makeRing(s, v); },
    updateLabels(net) {
      for (const [s, v] of views) {
        const target = s.task && net.tracks.get(s.task.trackId);
        v.label.textContent = `${s.short} · ${s.mode}${target ? ' ▸ ' + (target.short || '?') : ''}`;
        labels.place(v.label, s.pos.x, s.pos.y + LABEL_LIFT, s.pos.z, view.labels);
      }
    },
    hideBeams() { for (const v of views.values()) if (v.beam) v.beam.visible = false; },
  };
}
