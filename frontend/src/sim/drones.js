// The enemy: launching drones, how they fly and get jammed, and what happens when they are destroyed or get through.

import { Vector3 } from 'three';
import { WORLD, SITE, STRUCTURES, DRONES, ADAPT } from './config/index.js';
import { rand, gauss } from './rng.js';
import { u, hdist, clamp, groundM, hereU, SITE_POS } from './units.js';
import { tally } from './economy.js';
import { pickTarget, hitStructure } from './targeting.js';

const _v = new Vector3();
const SPOTTER_CLEARANCE = 30; // metres

// In the sandbox the enemy adapts to the level chosen there instead of to the wave number.
const effWave = ({ state }) => (state.sandbox ? state.sbLevel : state.wave);

export function spawnDrone(w, type, bearing, rolls = {}) {
  const def = DRONES[type];
  tally(w.ledger.launched, type); // the attacker pays for every drone it launches
  // the enemy adapts: later waves spawn harder to hit and harder to jam
  const k = Math.max(effWave(w) - 1, 0) * (def.adapt ?? 1);
  const evade = Math.max(Math.min(ADAPT.evadeFloor, def.evade), def.evade * (1 - ADAPT.evadePerWave * k));
  const jamResist = Math.max(def.jamResist, Math.min(ADAPT.jamResistCap, def.jamResist + ADAPT.jamResistPerWave * k));

  // chance is pre-rolled by the wave's seeded stream; ad-hoc spawns (console, tests) draw from the sim stream
  const jitter = rolls.jitter ?? (rand() - 0.5) * 0.3;
  const altFrac = rolls.altFrac ?? rand();
  const freq = rolls.freq ?? (rand() < 0.5 ? 2.4e9 : 5.8e9);
  const a = bearing + jitter;
  const sx = Math.cos(a) * u(WORLD.spawnDist), sz = Math.sin(a) * u(WORLD.spawnDist);
  const agl = def.alt[0] + altFrac * (def.alt[1] - def.alt[0]); // metres above the ground at the spawn point
  const y = hereU(sx, sz) + u(agl);
  const pos = new Vector3(sx, y, sz);
  const uid = ++w.droneUid;
  const d = {
    uid, def, type, pos, launch: pos.clone(),
    hp: def.hp, evade, jamResist, jamT: 0, detected: false, dead: false,
    agl0: agl, h0: Math.hypot(sx, sz),                       // launch height above ground and distance, for the descent profile
    mode: 'approach', angle: 0, orbitT: 0, bank: 0, heading: 0, // spotter state
    vel: new Vector3(), freq, track: null, nav: 0, videoJammed: false, targetStructure: null,
  };
  w.drones.push(d);
  w.rec.event('launch', `${def.name} launched`, d.uid);
  return d;
}

export function removeDrone(w, d) {
  d.dead = true;
  w.net.onDroneRemoved(d);
  const i = w.drones.indexOf(d);
  if (i >= 0) w.drones.splice(i, 1);
}

// `by` is the id of whatever did the damage ('laser', 'interceptor', 'missile', ...), for the cost ledger.
function recordKill(w, d, by) {
  w.rec.event('kill', `${d.def.name} destroyed by ${by}`, d.uid);
  w.state.kills++;
  tally(w.ledger.killed, d.type);
  w.ledger.killedBy[by] = w.ledger.killedBy[by] || {};
  tally(w.ledger.killedBy[by], d.type);
}
export function damageDrone(w, d, amount, by) {
  if (d.dead) return;
  d.hp -= amount;
  if (d.hp <= 0) {
    recordKill(w, d, by);
    w.emit('explosion', { pos: d.pos, r: u(80), color: 0xffcc66 });
    removeDrone(w, d);
  }
}

// each spotter on station makes every strike hit harder
export const spotterBonus = (w) => w.drones.reduce((sum, d) => sum + (d.mode === 'orbit' && !d.videoJammed ? d.def.spotBonus || 0 : 0), 0); // a spotter with jammed video can't help

function impact(w, d) {
  const { state, ledger, net } = w;
  w.rec.event('leak', `${d.def.name} hit the site`, d.uid);
  state.leaks++; tally(ledger.leaked, d.type);
  if (!state.sandbox) state.health = Math.max(state.health - d.def.damage * (1 + spotterBonus(w)), 0);
  w.emit('siteHit');
  net.raiseAlert('critical', `Site impact by ${d.def.name}: integrity ${Math.round(state.health)}%`, d.pos, 'DISCRETE_PRIORITY_HIGH');
  w.emit('explosion', { pos: d.pos, r: u(150), color: 0xff5252 });
  removeDrone(w, d);
  if (state.health <= 0 && !state.sandbox) { state.over = true; w.emit('gameOver'); }
}

