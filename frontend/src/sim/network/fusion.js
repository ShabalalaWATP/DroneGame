// The fusion node's picture: feeding detections into the tracker, reports to the C2 GUI, kill confirmation and track alerts.

import * as S from '../sapient.js';
import { FUSION } from '../config/index.js';
import { round, classDepth } from './core.js';

export function createFusion(core, { raiseAlert }) {
  const { ctx, T, tracker, fusion, gui, send, siteDist } = core;
  let trackSeq = 0, fusedT = 0;

  function feed(s, f) {
    const tr = tracker.ingest(f.meas, T());
    if (!tr) return;
    tr.drone = tr.truth; // for the displays: the real drone this track last matched (null for a false alarm)
    tr.sources.set(s.nodeId, { ...f.source, lastT: T() });
    if (!tr.cls || classDepth(f.source.cls) >= classDepth(tr.cls)) tr.cls = f.source.cls; // classification is remembered
  }

  const confirmedTracks = () => [...tracker.tracks.values()].filter((tr) => tr.status === 'confirmed' && !tr.killWatch);

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

  // Kill confirmation: the sensors must have lost the track.
  function confirmKills() {
    for (const tr of [...tracker.tracks.values()]) {
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
  }

  function trackAlerts() {
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
  }

  function sendFusedReports(dt) {
    fusedT += dt;
    if (fusedT >= FUSION.fusedInterval) { fusedT = 0; for (const tr of tracker.tracks.values()) if (tr.status !== 'tentative') fusedReport(tr); }
  }

  const reset = () => { trackSeq = 0; fusedT = 0; };

  return { feed, confirmedTracks, refreshTracks, confirmKills, trackAlerts, sendFusedReports, reset };
}
