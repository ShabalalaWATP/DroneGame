// Placing, selling and restoring systems, and the network wiring between them. Like the laydown, the wiring is locked
// once the first wave starts, so runs are comparable.

import { Vector3 } from 'three';
import { WORLD, BUILD, COMMS, ECONOMY, STRUCTURES } from './config/index.js';
import { terrainState } from './terrain.js';
import { u, hdist, hereU } from './units.js';
import { buyTerminal, money } from './economy.js';
import { cleanCallsign, cleanName, cleanSettings, fieldsFor, setSetting, unitCost, unitDef } from './unit-config.js';

// saved holds a unit's settings and custom names, and reserved the callsigns other saved units will need.
export function addStructure(w, id, x, z, saved = {}, reserved) {
  const def = unitDef(id, cleanSettings(id, saved.settings));
  const y = hereU(x, z);
  const s = { def, health: def.health || 30, pos: new Vector3(x, y, z), cd: 0, aim: 0, beamTarget: null };
  const name = cleanName(saved.name), callsign = cleanCallsign(saved.callsign);
  if (name || callsign) s.custom = { name, callsign };
  w.structures.push(s);
  w.net.registerNode(s, reserved);
  return s;
}

export function removeStructure(w, s) {
  w.net.deregisterNode(s);
  w.structures.splice(w.structures.indexOf(s), 1);
}

// Why a structure can't go here, or null if it can.
export function placementProblem(w, x, z, def) {
  const r = Math.hypot(x, z);
  const xm = x * WORLD.metresPerUnit, zm = z * WORLD.metresPerUnit;
  if (BUILD.lockAfterStart && w.state.wave > 0) return 'The laydown is locked once the first wave starts';
  if (r < u(BUILD.minDist)) return `Too close to the station (minimum ${BUILD.minDist} m)`;
  if (r > u(BUILD.maxDist)) return `Outside the build zone (maximum ${BUILD.maxDist} m)`;
  if (terrainState.data.bldgAt(xm, zm)) return 'There is a building here';
  if (terrainState.data.coverAt(xm, zm) === 4) return 'You cannot build in water';
  if (terrainState.data.slope(xm, zm) > 0.4) return 'The ground is too steep';
  if (w.structures.some((s) => hdist(s.pos, { x, z }) < u(BUILD.spacing))) return 'Too close to another structure';
  if (w.state.budget < def.cost) return `Not enough budget (${money(def.cost)} needed, ${money(w.state.budget)} left)`;
  return null;
}

// Returns the reason it can't be placed, or null if it was.
export function place(w, id, x, z) {
  const def = STRUCTURES[id];
  const problem = placementProblem(w, x, z, def);
  if (problem) return problem;
  w.state.budget -= def.cost; w.ledger.capex += def.cost;
  addStructure(w, id, x, z);
  return null;
}

// Sell the nearest system to this point, if one is close enough.
export function sell(w, x, z) {
  if (BUILD.lockAfterStart && w.state.wave > 0) { w.emit('toast', 'The laydown is locked once the first wave starts'); return; }
  let best = null, bd = u(150);
  for (const s of w.structures) { const d = hdist(s.pos, { x, z }); if (d < bd) { bd = d; best = s; } }
  if (!best) return;
  const refund = Math.round(best.def.cost * BUILD.sellRefund);
  w.state.budget += refund; w.ledger.capex -= refund;
  if (best.uplink) buyTerminal(w, best.uplink, null); // its terminal is refunded too
  removeStructure(w, best);
}

