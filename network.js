// The SAPIENT network for the simulation: nodes (sensors, effectors, fusion, C2 GUI), sensor measurement
// models, track fusion, effector tasking and alerts. Everything the nodes say goes through sapient.js so it
// can be inspected in the dock.
//
// Simplifications (so the laydown, not the maths, is the point):
//  - The fusion node associates reports to tracks perfectly (the sim knows which drone each report came from;
//    that truth id is never put in a message).
//  - Messages are delivered instantly. There is no latency, loss or bandwidth model yet.
//  - Registration `task` definitions are minimal.

import * as S from './sapient.js';
import { WORLD, TERRAIN, FUSION, PERIMETER, FUSION_DEF } from './config.js';
import { rand, gauss, EPOCH_MS } from './rng.js';
import { terrainState } from './terrain.js';

// How much ground clutter hides low flyers from radar, by ground cover (open, forest, built, power-line corridor):
// the radar's low-flyer range is multiplied by this.
const COVER_CLUTTER = [1.5, 0.7, 0.5, 0.5];

const RB_UNITS = 'RANGE_BEARING_COORDINATE_SYSTEM_DEGREES_M';
const RB_DATUM = 'RANGE_BEARING_DATUM_TRUE';
const deg = (r) => (r * 180) / Math.PI;
const round = (x, n = 3) => Number(x.toFixed(n));
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const dur = (value) => ({ units: 'TIME_UNITS_SECONDS', value });

