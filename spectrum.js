// What an RF detector hears. Pure computation, no drawing (the Spectrum tab draws it).
//
// Every radio in the game is a source: the control and video links of enemy and friendly drones, your own jammers (when
// jamming), your cellular modems and the towers they talk to. Each one reaches the detector with a free-space path loss,
// extra loss if the terrain blocks the line of sight, and more if it passes through trees. The detector is calibrated so a
// small FPV's control link is only just heard at the detector's range, the same as the sensing model uses. The power levels
// are assumptions (SPECTRUM.power in config.js). Radars (X and K band) and Starlink (Ku) are outside what the detector
// covers, so it never sees them.

import { SPECTRUM, COMMS, TERRAIN, WORLD } from './config.js';
import { terrainState } from './terrain.js';

export const FMIN = SPECTRUM.detectorListens[0], FMAX = SPECTRUM.detectorListens[1]; // GHz
export const POINTS = 300;
export const freqAt = (i) => FMIN * Math.pow(FMAX / FMIN, i / (POINTS - 1));

const fspl = (dM, fMHz) => 20 * Math.log10(Math.max(dM, 1) / 1000) + 20 * Math.log10(fMHz) + 32.44; // free-space path loss, dB
const dbmSum = (list) => 10 * Math.log10(list.reduce((s, v) => s + Math.pow(10, v / 10), 0));
const CHANNEL = 0.02; // GHz, the width of a control or video channel

// Every transmitter in the world that a detector might hear, in scene metres.
function emitters({ drones, nodes, fusion }) {
  const m = WORLD.metresPerUnit, out = [];
  const T3 = terrainState.data;
  for (const d of drones) {
    const def = d.def;
    if (!def.rfEmitter || !def.links) continue;
    const pw = SPECTRUM.power[def.id] || SPECTRUM.power.default;
    for (const kind of ['control', 'video']) {
      const band = def.links[kind] && SPECTRUM.bands[def.links[kind]];
      if (!band) continue;
      const [lo, hi] = band.f[0];
      const f0 = lo + CHANNEL / 2 + ((d.uid * 0.381966) % 1) * (hi - lo - CHANNEL); // each drone sits on its own channel
      out.push({
        kind, f: [f0 - CHANNEL / 2, f0 + CHANNEL / 2], tx: pw[kind], x: d.pos.x * m, y: d.pos.y * m, z: d.pos.z * m,
        label: kind === 'control' ? 'Control link' : 'Video link', truth: def.name + (def.friendly ? ' (friendly)' : ''),
      });
    }
  }
  let k = 0;
  const cellBands = new Set();
  const modem = (n, node) => {
    const band = COMMS.cellular.bands[n.cellBand];
    if (!band) return;
    cellBands.add(n.cellBand);
    const [lo, hi] = band.f[0];
    const f0 = lo + CHANNEL / 2 + ((++k * 0.618034) % 1) * (hi - lo - CHANNEL);
    out.push({ kind: 'modem', f: [f0 - CHANNEL / 2, f0 + CHANNEL / 2], tx: SPECTRUM.modemDbm, x: node.pos.x * m, y: node.pos.y * m + (node.def.mount || 3), z: node.pos.z * m, label: 'Cellular modem', truth: `${n.short} (yours)` });
  };
  for (const n of nodes.values()) {
    if (n.def.id === 'jammer' && n.mode === 'Jam') {
      for (const id of n.jamBands) for (const f of SPECTRUM.bands[id].f) {
        out.push({ kind: 'jam', f, tx: SPECTRUM.jammerDbm, x: n.pos.x * m, y: n.pos.y * m + (n.def.mount || 3), z: n.pos.z * m, label: 'Jamming', truth: `${n.short} (yours): ${SPECTRUM.bands[id].label}` });
      }
    }
    if (n.uplink === 'cellular') modem(n, n);
  }
  if (fusion.uplinks.has('cellular')) modem({ cellBand: fusion.cellBand, short: 'FUSION' }, { pos: { x: 0, y: 0, z: 0 }, def: fusion.def });
  for (const t of (T3 && T3.towers) || []) { // a tower transmits on every band that is in use
    for (const id of cellBands) {
      const [lo, hi] = COMMS.cellular.bands[id].f[0];
      out.push({ kind: 'tower', f: [lo + (hi - lo) * 0.25, lo + (hi - lo) * 0.25 + CHANNEL], tx: SPECTRUM.towerDbm, x: t.x, y: t.ground + 30, z: t.z, label: 'Cell tower', truth: 'cell tower (yours to use)' });
    }
  }
  return out;
}

// What `det` (an RF detector structure) receives right now.
export function receive(det, world) {
  const T3 = terrainState.data, m = WORLD.metresPerUnit;
  const ax = det.pos.x * m, az = det.pos.z * m, ay = det.pos.y * m + (det.def.mount || 3);
  const base = SPECTRUM.noiseFloor, need = SPECTRUM.snr;
  // calibration: the detector's range is where a small FPV's control link sits exactly at the detection threshold
  const cal = SPECTRUM.power.default.control - fspl(det.def.range, 2440) - (base + need);
  const sigs = emitters(world).map((e) => {
    const d = Math.hypot(e.x - ax, e.y - ay, e.z - az), fMHz = ((e.f[0] + e.f[1]) / 2) * 1000;
    let rx = e.tx - fspl(d, fMHz) - cal;
    const sight = T3.los(ax, ay, az, e.x, e.y, e.z);
    rx -= sight.clear ? (8.69 * sight.canopy) / TERRAIN.rfCanopyLength : 25; // trees, or terrain in the way
    return { ...e, d, rx, centre: (e.f[0] + e.f[1]) / 2 };
  });
  const jams = sigs.filter((s) => s.kind === 'jam'), others = sigs.filter((s) => s.kind !== 'jam');
  const floorAt = (f) => dbmSum([base, ...jams.filter((j) => f >= j.f[0] && f <= j.f[1]).map((j) => j.rx)]); // jamming raises the noise floor
  for (const s of others) {
    s.heard = s.rx >= floorAt(s.centre) + need;
    s.masked = !s.heard && s.rx >= base + need; // loud enough on its own, but drowned by jamming
  }
  for (const j of jams) j.heard = j.rx >= base + need;
  const curve = new Float32Array(POINTS);
  for (let i = 0; i < POINTS; i++) {
    const f = freqAt(i), hw = f * 0.0075;
    curve[i] = dbmSum([floorAt(f), ...others.filter((s) => Math.abs(f - s.centre) <= Math.max((s.f[1] - s.f[0]) / 2, hw)).map((s) => s.rx)]);
  }
  return { curve, signals: sigs.sort((a, b) => b.rx - a.rx), base, thr: base + need, floorAt };
}