export function captureLaydown(w) {
  return {
    // sorted, so the order systems were placed in cannot change the run
    structures: w.structures.map((s) => ({
      id: s.def.id, x: s.pos.x, z: s.pos.z, uplink: s.uplink || null, cellBand: s.cellBand, jam: s.jamBands ? [...s.jamBands] : null,
      ...(Object.keys(s.def.settings).length ? { settings: { ...s.def.settings } } : {}),
      ...(s.custom?.name ? { name: s.custom.name } : {}),
      ...(s.custom?.callsign ? { callsign: s.custom.callsign } : {}),
    }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.x - b.x || a.z - b.z),
    fusionUplinks: [...w.net.fusion.uplinks], fusionCell: w.net.fusion.cellBand,
  };
}

// Why a saved laydown can't be afforded at today's prices, or null if it can.
export function costProblem(spec) {
  const terminals = [...spec.structures.map((l) => l.uplink), ...spec.fusionUplinks].filter(Boolean);
  const total = spec.structures.reduce((sum, l) => sum + unitCost(l.id, cleanSettings(l.id, l.settings)), 0) + terminals.reduce((sum, k) => sum + COMMS[k].cost, 0);
  return total > ECONOMY.budget ? `That laydown costs ${money(total)}, more than the ${money(ECONOMY.budget)} budget at today's prices` : null;
}

// Rebuild the systems and their wiring, charging the budget as if they had just been bought.
export function restoreLaydown(w, spec) {
  const charge = (v) => { w.state.budget -= v; w.ledger.capex += v; };
  const reserved = new Set(spec.structures.map((l) => cleanCallsign(l.callsign)).filter(Boolean));
  for (const l of spec.structures) {
    const s = addStructure(w, l.id, l.x, l.z, l, reserved);
    charge(s.def.cost);
    if (l.uplink) { s.uplink = l.uplink; w.ledger.terminals[l.uplink]++; charge(COMMS[l.uplink].cost); }
    s.cellBand = l.cellBand;
    if (l.jam && s.jamBands) s.jamBands = new Set(l.jam);
  }
  for (const k of spec.fusionUplinks) { w.net.fusion.uplinks.add(k); w.ledger.terminals[k]++; charge(COMMS[k].cost); }
  w.net.fusion.cellBand = spec.fusionCell;
}

// Change one field on one unit, paying or being refunded the difference. A null value goes back to the standard one. Returns why not, or null.
export function configureUnit(w, s, key, value) {
  if (designLocked(w)) return 'The laydown is locked once the first wave starts';
  const field = fieldsFor(s.def.id).find((f) => f.key === key);
  if (!field) return 'That cannot be changed on this system';
  const before = s.def.cost, was = s.def.settings[key];
  if (!setSetting(s.def.settings, field, s.def.id, value)) return `Not a valid ${field.label.toLowerCase()}`;
  const delta = s.def.cost - before;
  if (delta > w.state.budget) {
    if (was == null) delete s.def.settings[key]; else s.def.settings[key] = was;
    return `Not enough budget (${money(delta)} more needed, ${money(w.state.budget)} left)`;
  }
  w.state.budget -= delta; w.ledger.capex += delta;
  return null;
}

// Give a unit its own name and callsign. An empty one goes back to the automatic one. Returns why not, or null.
export function renameUnit(w, s, name, callsign) {
  if (designLocked(w)) return 'The laydown is locked once the first wave starts';
  const cleanN = cleanName(name), cleanC = cleanCallsign(callsign);
  if (callsign && !cleanC) return 'A callsign is up to 12 letters, numbers, spaces or dashes';
  const short = cleanC || s.autoShort;
  const taken = [...w.net.nodes.values(), w.net.gui].some((o) => o !== s && o.short?.toLowerCase() === short.toLowerCase());
  if (taken) return `${short} is already in use`;
  s.custom = cleanN || cleanC ? { name: cleanN, callsign: cleanC } : undefined;
  w.net.renameNode(s);
  return null;
}

// ---------- the network design: terminals, wires and settings ----------
// Every sensor and effector reaches the fusion node through a terminal (Starlink or cellular) that costs money; the fusion
// node needs its own.
export const designLocked = (w) => BUILD.lockAfterStart && w.state.wave > 0;
const isNode = (s) => (s.def.role === 'sensor' || s.def.role === 'effector') && s.def.id !== 'perimeter';
const locked = (w) => { if (!designLocked(w)) return false; w.emit('toast', 'The network is locked once the first wave starts'); return true; };

export const unwired = (w) => [...w.net.nodes.values()].filter((s) => isNode(s) && !s.uplink);

// kind: 'starlink' | 'cellular' | null (unplug)
export function wireNode(w, s, kind) {
  if (locked(w)) return false;
  if ((s.uplink || null) === kind) return true;
  if (!buyTerminal(w, s.uplink, kind)) return false;
  s.uplink = kind;
  return true;
}
export function wireFusion(w, kind, on) {
  if (locked(w)) return false;
  const f = w.net.fusion.uplinks;
  if (on === f.has(kind)) return true;
  if (on ? !buyTerminal(w, null, kind) : !buyTerminal(w, kind, null)) return false;
  if (on) f.add(kind); else f.delete(kind);
  return true;
}
export function setCellBand(w, s, band) { if (!designLocked(w)) s.cellBand = band; }
export function setFusionCellBand(w, band) { if (!designLocked(w)) w.net.fusion.cellBand = band; }
export function toggleJamBand(w, s, band, on) { if (on) s.jamBands.add(band); else s.jamBands.delete(band); } // an operating setting: allowed any time

// Wire everything unwired: cellular where a tower reaches well, otherwise Starlink if it has sky, and give the fusion node both.
export function autoWire(w) {
  if (locked(w)) return;
  let cell = 0, sat = 0, none = 0;
  for (const s of w.net.nodes.values()) {
    if (!isNode(s) || s.uplink) continue;
    const c = w.net.comms.linkFor(s, 'cellular', s.cellBand), k = w.net.comms.linkFor(s, 'starlink');
    const pick = c.up && c.quality > 0.4 ? 'cellular' : k.up ? 'starlink' : c.up ? 'cellular' : null;
    if (pick && wireNode(w, s, pick)) pick === 'cellular' ? cell++ : sat++; else none++;
  }
  wireFusion(w, 'starlink', true); wireFusion(w, 'cellular', true);
  w.emit('toast', `Wired ${cell + sat} systems (${cell} cellular, ${sat} Starlink)${none ? `; ${none} could not be connected` : ''}; fusion node on both`);
}
export function clearWires(w) {
  if (locked(w)) return;
  for (const s of w.net.nodes.values()) if (isNode(s) && s.uplink) wireNode(w, s, null);
  wireFusion(w, 'starlink', false); wireFusion(w, 'cellular', false);
}
