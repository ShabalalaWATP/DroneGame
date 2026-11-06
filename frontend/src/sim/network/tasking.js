// The fusion node deciding what each effector and camera should do, and telling it with SAPIENT Task messages.

import * as S from '../sapient.js';
import { FUSION, DRONES } from '../config/index.js';
import { canFire } from '../magazine.js';
import { zoomMax } from '../camera-model.js';
import { inArcOf } from '../sensor-model.js';

// Would this effector ever take this airframe? Unknown tracks are offered, and the effector can reject them.
const takesAirframe = (def, airframe) => !def.engages || !airframe || airframe === 'Unknown' || def.engages.some((t) => DRONES[t].airframe === airframe);

export function createTasking(core, { raiseAlert }, registration, authority, confirmedTracks) {
  const { ctx, mpu, T, nodes, tracker, fusion, send, deliver, distToTrack, siteDist } = core;
  const faces = (s, tr) => inArcOf(s.def, s.pos, { x: tr.est.east / mpu(), z: -tr.est.north / mpu() }); // a sector antenna only jams what it faces
  const { sendStatus } = registration;

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
    if (!approved && authority().needsApproval(s)) { if (!authority().isPending(s, tr)) authority().requestApproval(s, tr); return; }
    const { id, res: sent } = sendTask(s, {
      control: 'CONTROL_START',
      command: { request: 'Engage', command_parameter: tr.id },
    }, `Engage ${tr.short}`, `Engage track ${tr.short} (${tr.airframe || 'unclassified'})`);
    if (sent.dropped) { s.rejected.set(tr.id, T() + FUSION.rejectBackoff); return; } // the task never arrived
    // the effector acquires whatever real target is at the track; a false or mis-placed track has none
    const res = ctx.acceptTask(s, tr.drone);
    if (res.ok) {
      s.task = { id, drone: tr.drone, trackId: tr.id, activeAt: T() + sent.delay }; // it can act once the task has arrived
      sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED');
      sendStatus(s);
    } else {
      sendTaskAck(s, id, 'TASK_STATUS_REJECTED', res.reasons);
      if (res.permanent) s.denied.add(tr.id); // it can never take this track; don't ask again
      else s.rejected.set(tr.id, T() + FUSION.rejectBackoff); // try a different target next time
    }
  }

  // Should the fusion node offer this track to this effector? Keeps expensive rounds for the targets that need them.
  function eligible(s, tr) {
    const def = s.def;
    if (s.denied.has(tr.id) || authority().isPending(s, tr)) return false;
    if (T() < (s.rejected.get(tr.id) ?? 0)) return false;
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
        if (distToTrack(s, tr) > s.def.range * zoomMax(s.def) * 1.3) continue; // it zooms in on a cue
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
          s.cue = { trackId: best.id, until: T() + s.def.dwell, from: T(), onAt: null };
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
      if (s.def.kind === 'jammer') {
        const want = live.some((tr) => distToTrack(s, tr) <= s.def.range && faces(s, tr)) ? 'Jam' : 'Standby';
        if (s.mode !== want && s.modePending !== want) {
          const { id, res } = sendTask(s, { control: 'CONTROL_START', command: { mode_change: want } }, `Mode ${want}`, `Switch ${s.name} to ${want}`);
          if (!res.dropped) {
            s.modePending = want;
            deliver(res, () => { s.mode = want; s.modePending = null; sendTaskAck(s, id, 'TASK_STATUS_ACCEPTED'); sendStatus(s, true); });
          }
        }
        continue;
      }
      // Out of rounds or reloading: give the target up so another launcher can take it, and offer this one nothing for now.
      // shortcut: the fusion node reads the magazine directly. Report it in SAPIENT status if a lost launcher should be able to look armed.
      if (!canFire(s)) {
        completeTask(s, 'TASK_STATUS_FAILED', [s.reload > 0 ? 'reloading' : 'out of rounds']);
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
        if (!eligible(s, tr) || ctx.roundsCover(s, tr.drone)) continue;
        const dd = siteDist(tr);
        if (dd < bd) { bd = dd; best = tr; }
      }
      if (!best || (s.task && s.task.trackId === best.id)) continue;
      if (s.task) {
        const cur = tracker.tracks.get(s.task.trackId);
        if (cur && !ctx.roundsCover(s, cur.drone) && siteDist(cur) - bd < FUSION.retaskAdvantage) continue;
        sendTask(s, { control: 'CONTROL_STOP' }, `Stop ${cur ? cur.short : 'task'}`, 'Re-tasked to a closer threat');
        completeTask(s, 'TASK_STATUS_COMPLETED', ['re-tasked']);
      }
      assign(s, best);
    }
  }

  return { assign, tasking };
}
