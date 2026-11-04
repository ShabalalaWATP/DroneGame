// Effectors act only on tasks from the fusion node. Each one is looked up by how it fires: act(w, system, target, dt).

import { Vector3 } from 'three';
import { WORLD, TERRAIN, STRUCT_SCALE } from './config/index.js';
import { terrainState } from './terrain.js';
import { u, hereU } from './units.js';
import { affordable, spend } from './economy.js';
import { damageDrone } from './drones.js';

const _v = new Vector3(), _m = new Vector3();

export const muzzle = (s, out = _m) => out.set(s.pos.x, s.pos.y + (s.def.muzzleY || 2) * STRUCT_SCALE, s.pos.z);

// The laser needs a clear optical path; guided weapons (interceptor drones, missiles) are cued over the terrain.
export function opticalLos(s, d) {
  if (s.def.fire === 'guided') return true;
  const m = WORLD.metresPerUnit;
  const r = terrainState.data.los(s.pos.x * m, s.pos.y * m + 4, s.pos.z * m, d.pos.x * m, d.pos.y * m, d.pos.z * m);
  return r.clear && r.canopy <= TERRAIN.opticalCanopyTol;
}

const aimAt = (s, t) => { s.aim = Math.atan2(t.pos.x - s.pos.x, t.pos.z - s.pos.z); };

function launchMissile(w, s, t) {
  const speed = u(s.def.missileSpeed);
  w.missiles.push({ def: s.def, pos: muzzle(s).clone(), vel: new Vector3(0, speed * 0.6, 0), target: t, life: (s.def.range / s.def.missileSpeed) * 1.5 });
}

const FIRE = {
  beam(w, s, t, dt) {
    if (t && !opticalLos(s, t)) t = null; // terrain or trees in the way
    const def = s.def;
    const firing = !!t && affordable(w, def);
    s.beamTarget = firing ? t : null;
    if (firing && !s.beamOn) { spend(w, def); s.beamT = 0; } // a shot is charged when the beam starts, then every second it stays on
    s.beamOn = firing;
    if (!firing) return;
    aimAt(s, t);
    s.beamT = (s.beamT || 0) + dt; // a "shot" is a second of beam time
    while (s.beamT >= 1) { s.beamT -= 1; spend(w, def); }
    damageDrone(w, t, def.dps * dt * (0.5 + 0.5 * t.evade), 'laser'); // evasion spoils beam dwell
  },
  guided(w, s, t) {
    if (t && s.cd <= 0 && !opticalLos(s, t)) t = null;
    if (!t) return;
    aimAt(s, t);
    const def = s.def;
    if (s.cd > 0 || !affordable(w, def)) return;
    s.cd = def.cooldown;
    const pending = w.missiles.filter((m) => m.target === t).length * def.damage;
    if (pending >= t.hp) { s.cd = 0.3; return; } // enough already in the air
    spend(w, def);
    launchMissile(w, s, t);
  },
  jam() {}, // a jammer's effect is applied to each drone it covers (see drones.js)
};

export function updateStructures(w, dt) {
  const { state } = w;
  for (const s of w.structures) {
    const def = s.def;
    s.cd = Math.max(0, s.cd - dt);
    if (def.role === 'sensor') continue;
    const t = s.task && state.time >= (s.task.activeAt || 0) && !s.task.drone.dead && s.pos.distanceTo(s.task.drone.pos) <= u(def.range) ? s.task.drone : null; // acts once its task has arrived
    FIRE[def.fire](w, s, t, dt);
  }
}

export function updateMissiles(w, dt) {
  const { missiles, drones } = w;
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    if (!m.target || m.target.dead) {
      m.target = null;
      let bd = u(1500);
      for (const d of drones) { if (!d.detected) continue; const dd = d.pos.distanceTo(m.pos); if (dd < bd) { bd = dd; m.target = d; } }
    }
    if (m.target) {
      _v.subVectors(m.target.pos, m.pos).normalize().multiplyScalar(u(m.def.missileSpeed));
      m.vel.lerp(_v, 1 - Math.exp(-4 * dt));
    }
    m.pos.addScaledVector(m.vel, dt);
    const fuzed = m.target && m.pos.distanceTo(m.target.pos) < u(m.def.fuze) * m.target.evade; // evasive targets are harder to catch
    if (fuzed || m.life <= 0 || m.pos.y < hereU(m.pos.x, m.pos.z) + 0.2) {
      if (fuzed) {
        const r = u(m.def.splash);
        for (const d of drones.slice()) if (d.pos.distanceTo(m.pos) < r) damageDrone(w, d, m.def.damage, m.def.id);
      }
      w.emit('explosion', { pos: m.pos, r: u(m.def.splash), color: 0xff8844 });
      missiles.splice(i, 1);
    }
  }
}
