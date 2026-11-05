// What the enemy goes for. FPV and FO strikes look for the loudest radio emitter near them and go for that instead of the
// site: a radar, a jammer that is switched on, a system with a Starlink or cellular terminal. Everything else heads for its spot
// in the area the player drew, or for the station if there is none.

import { WORLD, COMMS } from './config/index.js';
import { u, hdist, hereU } from './units.js';
import { tally } from './economy.js';
import { removeStructure } from './laydown.js';
import { removeDrone, spotterBonus } from './drones.js';
import { blastOnGround } from './people.js';

function emitterScore(s) {
  const def = s.def;
  let sig = def.signature || 0;
  if (def.kind === 'jammer' && s.mode !== 'Jam') sig *= 0.1; // a jammer is quiet until it is jamming
  if (s.uplink) sig += COMMS[s.uplink].signature;
  return sig;
}

const SITE_AIM = { x: 0, z: 0, structure: null };

export function pickTarget(w, d) {
  if (!d.def.seeksEmitters) return d.aim || SITE_AIM;
  if (d.targetStructure && w.structures.includes(d.targetStructure)) return { x: d.targetStructure.pos.x, z: d.targetStructure.pos.z, structure: d.targetStructure };
  d.targetStructure = null;
  let best = null, bs = 0.3;
  for (const s of w.structures) {
    const dist = hdist(s.pos, d.pos);
    if (dist > u(3000)) continue;
    const score = emitterScore(s) / (1 + dist / u(1500));
    if (score > bs) { bs = score; best = s; }
  }
  if (!best) return d.aim || SITE_AIM;
  d.targetStructure = best;
  d.h0 = hdist(d.pos, best.pos); d.agl0 = Math.max((d.pos.y - hereU(d.pos.x, d.pos.z)) * WORLD.metresPerUnit, 5); // restart the descent profile
  return { x: best.pos.x, z: best.pos.z, structure: best };
}

export function hitStructure(w, d, s) {
  const { state, ledger, net } = w;
  w.emit('explosion', { pos: d.pos, r: u(60), color: 0xff5252 });
  blastOnGround(w, d, s.pos.x, s.pos.z);
  if (!state.sandbox) s.health -= d.def.damage * (1 + spotterBonus(w)); // the sandbox protects the laydown too
  state.hits++;
  removeDrone(w, d);
  net.raiseAlert('critical', `${d.def.name} struck ${s.name}: ${Math.max(Math.round(s.health), 0)}% health left`, s.pos, 'DISCRETE_PRIORITY_HIGH');
  if (s.health <= 0) {
    tally(ledger.lost, s.def.id); ledger.lostValue += s.def.cost;
    w.rec.event('lost', `${s.name} destroyed`);
    net.raiseAlert('critical', `${s.name} destroyed`, s.pos, 'DISCRETE_PRIORITY_HIGH');
    w.emit('toast', `${s.name} destroyed`);
    removeStructure(w, s);
  }
}