// Spotter: flies out to its standoff radius, orbits for loiterTime, then leaves. Returns false if it was removed.
function moveSpotter(w, d, spd, dt) {
  const r = u(d.def.loiterDist);
  d.pos.y = Math.max(d.pos.y, hereU(d.pos.x, d.pos.z) + u(SPOTTER_CLEARANCE)); // it holds one height, which real mountains can reach
  if (d.mode === 'approach') {
    if (hdist(d.pos, SITE_POS) <= r) {
      d.mode = 'orbit'; d.angle = Math.atan2(d.pos.z, d.pos.x); d.orbitT = 0;
      w.rec.event('spotter', `${d.def.name} on station`, d.uid);
      w.emit('toast', `${d.def.name} on station: strikes +${Math.round(d.def.spotBonus * 100)}% damage`);
    } else {
      _v.set(-d.pos.x, 0, -d.pos.z).normalize().multiplyScalar(spd);
      d.pos.add(_v);
    }
  } else if (d.mode === 'orbit') {
    d.angle += spd / r;
    d.pos.set(Math.cos(d.angle) * r, d.pos.y, Math.sin(d.angle) * r);
    d.orbitT += dt;
    if (d.orbitT >= d.def.loiterTime) d.mode = 'egress';
  } else {
    _v.set(d.pos.x, 0, d.pos.z).normalize().multiplyScalar(spd);
    d.pos.add(_v);
    if (hdist(d.pos, SITE_POS) > u(WORLD.spawnDist)) { tally(w.ledger.escaped, d.type); removeDrone(w, d); return false; }
  }
  return true;
}

// Strike: fly at the target, hugging the terrain. Returns false if it was removed.
function moveStrike(w, d, spd) {
  if (hdist(d.pos, SITE_POS) > u(WORLD.radius)) { tally(w.ledger.escaped, d.type); w.rec.event('escaped', `${d.def.name} left the area`, d.uid); removeDrone(w, d); return false; } // GNSS drift can turn it away for good
  const tgt = pickTarget(w, d);
  const hrem = Math.hypot(tgt.x - d.pos.x, tgt.z - d.pos.z);
  if (tgt.structure ? hrem < u(30) : hrem < u(SITE.radius)) { if (tgt.structure) hitStructure(w, d, tgt.structure); else impact(w, d); return false; }
  // height above ground eases from the launch height down to the target height, never below the type's minimum until it
  // is within 400 m, and climbing early over rising ground
  let dirx = (tgt.x - d.pos.x) / hrem, dirz = (tgt.z - d.pos.z) / hrem;
  if (d.nav) { const c = Math.cos(d.nav), sn = Math.sin(d.nav); [dirx, dirz] = [dirx * c - dirz * sn, dirx * sn + dirz * c]; } // GNSS drift
  d.pos.x += dirx * spd; d.pos.z += dirz * spd;
  const f = 1 - clamp(hrem / d.h0, 0, 1);
  const want = Math.max(d.agl0 + (SITE.targetAlt - d.agl0) * f, (d.def.minAgl || 0) * Math.min(1, hrem / u(400)));
  const ahead = Math.max(groundM(d.pos.x, d.pos.z), groundM(d.pos.x + dirx * u(150), d.pos.z + dirz * u(150)));
  d.pos.y += clamp(u(ahead + want) - d.pos.y, -spd * 1.2, spd * 0.8);
  d.pos.y = Math.max(d.pos.y, hereU(d.pos.x, d.pos.z) + u(3));
  return true;
}

// Jamming. Each jammer that is on and in range jams the bands it is set to, and what that does depends on what the
// drone relies on: a jammed control link slows it and eventually crashes it, a jammed video link does the same more
// slowly (it is flying blind), and jammed GNSS makes a navigating drone drift off course (and the drift stays).
// Returns the speed multiplier, or null if the drone crashed.
function applyJamming(w, d, dt) {
  const links = d.def.links || {};
  let ctrl = false, vid = false, gnss = false, killTime = Infinity;
  for (const s of w.structures) {
    if (s.def.id !== 'jammer' || s.mode !== 'Jam' || s.pos.distanceTo(d.pos) > u(s.def.range)) continue;
    if (links.control && s.jamBands.has(links.control)) ctrl = true;
    if (links.video && s.jamBands.has(links.video)) vid = true;
    if (links.gnss && s.jamBands.has('gnss')) gnss = true;
    killTime = Math.min(killTime, s.def.killTime);
  }
  const eff = 1 - d.jamResist;
  let slow = 1;
  const jamRate = ctrl ? 1 : vid ? 0.5 : 0;
  if (jamRate && eff > 0) {
    slow = 1 - (1 - (ctrl ? STRUCTURES.jammer.slow : 0.7)) * eff;
    d.jamT += dt * eff * jamRate;
    if (d.jamT >= killTime) {
      recordKill(w, d, 'jammer');
      w.emit('explosion', { pos: d.pos, r: u(80), color: 0xba68c8 });
      removeDrone(w, d);
      return null;
    }
  } else d.jamT = Math.max(0, d.jamT - dt * 0.5);
  d.videoJammed = vid;
  if (gnss) d.nav += gauss() * 0.08 * Math.sqrt(dt);
  return slow;
}

export function updateDrones(w, dt) {
  for (let i = w.drones.length - 1; i >= 0; i--) {
    const d = w.drones[i];
    d.detected = w.net.isTracked(d);
    const slow = applyJamming(w, d, dt);
    if (slow === null) continue;

    const px = d.pos.x, py = d.pos.y, pz = d.pos.z;
    const spd = u(d.def.speed) * slow * dt;
    if (!(d.def.role === 'spotter' ? moveSpotter(w, d, spd, dt) : moveStrike(w, d, spd))) continue;
    const dx = d.pos.x - px, dz = d.pos.z - pz;
    if (dt > 0) d.vel.set(dx, d.pos.y - py, dz).divideScalar(dt);
    if (dx || dz) d.heading = Math.atan2(dx, dz);
    if (d.def.bank) d.bank += ((d.mode === 'orbit' ? d.def.bank : 0) - d.bank) * Math.min(1, dt * 2); // fixed-wing banks into its orbit
  }
}
