// The SAPIENT network for the simulation: nodes (sensors, effectors, fusion, C2 GUI), probabilistic sensor
// models, track fusion (tracker.js), camera cueing, effector tasking and alerts. Everything the nodes say goes
// through sapient.js so it can be inspected in the dock.
//
// Simplifications:
//  - Messages are delivered instantly. There is no latency, loss or bandwidth model yet.
//  - Detections come with Gaussian noise and a detection probability; the fusion node associates them to tracks by
//    gating (it does not know which drone a detection came from, so it can make mistakes). The simulation does keep
//    the true drone alongside each track, only so the displays and the effectors can use it; it is never put in a message.
//  - Registration `task` definitions are minimal.

import * as S from './sapient.js';
import { WORLD, TERRAIN, FUSION, SENSING, PERIMETER, FUSION_DEF, DRONES } from './config.js';
import { rand, gauss, EPOCH_MS } from './rng.js';
import { terrainState } from './terrain.js';
import { createTracker } from './tracker.js';
import { createComms } from './comms.js';

// How much ground clutter hides low flyers from radar, by ground cover (open, forest, built, power-line corridor):
// the radar's low-flyer range is multiplied by this.
const COVER_CLUTTER = [1.5, 0.7, 0.5, 0.5, 1.5]; // the last is water: open, so low flyers over it are easy to see

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
  const tracker = createTracker(() => S.ulid()); // the fusion node's tracks live here
  const names = new Map();  // id -> display name (kept after a node leaves, so the log stays readable)
  const counters = {};
  let trackSeq = 0;
  let fusionT = 0, fusedT = 0;

  // ids are assigned in init(), from the seeded id stream
  const fusion = { def: FUSION_DEF, nodeId: '', name: 'Site Fusion Node', short: 'FUSION', pos: { x: 0, y: 0, z: 0 }, mode: 'Fuse', statusT: 0 };
  const gui = { nodeId: '', name: 'C2 Operator GUI', short: 'C2-GUI' };
  const nameOf = (id) => names.get(id) || String(id).slice(0, 8);
  const routeTo = (s) => (s === fusion ? gui.nodeId : fusion.nodeId);
  fusion.uplinks = new Set(); fusion.cellBand = 'B8'; // which networks the fusion node has terminals on
  const scheduled = [];       // things that happen when a message arrives: { at, fn }, sorted by time
  const comms = createComms({ getTime: T, nodes, fusion, gui, getJammers: () => [...nodes.values()].filter((n) => n.def.id === 'jammer') });

  // Send a message: it is recorded and validated, then the comms model decides how long it takes or whether it is lost.
  const send = (msg, from, to) => {
    const entry = S.send(msg, from, to, fusion.nodeId);
    const res = comms.transmit(msg, from, to, S.typeOf(msg));
    entry.net = { dropped: res.dropped, reason: res.reason, delay: res.delay, local: !!res.local };
    return res;
  };
  // Do `fn` when the message arrives (never, if it was lost)
  function deliver(res, fn) {
    if (res.dropped) return;
    if (res.delay <= 0.0005) { fn(); return; }
    const at = T() + res.delay;
    let i = scheduled.length;
    while (i > 0 && scheduled[i - 1].at > at) i--;
    scheduled.splice(i, 0, { at, fn });
  }

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
  const bearingOf = (r) => ({ az: (deg(Math.atan2(r.east, r.north)) + 360) % 360, el: deg(Math.atan2(r.up, r.hr)) });

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
      return (sp.modes || ['Detect']).map((name, i) => ({
        mode_name: name, mode_type: i === 0 ? 'MODE_TYPE_DEFAULT' : 'MODE_TYPE_TEMPORARY', mode_description: `${def.name} ${name.toLowerCase()}`,
        settle_time: dur(0), maximum_latency: dur(sp.interval || 1),
        scan_type: sp.scan, tracking_type: 'TRACKING_TYPE_TRACK',
        detection_definition: [{
          location_type: { range_bearing_units: RB_UNITS, range_bearing_datum: RB_DATUM },
          detection_class_definition: [{ class_definition: [{ type: 'Air Vehicle', sub_class: [{ type: 'UAV' }] }] }],
        }],
      }));
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
    s.mode = def.sapient.modes ? def.sapient.modes[0] : def.role === 'sensor' ? 'Detect' : 'Ready';
    s.reportT = rand() * (def.sapient.interval || 1);
    s.objIds = new Map();
    if (def.fov) { s.point = { az: rand() * 360, el: 3 }; s.cue = null; s.lookedAt = new Map(); } // a camera has an aim
    s.task = null; s.rejected = null; s.denied = new Set();
    s.uplink = null; s.cellBand = 'B8'; s.offline = false; s.lastHeard = T(); s.modePending = null; // no terminal wired yet
    if (def.bands) s.jamBands = new Set(def.bands);
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
    const res = send(S.envelope(s.nodeId, 'status_report', body), s.nodeId, routeTo(s));
    deliver(res, () => heard(s)); // the fusion node hears the node only if the report gets through
  }

  // The fusion node's view of whether a node is reachable. Three missed status reports in a row means contact is lost.
  function heard(s) {
    s.lastHeard = T();
    if (s.offline) {
      s.offline = false;
      raiseAlert('information', `Contact restored with ${s.name}`, null, 'DISCRETE_PRIORITY_LOW');
    }
  }
  function checkContact() {
    if (!ctx.monitoring || !ctx.monitoring()) return;
    for (const s of nodes.values()) {
      if ((s.def.role !== 'sensor' && s.def.role !== 'effector') || s.def.id === 'perimeter' || s.offline) continue;
      if (T() - s.lastHeard > FUSION.statusInterval * 3.2) { // three status reports in a row missed
        s.offline = true;
        const why = comms.pathFor(s);
        raiseAlert('warning', `Lost contact with ${s.name}: ${why.ok ? 'messages are being lost or delayed' : why.reason}`, null, 'DISCRETE_PRIORITY_MEDIUM');
      }
    }
  }

  // ---------- sensing ----------
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

  const classDepth = (cls) => {
    let n = 0, c = cls && cls[0] && cls[0].sub_class;
    while (c && c[0]) { n++; c = c[0].sub_class; }
    return n;
  };

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

  // ---------- fusion ----------
  function feed(s, f) {
    const tr = tracker.ingest(f.meas, T());
    if (!tr) return;
    tr.drone = tr.truth; // for the displays: the real drone this track last matched (null for a false alarm)
    tr.sources.set(s.nodeId, { ...f.source, lastT: T() });
    if (!tr.cls || classDepth(f.source.cls) >= classDepth(tr.cls)) tr.cls = f.source.cls; // classification is remembered
  }

  const trackAge = (tr) => T() - tr.lastT;
  const confirmedTracks = () => [...tracker.tracks.values()].filter((tr) => tr.status === 'confirmed' && !tr.killWatch);
  const siteDist = (tr) => Math.hypot(tr.est.east, tr.est.north);

  function refreshTracks() {
    for (const tr of tracker.tracks.values()) {
      const e = tracker.estimate(tr, T());
      tr.est = { east: e.east, north: e.north, up: e.up };
      tr.estErr = e.err;
      tr.speed = Math.hypot(e.vel[0], e.vel[1], e.vel[2]);
      if (tr.cls) tr.airframe = classDepth(tr.cls) >= 2 ? tr.cls[0].sub_class[0].sub_class[0].type : 'Unknown';
      else tr.airframe = 'Unknown';
    }
    for (const d of ctx.drones) d.track = null;
    for (const tr of tracker.tracks.values()) if (tr.status !== 'tentative' && tr.truth && !tr.truth.dead && !tr.truth.track) tr.truth.track = tr;
  }

  function fusedReport(tr) {
    const srcs = [...tr.sources.entries()].filter(([, v]) => T() - v.lastT <= 3);
    const body = { report_id: S.ulid(), object_id: tr.id, state: tr.status };
    body.location = S.location(tr.est.east, tr.est.north, tr.est.up, Math.max(tr.estErr, 5));
    body.detection_confidence = round(Math.min(0.99, 0.4 + 0.12 * tr.hits), 2);
    if (tr.cls) body.classification = tr.cls;
    body.behaviour = [{ type: tr.drone && tr.drone.mode === 'orbit' ? 'Loitering' : 'Approaching', confidence: 0.7 }];
    if (srcs.length) body.derived_detection = srcs.map(([id, v]) => ({ timestamp: v.ts, node_id: id, object_id: v.objectId }));
    const e = tracker.estimate(tr, T());
    body.enu_velocity = { east_rate: round(e.vel[0], 2), north_rate: round(e.vel[1], 2), up_rate: round(e.vel[2], 2) };
    send(S.envelope(fusion.nodeId, 'detection_report', body), fusion.nodeId, gui.nodeId);
  }

  // ---------- alerts ----------
  const ALERT = { information: 'ALERT_TYPE_INFORMATION', warning: 'ALERT_TYPE_WARNING', critical: 'ALERT_TYPE_CRITICAL' };
  // Returns the alert id. With autoAck false the C2 GUI does not answer it (a human has to, as for engagement requests).
  function raiseAlert(kind, description, pos, priority = 'DISCRETE_PRIORITY_MEDIUM', tr = null, autoAck = true) {
    const id = S.ulid();
    const body = { alert_id: id, alert_type: ALERT[kind], status: 'ALERT_STATUS_ACTIVE', description, priority, ranking: kind === 'critical' ? 0.9 : kind === 'warning' ? 0.6 : 0.3, confidence: 0.9 };
    const m = mpu();
    if (tr && tr.est) body.location = S.location(tr.est.east, tr.est.north, tr.est.up, 30);
    else if (pos) body.location = S.location(pos.x * m, -pos.z * m, pos.y * m, 30);
    send(S.envelope(fusion.nodeId, 'alert', body, gui.nodeId), fusion.nodeId, gui.nodeId);
    if (autoAck) ackAlert(id, 'ALERT_ACK_STATUS_ACCEPTED');
    return id;
  }
  const ackAlert = (alertId, status) => send(S.envelope(gui.nodeId, 'alert_ack', { alert_id: alertId, alert_ack_status: status }, fusion.nodeId), gui.nodeId, fusion.nodeId);

  // ---------- engagement authority ----------
  // SAPIENT has no message for "may I fire". The emulation uses an Alert from the fusion node to the C2 GUI asking for a
  // decision, and the operator's answer comes back as an AlertAck (ACCEPTED / REJECTED, or CANCELLED if it lapses).
  const pending = []; // { id, alertId, s, tr, t0, text }
  const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
  function needsApproval(s) {
    if (FUSION.authority === 'all') return true;
    return FUSION.authority === 'costly' && (s.def.shotCost || 0) >= FUSION.authorityThreshold;
  }
  const isPending = (s, tr) => pending.some((p) => p.s === s && p.tr.id === tr.id);
  function requestApproval(s, tr) {
    const cost = s.def.shotCost ? `, ${usd(s.def.shotCost)} per shot` : '';
    const text = `Authorise ${s.name} to engage ${tr.short} (${tr.airframe === 'Unknown' ? 'unclassified' : tr.airframe})${cost}?`;
    const alertId = raiseAlert('warning', `Engagement request: ${text}`, null, 'DISCRETE_PRIORITY_HIGH', tr, false);
    const req = { id: alertId, alertId, s, tr, t0: T(), text };
    pending.push(req);
    if (ctx.onApprovalRequest) ctx.onApprovalRequest(req);
  }
  function decide(id, approve) {
    const i = pending.findIndex((p) => p.id === id);
    if (i < 0) return;
    const req = pending.splice(i, 1)[0];
    ackAlert(req.alertId, approve ? 'ALERT_ACK_STATUS_ACCEPTED' : 'ALERT_ACK_STATUS_REJECTED');
    if (approve && tracker.tracks.has(req.tr.id) && req.s.def.role === 'effector' && nodes.has(req.s.nodeId)) assign(req.s, req.tr, true);
    else if (!approve) req.s.denied.add(req.tr.id);
    if (ctx.onApprovalDecided) ctx.onApprovalDecided(req, approve);
  }
  function expireRequests() {
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      const gone = !tracker.tracks.has(p.tr.id) || !nodes.has(p.s.nodeId);
      if (!gone && T() - p.t0 < FUSION.authorityTimeout) continue;
      pending.splice(i, 1);
      ackAlert(p.alertId, 'ALERT_ACK_STATUS_CANCELLED');
      p.s.rejected = { id: p.tr.id, until: T() + 10 }; // may ask again after a pause
      if (ctx.onApprovalDecided) ctx.onApprovalDecided(p, null);
    }
  }

  // ---------- tasking ----------
  // distance from a node to where a track is believed to be (the effector is cued to the estimate, not the truth)
  const distToTrack = (s, tr) => {
    const m = mpu();
    return Math.hypot(tr.est.east - s.pos.x * m, tr.est.north + s.pos.z * m, tr.est.up - (s.pos.y || 0) * m);
  };

  function sendTask(s, task, name, description) {
    const id = S.ulid();
    const body = { task_id: id, task_name: name, task_description: description, task_start_time: S.timestamp(), ...task };
    const res = send(S.envelope(fusion.nodeId, 'task', body, s.nodeId), fusion.nodeId, s.nodeId);
    return { id, res }; // res says how long the task takes to arrive, or that it was lost
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

  function assign(s, tr, approved = false) {
    if (!approved && needsApproval(s)) { if (!isPending(s, tr)) requestApproval(s, tr); return; }
    const { id, res: sent } = sendTask(s, {
      control: 'CONTROL_START',
      command: { request: 'Engage', command_parameter: tr.id },
    }, `Engage ${tr.short}`, `Engage track ${tr.short} (${tr.airframe || 'unclassified'})`);
    if (sent.dropped) { s.rejected = { id: tr.id, until: T() + FUSION.rejectBackoff }; return; } // the task never arrived
    // the effector acquires whatever real target is at the track; a false or mis-placed track has none
    const res = ctx.acceptTask(s, tr.truth);
    if (res.ok) {
      s.task = { id, drone: tr.truth, trackId: tr.id, activeAt: T() + sent.delay }; // it can act once the task has arrived
      sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED');
      sendStatus(s);
    } else {
      sendTaskAck(s, id, 'TASK_STATUS_REJECTED', res.reasons);
      if (res.permanent) s.denied.add(tr.id); // it can never take this track; don't ask again
      else s.rejected = { id: tr.id, until: T() + FUSION.rejectBackoff }; // try a different target next time
    }
  }

  // Should the fusion node offer this track to this effector? Keeps expensive rounds for the targets that need them.
  const takesAirframe = (def, airframe) => !def.engages || !airframe || airframe === 'Unknown' || def.engages.some((t) => DRONES[t].airframe === airframe);
  function eligible(s, tr) {
    const def = s.def;
    if (s.denied.has(tr.id) || isPending(s, tr)) return false;
    if (s.rejected && T() < s.rejected.until && tr.id === s.rejected.id) return false;
    if (!takesAirframe(def, tr.airframe)) return false; // already known to be beyond this effector
    if (def.engagePolicy === 'fixed-wing' && tr.airframe !== 'Fixed wing') {
      if (tr.airframe === 'Multirotor') return false; // a known quadcopter is never worth the round
      // last ditch only: something unidentified that has got close and that nothing else is on
      const taken = [...nodes.values()].some((o) => o !== s && o.task && o.task.trackId === tr.id);
      if (siteDist(tr) >= FUSION.critZone || taken) return false;
    }
    return true;
  }

  // Point each camera at the most useful track: radar finds things, the camera is then cued to classify them.
  // Uses the SAPIENT Task `look_at` command. With nothing to look at, a camera sweeps (and rarely catches anything).
  function cueCameras(live) {
    for (const s of nodes.values()) {
      if (!s.def.fov || s.offline) continue;
      if (s.cue && T() < s.cue.until && tracker.tracks.has(s.cue.trackId)) continue; // still dwelling on a live track
      let best = null, bs = Infinity;
      for (const tr of live) {
        if (distToTrack(s, tr) > s.def.range * 1.3) continue;
        const looked = s.lookedAt.get(tr.id);
        if (tr.airframe !== 'Unknown' && looked !== undefined) continue; // already classified
        if (looked !== undefined && T() - looked < 4) continue;
        const score = (tr.airframe === 'Unknown' ? 0 : 1e6) + siteDist(tr);
        if (score < bs) { bs = score; best = tr; }
      }
      if (best) {
        const loc = S.location(best.est.east, best.est.north, best.est.up, Math.max(best.estErr, 5));
        const { id, res } = sendTask(s, { control: 'CONTROL_START', command: { look_at: { location_list: { locations: [loc] } } } }, `Look at ${best.short}`, `Slew to track ${best.short} and dwell`);
        s.lookedAt.set(best.id, T());
        deliver(res, () => { // the camera turns once the task arrives
          s.cue = { trackId: best.id, until: T() + s.def.dwell };
          s.mode = 'Track';
          sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED');
          sendStatus(s, true);
        });
      } else if (s.mode !== 'Search' && s.modePending !== 'Search') {
        const { id, res } = sendTask(s, { control: 'CONTROL_START', command: { mode_change: 'Search' } }, 'Mode Search', `Return ${s.name} to its search sweep`);
        s.modePending = 'Search';
        deliver(res, () => { s.cue = null; s.mode = 'Search'; s.modePending = null; sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED'); sendStatus(s, true); });
        if (res.dropped) s.modePending = null;
      }
    }
  }

  function tasking() {
    const live = confirmedTracks();
    cueCameras(live);
    for (const s of nodes.values()) {
      if (s.def.role !== 'effector' || s.offline) continue; // an effector we have lost contact with can't be tasked
      if (s.def.id === 'jammer') {
        const want = live.some((tr) => distToTrack(s, tr) <= s.def.range) ? 'Jam' : 'Standby';
        if (s.mode !== want && s.modePending !== want) {
          const { id, res } = sendTask(s, { control: 'CONTROL_START', command: { mode_change: want } }, `Mode ${want}`, `Switch ${s.name} to ${want}`);
          if (!res.dropped) {
            s.modePending = want;
            deliver(res, () => { s.mode = want; s.modePending = null; sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED'); sendStatus(s, true); });
          }
        }
        continue;
      }
      // finish a task that has run its course
      if (s.task) {
        const d = s.task.drone, tr = tracker.tracks.get(s.task.trackId);
        if (d.dead) { // the effector reports the target gone; the fusion node then waits for the sensors to agree
          completeTask(s, 'TASK_STATUS_COMPLETED', ['target destroyed or removed']);
          if (tr && !tr.killWatch) {
            tr.killWatch = { t: T(), lastT: tr.lastT, by: s.name };
            raiseAlert('information', `Kill reported by ${s.name} on ${tr.short}: waiting for sensors to confirm`, null, 'DISCRETE_PRIORITY_LOW', tr);
          }
        }
        else if (!tr) completeTask(s, 'TASK_STATUS_FAILED', ['track lost']);
        else if (distToTrack(s, tr) > s.def.range) {
          sendTask(s, { control: 'CONTROL_STOP' }, `Stop ${tr.short}`, 'Target left engagement envelope');
          completeTask(s, 'TASK_STATUS_COMPLETED', ['target left engagement envelope']);
        }
      }
      // best target: the track closest to the site that this effector can reach (skipping one it just rejected)
      let best = null, bd = Infinity;
      for (const tr of live) {
        if (distToTrack(s, tr) > s.def.range) continue;
        if (!eligible(s, tr)) continue;
        const dd = siteDist(tr);
        if (dd < bd) { bd = dd; best = tr; }
      }
      if (!best || (s.task && s.task.trackId === best.id)) continue;
      if (s.task) {
        const cur = tracker.tracks.get(s.task.trackId);
        if (cur && siteDist(cur) - bd < FUSION.retaskAdvantage) continue;
        sendTask(s, { control: 'CONTROL_STOP' }, `Stop ${cur ? cur.short : 'task'}`, 'Re-tasked to a closer threat');
        completeTask(s, 'TASK_STATUS_COMPLETED', ['re-tasked']);
      }
      assign(s, best);
    }
  }

  // ---------- per-step update ----------
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

  function update(dt) {
    S.clock.t = T();
    while (scheduled.length && scheduled[0].at <= T()) scheduled.shift().fn(); // messages that have now arrived
    for (const s of nodes.values()) {
      if (s.def.role === 'sensor') {
        if (s.def.fov) aimCamera(s, dt);
        s.reportT += dt;
        const iv = s.def.sapient.interval || 1;
        if (s.reportT >= iv) {
          s.reportT = Math.min(s.reportT - iv, iv);
          scan(s);
        }
      }
      s.statusT += dt;
      if (s.statusT >= FUSION.statusInterval) { s.statusT = 0; sendStatus(s); }
    }
    tracker.prune(T());
    refreshTracks();
    expireRequests();
    for (const tr of [...tracker.tracks.values()]) { // kill confirmation: the sensors must have lost the track
      if (!tr.killWatch || T() - tr.killWatch.t < FUSION.killConfirmDelay) continue;
      if (tr.lastT <= tr.killWatch.lastT + 1e-6) {
        raiseAlert('information', `Kill confirmed: ${tr.short} (${tr.airframe === 'Unknown' ? 'unclassified' : tr.airframe}), reported by ${tr.killWatch.by}`, null, 'DISCRETE_PRIORITY_LOW', tr);
        if (ctx.onKillConfirmed) ctx.onKillConfirmed(tr);
        tracker.tracks.delete(tr.id);
      } else {
        raiseAlert('warning', `Kill NOT confirmed: ${tr.short} is still being detected`, null, 'DISCRETE_PRIORITY_MEDIUM', tr);
        tr.killWatch = null;
      }
    }
    for (const tr of tracker.tracks.values()) {
      if (tr.justConfirmed) {
        tr.justConfirmed = false;
        tr.short = `T${++trackSeq}`;
        const first = [...tr.sources.values()][0];
        raiseAlert('information', `New track ${tr.short} confirmed (first detected by ${first ? first.name : 'a sensor'})`, null, 'DISCRETE_PRIORITY_LOW', tr);
      }
      if (tr.status === 'tentative') continue;
      const dist = siteDist(tr);
      if (!tr.warned && dist < FUSION.warnZone) { tr.warned = true; raiseAlert('warning', `Track ${tr.short} inside ${FUSION.warnZone} m of the site`, null, 'DISCRETE_PRIORITY_MEDIUM', tr); }
      if (!tr.crit && dist < FUSION.critZone) { tr.crit = true; raiseAlert('critical', `Track ${tr.short} inside ${FUSION.critZone} m of the site`, null, 'DISCRETE_PRIORITY_HIGH', tr); }
      if (!tr.loiterAlert && tr.drone && tr.drone.mode === 'orbit') {
        tr.loiterAlert = true;
        raiseAlert('warning', `Track ${tr.short} loitering at standoff range: probable spotter`, null, 'DISCRETE_PRIORITY_MEDIUM', tr);
      }
    }
    fusedT += dt;
    if (fusedT >= FUSION.fusedInterval) { fusedT = 0; for (const tr of tracker.tracks.values()) if (tr.status !== 'tentative') fusedReport(tr); }
    fusionT += dt;
    if (fusionT >= FUSION.taskInterval) { fusionT = 0; checkContact(); tasking(); }
  }

  // ---------- queries and hooks ----------
  const isTracked = (d) => !!d.track;
  function onDroneRemoved(d) {
    d.track = null;
    for (const tr of tracker.tracks.values()) if (tr.truth === d) { tr.truth = null; tr.drone = null; } // the track outlives the drone briefly, then drops
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
    nodes.clear(); tracker.clear(); names.clear();
    for (const k of Object.keys(counters)) delete counters[k];
    trackSeq = 0; fusionT = 0; fusedT = 0; pending.length = 0;
    scheduled.length = 0; comms.reset(); fusion.uplinks.clear(); fusion.cellBand = 'B8';
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
    comms, decide, pendingRequests: pending, coverageAt, nameOf, nodes, tracks: tracker.tracks, bearingCandidates: () => tracker.candidates, fusion, gui,
  };
}
