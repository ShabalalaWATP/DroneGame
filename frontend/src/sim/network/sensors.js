// Probabilistic sensor models: what each sensor can detect, the reports it sends, and how cameras aim.

import * as S from '../sapient.js';
import { TERRAIN, SENSING } from '../config/index.js';
import { rand, gauss } from '../rng.js';
import { terrainState } from '../terrain.js';
import { RB_UNITS, RB_DATUM, round, clamp } from './core.js';

// How much ground clutter hides low flyers from radar, by ground cover (open, forest, built, power-line corridor):
// the radar's low-flyer range is multiplied by this.
const COVER_CLUTTER = [1.5, 0.7, 0.5, 0.5, 1.5]; // the last is water: open, so low flyers over it are easy to see

export function createSensors(core, feed) {
  const { ctx, mpu, T, nodes, tracker, fusion, send, deliver, antennaM, rel, bearingOf } = core;

  // Is the target inside the camera's current field of view?
  function inView(s, r) {
    const b = bearingOf(r);
    const daz = Math.abs(((b.az - s.point.az + 540) % 360) - 180), del = Math.abs(b.el - s.point.el);
    return daz <= s.def.fov / 2 && del <= s.def.fov / 2;
  }

  // The chance that this sensor detects this drone on one scan. It depends on:
  //  - how far away it is compared with the sensor's range for a small reference drone, scaled by how big the target
  //    looks (radar cross-section for radar, physical size for the camera, link power for RF)
  //  - ground clutter hiding low flyers from radar, line of sight over the terrain, and trees
  //  - for a camera, whether it is pointing at the target (it has a narrow field of view and has to be cued)
  // `pointing: false` ignores the camera's aim, for coverage maps (assume it has been cued).
  function pd(s, d, { pointing = true } = {}) {
    const def = s.def, kind = def.kind || def.id;
    const r = rel(s, d);
    if (def.senses === 'perimeter') return r.hr < def.range ? 0.98 : 0;
    if (def.senses === 'rf' && !d.def.rfEmitter) return 0;
    let reach = def.range;
    if (kind === 'radar') reach *= Math.pow((d.def.rcs ?? SENSING.refRcs) / SENSING.refRcs, 0.25);
    else if (kind === 'camera') reach *= (d.def.size ?? SENSING.refSize) / SENSING.refSize;
    else if (kind === 'rf') reach *= Math.sqrt(d.def.rfPower ?? 1);
    if (r.rng > reach * SENSING.rangeCap) return 0;
    const T3 = terrainState.data, m = mpu();
    const dxm = d.pos.x * m, dzm = d.pos.z * m, dym = d.pos.y * m;
    let p = 1;
    if (def.lowAlt && dym - T3.groundAt(dxm, dzm) < def.lowAlt && r.hr > def.lowRange * COVER_CLUTTER[T3.coverAt(dxm, dzm)]) p *= SENSING.clutterPenalty; // lost in clutter
    const sight = T3.los(s.pos.x * m, antennaM(s), s.pos.z * m, dxm, dym, dzm);
    if (!sight.clear) return 0;
    if (kind === 'rf') reach *= Math.exp(-sight.canopy / TERRAIN.rfCanopyLength);
    else if (sight.canopy > TERRAIN.opticalCanopyTol) return 0;
    if (pointing && def.fov && !inView(s, r)) return 0;
    return p / (1 + Math.pow(r.rng / (reach * SENSING.pdEdge), SENSING.pdSlope));
  }

  // How many sensors would see a drone of this type at this spot (at least half the time)? Used for coverage maps.
  function coverageAt(xm, zm, aglM, droneDef) {
    const m = mpu(), T3 = terrainState.data;
    const probe = { pos: { x: xm / m, y: (T3.groundAt(xm, zm) + aglM) / m, z: zm / m }, def: droneDef };
    let n = 0;
    for (const s of nodes.values()) if (s.def.role === 'sensor' && s.def.id !== 'perimeter' && pd(s, probe, { pointing: false }) >= 0.5) n++;
    return n;
  }

  function classification(s, d) {
    const id = s.def.kind || s.def.id;
    const sub = (type, c, level, inner) => ({ type, confidence: round(c, 2), level, ...(inner ? { sub_class: [inner] } : {}) });
    if (!d) return [{ type: 'Unknown', confidence: 0.4 }]; // a false alarm doesn't look like anything in particular
    if (id === 'camera') {
      return [{ type: 'Air Vehicle', confidence: 0.95, sub_class: [sub('UAV', 0.9, 1, sub(d.def.airframe, 0.85, 2))] }];
    }
    if (id === 'rf') { // a radio emitter is recognised as a UAV link, but not as an airframe type
      return [{ type: 'Air Vehicle', confidence: 0.85, sub_class: [sub('UAV', 0.8, 1)] }];
    }
    return [{ type: 'Air Vehicle', confidence: 0.7, sub_class: [sub('UAV', 0.55, 1)] }];
  }

  // Where a false alarm appears: random direction and range inside what the sensor covers (a camera only inside its view).
  function falseGeometry(s) {
    const def = s.def;
    const azD = def.fov ? s.point.az + (rand() - 0.5) * def.fov : rand() * 360;
    const elD = def.fov ? s.point.el + (rand() - 0.5) * def.fov : rand() * 12 - 2;
    const rng = def.range * (0.15 + 0.85 * rand());
    const az = (azD * Math.PI) / 180, el = (elD * Math.PI) / 180;
    const hr = rng * Math.cos(el);
    return { east: hr * Math.sin(az), north: hr * Math.cos(az), up: rng * Math.sin(el), hr, rng };
  }

  // Build one detection (a real drone `d`, or a false alarm when d is null), send the SAPIENT DetectionReport, and return
  // what the fusion node's tracker needs.
  function measure(s, d) {
    const def = s.def, n = def.sapient.noise || {};
    const r = d ? rel(s, d) : falseGeometry(s);
    const b = bearingOf(r);
    const azM = (b.az + gauss() * (n.az || 0) + 360) % 360;
    const elM = b.el + gauss() * (n.el || 0);
    const rngM = r.rng + gauss() * (n.range || 0);

    const rb = {};
    if (n.el != null) rb.elevation = round(elM);
    rb.azimuth = round(azM);
    if (n.range != null) rb.range = round(rngM, 1);
    if (n.el != null) rb.elevation_error = n.el;
    rb.azimuth_error = n.az;
    if (n.range != null) rb.range_error = n.range;
    rb.coordinate_system = RB_UNITS;
    rb.datum = RB_DATUM;

    const kind = def.kind || def.id;
    const conf = !d ? 0.3 + rand() * 0.2
      : kind === 'radar' ? clamp(0.55 + 0.4 * (1 - r.rng / def.range), 0.3, 0.98)
      : kind === 'camera' ? 0.85 + rand() * 0.1
      : kind === 'rf' ? 0.75 + rand() * 0.15 : 0.9;

    let objectId;
    if (d) { if (!s.objIds.has(d)) s.objIds.set(d, S.ulid()); objectId = s.objIds.get(d); } else objectId = S.ulid();
    const report = {
      report_id: S.ulid(), object_id: objectId,
      range_bearing: rb, detection_confidence: round(conf, 2),
      classification: classification(s, d),
    };
    if (d && def.id !== 'rf') report.behaviour = [{ type: d.mode === 'orbit' ? 'Loitering' : 'Approaching', confidence: 0.7 }];
    if (def.sapient.signal) {
      report.signal = [{
        amplitude: round(-45 - 20 * Math.log10(Math.max(r.rng, 100) / 100) + gauss() * 2, 1),
        centre_frequency: d ? d.freq || 2.4e9 : rand() < 0.5 ? 2.4e9 : 5.8e9,
      }];
    }
    let vel = null;
    if (d && def.sapient.velocity && d.vel) {
      const m = mpu();
      vel = { east_rate: round(d.vel.x * m + gauss() * 0.3, 2), north_rate: round(-d.vel.z * m + gauss() * 0.3, 2), up_rate: round(d.vel.y * m + gauss() * 0.3, 2), east_rate_error: 0.5, north_rate_error: 0.5, up_rate_error: 0.5 };
      report.enu_velocity = vel;
    }
    const sent = send(S.envelope(s.nodeId, 'detection_report', report), s.nodeId, fusion.nodeId);

    const rad = (x) => (x * Math.PI) / 180;
    const from = [s.pos.x * mpu(), -s.pos.z * mpu(), antennaM(s)];
    return {
      sent,
      meas: {
        node: s.nodeId, color: def.color, from, az: rad(azM), el: n.el != null ? rad(elM) : null, range: n.range != null ? rngM : null,
        sigAz: rad(n.az), sigEl: n.el != null ? rad(n.el) : null, sigRange: n.range || 0, t: T(), scan: s.scanId, truth: d,
      },
      source: { name: s.name, objectId, ts: S.timestamp(), conf, rb, from: { east: from[0], north: from[1], up: from[2] }, color: def.color, vel, cls: report.classification, rangeErr: n.range, hasRange: n.range != null },
    };
  }

  // One scan of a sensor: each real drone is detected with probability pd, and false alarms appear at the sensor's own rate.
  function scan(s) {
    s.scanId = (s.scanId || 0) + 1;
    const found = [];
    for (const d of ctx.drones) {
      const p = pd(s, d);
      if (p > 0 && rand() < p) found.push(measure(s, d));
    }
    if (s.def.falseAlarm && rand() < s.def.falseAlarm) found.push(measure(s, null));
    for (const f of found) deliver(f.sent, () => feed(s, f)); // the tracker only hears it when it arrives
  }

  // Turn a camera towards its cued track (or sweep when idle), at its slew rate.
  function aimCamera(s, dt) {
    const def = s.def;
    let tgtAz = s.point.az, tgtEl = s.point.el, rate = def.searchRate;
    const tr = s.cue && tracker.tracks.get(s.cue.trackId);
    if (tr && tr.est) {
      const m = mpu();
      const r = { east: tr.est.east - s.pos.x * m, north: tr.est.north + s.pos.z * m, up: tr.est.up - antennaM(s) };
      r.hr = Math.hypot(r.east, r.north);
      const b = bearingOf(r);
      tgtAz = b.az; tgtEl = b.el; rate = def.slewRate;
    } else { tgtAz = s.point.az + 1; tgtEl = 3; } // sweep
    const dAz = ((tgtAz - s.point.az + 540) % 360) - 180;
    const step = rate * dt;
    s.point.az = (s.point.az + clamp(dAz, -step, step) + 360) % 360;
    s.point.el += clamp(tgtEl - s.point.el, -step, step);
  }

  return { pd, coverageAt, scan, aimCamera };
}