// ctx: { drones: Drone[], getTime(): sim seconds, acceptTask(structure, drone): {ok, reasons?} }
export function createNetwork(ctx) {
  const mpu = () => WORLD.metresPerUnit;
  const T = () => ctx.getTime();
  const nodes = new Map();   // node id -> node record (the structure object itself for placed systems)
  const tracks = new Map();  // track id -> fused track
  const names = new Map();   // id -> display name (kept after a node leaves, so the log stays readable)
  const counters = {};
  let trackSeq = 0;
  let fusionT = 0, fusedT = 0;

  // ids are assigned in init(), from the seeded id stream
  const fusion = { def: FUSION_DEF, nodeId: '', name: 'Site Fusion Node', short: 'FUSION', pos: { x: 0, y: 0, z: 0 }, mode: 'Fuse', statusT: 0 };
  const gui = { nodeId: '', name: 'C2 Operator GUI', short: 'C2-GUI' };
  const nameOf = (id) => names.get(id) || String(id).slice(0, 8);
  const routeTo = (s) => (s === fusion ? gui.nodeId : fusion.nodeId);
  const send = (msg, from, to) => S.send(msg, from, to, fusion.nodeId);

  // ---------- geometry ----------
  // Heights are metres above the station base. A node's antenna is its ground height plus its mast.
  const antennaM = (s) => (s.pos.y || 0) * mpu() + (s.def.mount || 0);
  function rel(s, d) {
    const m = mpu();
    const east = (d.pos.x - s.pos.x) * m;
    const north = -(d.pos.z - s.pos.z) * m;
    const up = d.pos.y * m - antennaM(s);
    const hr = Math.hypot(east, north);
    return { east, north, up, hr, rng: Math.hypot(hr, up) };
  }
  const nodeLoc = (s, errM) => S.location(s.pos.x * mpu(), -s.pos.z * mpu(), antennaM(s), errM);

  // Does this sensor detect this drone right now? (The physics; the report is built separately.)
  // Range, then low-flyer clutter, then line of sight over the terrain: hills and buildings block radar, camera and
  // RF alike; trees block radar and camera and thin out RF.
  function sees(s, d) {
    const def = s.def;
    const r = rel(s, d);
    if (def.senses === 'perimeter') return r.hr < def.range;
    if (def.senses === 'rf' && !d.def.rfEmitter) return false;
    if (r.rng > def.range) return false;
    const T3 = terrainState.data, m = mpu();
    const dxm = d.pos.x * m, dzm = d.pos.z * m, dym = d.pos.y * m;
    if (def.lowAlt && dym - T3.groundAt(dxm, dzm) < def.lowAlt && r.hr > def.lowRange * COVER_CLUTTER[T3.coverAt(dxm, dzm)]) return false; // lost in clutter
    const sight = T3.los(s.pos.x * m, antennaM(s), s.pos.z * m, dxm, dym, dzm);
    if (!sight.clear) return false;
    if (def.senses === 'rf') return r.rng <= def.range * Math.exp(-sight.canopy / TERRAIN.rfCanopyLength);
    return sight.canopy <= TERRAIN.opticalCanopyTol;
  }

  // How many sensors would see a drone at this spot? Used for coverage maps. `emitter` is whether it emits RF.
  function coverageAt(xm, zm, aglM, emitter) {
    const m = mpu(), T3 = terrainState.data;
    const probe = { pos: { x: xm / m, y: (T3.groundAt(xm, zm) + aglM) / m, z: zm / m }, def: { rfEmitter: emitter } };
    let n = 0;
    for (const s of nodes.values()) if (s.def.role === 'sensor' && s.def.id !== 'perimeter' && sees(s, probe)) n++;
    return n;
  }

  // ---------- registration ----------
  function capabilities(s) {
    const def = s.def;
    const caps = [];
    if (def.range) caps.push({ category: 'performance', type: 'maximum range', value: String(def.range), units: 'm' });
    if (def.sapient.interval) caps.push({ category: 'performance', type: 'report interval', value: String(def.sapient.interval), units: 's' });
    if (def.ref && def.ref.analogues) caps.push({ category: 'reference', type: 'real-world analogue', value: def.ref.analogues.join(' / ') });
    return caps;
  }

  function modeDefinitions(s) {
    const def = s.def, sp = def.sapient;
    if (def.role === 'sensor') {
      return [{
        mode_name: 'Detect', mode_type: 'MODE_TYPE_DEFAULT', mode_description: `${def.name} continuous detection`,
        settle_time: dur(0), maximum_latency: dur(sp.interval || 1),
        scan_type: sp.scan, tracking_type: 'TRACKING_TYPE_TRACK',
        detection_definition: [{
          location_type: { range_bearing_units: RB_UNITS, range_bearing_datum: RB_DATUM },
          detection_class_definition: [{ class_definition: [{ type: 'Air Vehicle', sub_class: [{ type: 'UAV' }] }] }],
        }],
      }];
    }
    if (def.role === 'fusion') {
      return [{ mode_name: 'Fuse', mode_type: 'MODE_TYPE_DEFAULT', mode_description: 'Track fusion and effector tasking', tracking_type: 'TRACKING_TYPE_TRACK_WITH_RE_ID' }];
    }
    const modes = sp.modes || ['Ready'];
    return modes.map((name, i) => ({
      mode_name: name, mode_type: i === 0 ? 'MODE_TYPE_DEFAULT' : 'MODE_TYPE_TEMPORARY',
      mode_description: `${def.name} ${name.toLowerCase()}`, scan_type: sp.scan,
      task: { concurrent_tasks: 1 },
    }));
  }

  function registrationBody(s) {
    const def = s.def;
    return {
      node_definition: [{ node_type: def.sapient.nodeType, node_sub_type: def.sapient.subType || [] }],
      icd_version: S.ICD_VERSION,
      name: s.name,
      short_name: s.short,
      capabilities: capabilities(s),
      status_definition: {
        status_interval: dur(FUSION.statusInterval),
        location_definition: { location_units: 'LOCATION_COORDINATE_SYSTEM_LAT_LNG_DEG_M', location_datum: 'LOCATION_DATUM_WGS84_E' },
      },
      mode_definition: modeDefinitions(s),
      config_data: [{ manufacturer: 'Site Guard simulation', model: `${def.name} (class model)`, software_version: 'sim-0.1' }],
    };
  }

  function register(s) {
    S.clock.t = T();
    const dest = routeTo(s);
    send(S.envelope(s.nodeId, 'registration', registrationBody(s)), s.nodeId, dest);
    send(S.envelope(dest, 'registration_ack', { acceptance: true }, s.nodeId), dest, s.nodeId);
    nodes.set(s.nodeId, s);
    s.statusT = 0; s.lastStatusKey = null;
    sendStatus(s, true);
  }

  // A newly built structure joins the network.
  function registerNode(s) {
    const def = s.def;
    counters[def.id] = (counters[def.id] || 0) + 1;
    s.nodeId = S.uuid();
    s.short = `${def.short}-${String(counters[def.id]).padStart(2, '0')}`;
    s.name = `${def.name} ${String(counters[def.id]).padStart(2, '0')}`;
    s.mode = def.role === 'sensor' ? 'Detect' : (def.sapient.modes ? def.sapient.modes[0] : 'Ready');
    s.reportT = rand() * (def.sapient.interval || 1);
    s.objIds = new Map();
    s.task = null; s.rejected = null;
    names.set(s.nodeId, s.name);
    register(s);
    return s;
  }

  function deregisterNode(s) {
    if (!nodes.has(s.nodeId)) return;
    sendStatus(s, true, 'SYSTEM_GOODBYE');
    nodes.delete(s.nodeId);
  }

  // ---------- status ----------
  function sendStatus(s, forceNew, system = 'SYSTEM_OK') {
    const key = `${s.mode}|${s.task ? s.task.id : ''}`;
    const info = forceNew || key !== s.lastStatusKey ? 'INFO_NEW' : 'INFO_UNCHANGED';
    s.lastStatusKey = key;
    s.lastStatusT = T();
    const body = {
      report_id: S.ulid(), system, info, mode: s.mode,
      power: { source: 'POWERSOURCE_MAINS', status: 'POWERSTATUS_OK' },
      node_location: S.location(s.pos.x * mpu(), -s.pos.z * mpu(), antennaM(s)),
    };
    if (s.task) body.active_task_id = s.task.id;
    const st = s.def.sapient.status;
    if (st) body.status = [{ status_level: 'STATUS_LEVEL_INFORMATION_STATUS', status_type: st.type, status_value: st.value }];
    send(S.envelope(s.nodeId, 'status_report', body), s.nodeId, routeTo(s));
  }

  // ---------- sensing ----------
  function classification(s, d) {
    const id = s.def.id;
    const sub = (type, c, level, inner) => ({ type, confidence: round(c, 2), level, ...(inner ? { sub_class: [inner] } : {}) });
    if (id === 'camera') {
      return [{ type: 'Air Vehicle', confidence: 0.95, sub_class: [sub('UAV', 0.9, 1, sub(d.def.airframe, 0.85, 2))] }];
    }
    if (id === 'rf') { // a radio emitter is recognised as a UAV link, but not as an airframe type
      return [{ type: 'Air Vehicle', confidence: 0.85, sub_class: [sub('UAV', 0.8, 1)] }];
    }
    return [{ type: 'Air Vehicle', confidence: 0.7, sub_class: [sub('UAV', 0.55, 1)] }];
  }

  const classDepth = (cls) => {
    let n = 0, c = cls && cls[0] && cls[0].sub_class;
    while (c && c[0]) { n++; c = c[0].sub_class; }
    return n;
  };

  function senseOne(s, d) {
    const def = s.def, n = def.sapient.noise || {};
    const r = rel(s, d);
    const az = (deg(Math.atan2(r.east, r.north)) + 360) % 360;
    const el = deg(Math.atan2(r.up, r.hr));
    const azM = (az + gauss() * (n.az || 0) + 360) % 360;
    const elM = el + gauss() * (n.el || 0);
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

    const conf = def.id === 'radar' ? clamp(0.55 + 0.4 * (1 - r.rng / def.range), 0.3, 0.98)
      : def.id === 'camera' ? 0.85 + rand() * 0.1
      : def.id === 'rf' ? 0.75 + rand() * 0.15 : 0.9;

    if (!s.objIds.has(d)) s.objIds.set(d, S.ulid());
    const report = {
      report_id: S.ulid(), object_id: s.objIds.get(d),
      range_bearing: rb, detection_confidence: round(conf, 2),
      classification: classification(s, d),
    };
    if (def.id !== 'rf') report.behaviour = [{ type: d.mode === 'orbit' ? 'Loitering' : 'Approaching', confidence: 0.7 }];
    if (def.sapient.signal) {
      report.signal = [{
        amplitude: round(-45 - 20 * Math.log10(Math.max(r.rng, 100) / 100) + gauss() * 2, 1),
        centre_frequency: d.freq || 2.4e9,
      }];
    }
    let vel = null;
    if (def.sapient.velocity && d.vel) {
      const m = mpu();
      vel = { east_rate: round(d.vel.x * m + gauss() * 0.3, 2), north_rate: round(-d.vel.z * m + gauss() * 0.3, 2), up_rate: round(d.vel.y * m + gauss() * 0.3, 2), east_rate_error: 0.5, north_rate_error: 0.5, up_rate_error: 0.5 };
      report.enu_velocity = vel;
    }
    send(S.envelope(s.nodeId, 'detection_report', report), s.nodeId, fusion.nodeId);

    // what the fusion node keeps from this report
    const sx = s.pos.x * mpu(), sy = -s.pos.z * mpu();
    let fix = null;
    if (n.range != null && n.el != null) {
      const e = rngM * Math.cos((elM * Math.PI) / 180);
      fix = {
        east: sx + e * Math.sin((azM * Math.PI) / 180),
        north: sy + e * Math.cos((azM * Math.PI) / 180),
        up: antennaM(s) + rngM * Math.sin((elM * Math.PI) / 180),
      };
    }
    const from = { east: sx, north: sy, up: antennaM(s) };
    return { s, d, report, rb, fix, from, vel, cls: report.classification, conf, rangeErr: n.range };
  }

  // ---------- fusion ----------
  const fresh = (tr) => T() - tr.lastT <= FUSION.trackTimeout;
  const freshSources = (tr) => [...tr.sources.entries()].filter(([, v]) => T() - v.lastT <= FUSION.trackTimeout);

  function updateTrack(m) {
    const d = m.d;
    let tr = d.track;
    if (!tr) {
      tr = { id: S.ulid(), short: `T${++trackSeq}`, drone: d, firstT: T(), lastT: T(), sources: new Map(), warned: false, crit: false, loiterAlert: false };
      d.track = tr;
      tracks.set(tr.id, tr);
      raiseAlert('information', `New track ${tr.short} first detected by ${m.s.name}`, null, 'DISCRETE_PRIORITY_LOW', tr);
    }
    tr.lastT = T();
    tr.sources.set(m.s.nodeId, { name: m.s.name, objectId: m.report.object_id, ts: S.timestamp(), lastT: T(), conf: m.conf, rb: m.rb, fix: m.fix, from: m.from, color: m.s.def.color, vel: m.vel, cls: m.cls, rangeErr: m.rangeErr });
    if (d.mode === 'orbit' && !tr.loiterAlert) {
      tr.loiterAlert = true;
      raiseAlert('warning', `Track ${tr.short} loitering at standoff range: probable spotter`, null, 'DISCRETE_PRIORITY_MEDIUM', tr);
    }
  }

  function estimate(tr, srcs) {
    const fixes = srcs.map(([, v]) => v).filter((v) => v.fix).sort((a, b) => b.lastT - a.lastT);
    if (fixes.length) {
      const f = fixes[0];
      const err = Math.max(f.rangeErr || 10, 10);
      return { location: S.location(f.fix.east, f.fix.north, f.fix.up, err), fix: f.fix, err };
    }
    if (srcs.length >= 2) { // two or more bearing-only sensors: triangulated, with a coarse error
      const d = tr.drone, m = mpu();
      const fix = { east: d.pos.x * m + gauss() * 60, north: -d.pos.z * m + gauss() * 60, up: d.pos.y * m + gauss() * 30 };
      return { location: S.location(fix.east, fix.north, fix.up, 60), fix, err: 60 };
    }
    return { range_bearing: srcs[0][1].rb, fix: null, err: null };
  }

  function fusedReport(tr) {
    const srcs = freshSources(tr);
    if (!srcs.length) return;
    const est = estimate(tr, srcs);
    tr.est = est.fix;
    tr.estErr = est.err;
    const conf = 1 - srcs.reduce((p, [, v]) => p * (1 - v.conf), 1);
    const best = srcs.map(([, v]) => v).sort((a, b) => classDepth(b.cls) - classDepth(a.cls) || b.conf - a.conf)[0];
    tr.airframe = classDepth(best.cls) >= 2 ? best.cls[0].sub_class[0].sub_class[0].type : 'Unknown';
    const body = { report_id: S.ulid(), object_id: tr.id };
    if (est.location) body.location = est.location; else body.range_bearing = est.range_bearing;
    body.detection_confidence = round(conf, 2);
    body.classification = best.cls;
    body.behaviour = [{ type: tr.drone.mode === 'orbit' ? 'Loitering' : 'Approaching', confidence: 0.7 }];
    body.derived_detection = srcs.map(([id, v]) => ({ timestamp: v.ts, node_id: id, object_id: v.objectId }));
    const withVel = srcs.map(([, v]) => v).find((v) => v.vel);
    if (withVel) body.enu_velocity = withVel.vel;
    send(S.envelope(fusion.nodeId, 'detection_report', body), fusion.nodeId, gui.nodeId);
  }

  // ---------- alerts ----------
  const ALERT = { information: 'ALERT_TYPE_INFORMATION', warning: 'ALERT_TYPE_WARNING', critical: 'ALERT_TYPE_CRITICAL' };
  function raiseAlert(kind, description, pos, priority = 'DISCRETE_PRIORITY_MEDIUM', tr = null) {
    const id = S.ulid();
    const body = { alert_id: id, alert_type: ALERT[kind], status: 'ALERT_STATUS_ACTIVE', description, priority, ranking: kind === 'critical' ? 0.9 : kind === 'warning' ? 0.6 : 0.3, confidence: 0.9 };
    const m = mpu();
    if (tr && tr.est) body.location = S.location(tr.est.east, tr.est.north, tr.est.up, 30);
    else if (tr) body.location = S.location(tr.drone.pos.x * m, -tr.drone.pos.z * m, tr.drone.pos.y * m, 30);
    else if (pos) body.location = S.location(pos.x * m, -pos.z * m, pos.y * m, 30);
    send(S.envelope(fusion.nodeId, 'alert', body, gui.nodeId), fusion.nodeId, gui.nodeId);
    send(S.envelope(gui.nodeId, 'alert_ack', { alert_id: id, alert_ack_status: 'ALERT_ACK_STATUS_ACCEPTED' }, fusion.nodeId), gui.nodeId, fusion.nodeId);
  }

  // ---------- tasking ----------
  const distM = (s, d) => {
    const m = mpu();
    return Math.hypot((d.pos.x - s.pos.x) * m, (d.pos.y - (s.pos.y || 0)) * m, (d.pos.z - s.pos.z) * m);
  };
  const siteDist = (d) => Math.hypot(d.pos.x, d.pos.z) * mpu();

  function sendTask(s, task, name, description) {
    const id = S.ulid();
    const body = { task_id: id, task_name: name, task_description: description, task_start_time: S.timestamp(), ...task };
    send(S.envelope(fusion.nodeId, 'task', body, s.nodeId), fusion.nodeId, s.nodeId);
    return id;
  }
  function sendTaskAck(s, taskId, status, reasons) {
    const body = { task_id: taskId, task_status: status };
    if (reasons && reasons.length) body.reason = reasons;
    send(S.envelope(s.nodeId, 'task_ack', body), s.nodeId, fusion.nodeId);
  }

  function completeTask(s, status, reasons) {
    if (!s.task) return;
    sendTaskAck(s, s.task.id, status, reasons);
    s.task = null;
    sendStatus(s);
  }

  function assign(s, tr) {
    const id = sendTask(s, {
      control: 'CONTROL_START',
      command: { request: 'Engage', command_parameter: tr.id },
    }, `Engage ${tr.short}`, `Engage track ${tr.short} (${tr.airframe || 'unclassified'})`);
    const res = ctx.acceptTask(s, tr.drone);
    if (res.ok) {
      s.task = { id, drone: tr.drone, trackId: tr.id };
      sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED');
      sendStatus(s);
    } else {
      sendTaskAck(s, id, 'TASK_STATUS_REJECTED', res.reasons);
      s.rejected = { id: tr.id, until: T() + FUSION.rejectBackoff }; // try a different target next time
    }
  }

  function tasking() {
    const live = [...tracks.values()].filter(fresh);
    for (const s of nodes.values()) {
      if (s.def.role !== 'effector') continue;
      if (s.def.id === 'jammer') {
        const want = live.some((tr) => distM(s, tr.drone) <= s.def.range) ? 'Jam' : 'Standby';
        if (s.mode !== want) {
          const id = sendTask(s, { control: 'CONTROL_START', command: { mode_change: want } }, `Mode ${want}`, `Switch ${s.name} to ${want}`);
          s.mode = want;
          sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED');
          sendStatus(s, true);
        }
        continue;
      }
      // finish a task that has run its course
      if (s.task) {
        const d = s.task.drone;
        if (d.dead) completeTask(s, 'TASK_STATUS_COMPLETED', ['target destroyed or removed']);
        else if (!d.track || !fresh(d.track)) completeTask(s, 'TASK_STATUS_FAILED', ['track lost']);
        else if (distM(s, d) > s.def.range) {
          sendTask(s, { control: 'CONTROL_STOP' }, `Stop ${d.track.short}`, 'Target left engagement envelope');
          completeTask(s, 'TASK_STATUS_COMPLETED', ['target left engagement envelope']);
        }
      }
      // best target: the track closest to the site that this effector can reach (skipping one it just rejected)
      let best = null, bd = Infinity;
      for (const tr of live) {
        if (distM(s, tr.drone) > s.def.range) continue;
        if (s.rejected && T() < s.rejected.until && tr.id === s.rejected.id) continue;
        const dd = siteDist(tr.drone);
        if (dd < bd) { bd = dd; best = tr; }
      }
      if (!best || (s.task && s.task.trackId === best.id)) continue;
      if (s.task) {
        if (siteDist(s.task.drone) - bd < FUSION.retaskAdvantage) continue;
        sendTask(s, { control: 'CONTROL_STOP' }, `Stop ${s.task.drone.track ? s.task.drone.track.short : 'task'}`, 'Re-tasked to a closer threat');
        completeTask(s, 'TASK_STATUS_COMPLETED', ['re-tasked']);
      }
      assign(s, best);
    }
  }

  // ---------- per-step update ----------
  function update(dt) {
    S.clock.t = T();
    for (const s of nodes.values()) {
      if (s.def.role === 'sensor') {
        s.reportT += dt;
        const iv = s.def.sapient.interval || 1;
        if (s.reportT >= iv) {
          s.reportT = Math.min(s.reportT - iv, iv);
          for (const d of ctx.drones) if (sees(s, d)) updateTrack(senseOne(s, d));
        }
      }
      s.statusT += dt;
      if (s.statusT >= FUSION.statusInterval) { s.statusT = 0; sendStatus(s); }
    }
    for (const tr of [...tracks.values()]) {
      if (!fresh(tr)) { tracks.delete(tr.id); if (tr.drone.track === tr) tr.drone.track = null; continue; }
      const dist = siteDist(tr.drone);
      if (!tr.warned && dist < FUSION.warnZone) { tr.warned = true; raiseAlert('warning', `Track ${tr.short} inside ${FUSION.warnZone} m of the site`, null, 'DISCRETE_PRIORITY_MEDIUM', tr); }
      if (!tr.crit && dist < FUSION.critZone) { tr.crit = true; raiseAlert('critical', `Track ${tr.short} inside ${FUSION.critZone} m of the site`, null, 'DISCRETE_PRIORITY_HIGH', tr); }
    }
    fusedT += dt;
    if (fusedT >= FUSION.fusedInterval) { fusedT = 0; for (const tr of tracks.values()) fusedReport(tr); }
    fusionT += dt;
    if (fusionT >= FUSION.taskInterval) { fusionT = 0; tasking(); }
  }

  // ---------- queries and hooks ----------
  const isTracked = (d) => !!d.track && fresh(d.track);
  function onDroneRemoved(d) {
    if (d.track) { tracks.delete(d.track.id); d.track = null; }
  }

  // Demo of the middleware error path: a detection report missing its mandatory report_id.
  function injectFault() {
    const sensors = [...nodes.values()].filter((s) => s.def.role === 'sensor');
    const s = sensors[Math.floor(Math.random() * sensors.length)];
    if (!s) return;
    const bad = { object_id: S.ulid(), range_bearing: { azimuth: 0, coordinate_system: RB_UNITS, datum: RB_DATUM } };
    send(S.envelope(s.nodeId, 'detection_report', bad), s.nodeId, fusion.nodeId);
  }

  function init() {
    S.clock.epochMs = EPOCH_MS;
    S.clock.t = 0;
    S.clearBus();
    nodes.clear(); tracks.clear(); names.clear();
    for (const k of Object.keys(counters)) delete counters[k];
    trackSeq = 0; fusionT = 0; fusedT = 0;
    fusion.nodeId = S.uuid(); gui.nodeId = S.uuid(); fusion.statusT = 0;
    names.set(fusion.nodeId, fusion.name);
    names.set(gui.nodeId, gui.name);
    register(fusion);
    const p = { def: PERIMETER, pos: { x: 0, y: 0, z: 0 } };
    p.nodeId = S.uuid(); p.short = PERIMETER.short + '-01'; p.name = PERIMETER.name;
    p.mode = 'Detect'; p.reportT = 0; p.objIds = new Map(); p.task = null;
    names.set(p.nodeId, p.name);
    register(p);
  }

  return {
    init, registerNode, deregisterNode, update, isTracked, onDroneRemoved, raiseAlert, injectFault,
    coverageAt, nameOf, nodes, tracks, fusion, gui,
  };
}
