// A guided tour of how SAPIENT messages flow, with real examples from this run, and "follow a track".

import { useState } from 'react';
import { bus } from '../../sim/sapient.js';
import { annotate } from '../sapient-help.js';
import { useGame, useTick } from '../hooks.js';
import { TYPE_COLOUR } from './network-canvas.js';

const STEPS = [
  { title: '1. A system joins the network', types: ['registration', 'registration_ack'],
    text: <>When a system is built it sends a <b>registration</b>: who it is, what type of node, what modes it has, how often it will report. The fusion node answers with a <b>registration acknowledgement</b>. From then on the system is part of the network.</> },
  { title: '2. Staying in touch', types: ['status_report'],
    text: <>Every few seconds each node sends a <b>status report</b>: its mode, where it is and whether it is healthy. If the fusion node hears nothing for three reports in a row it raises "Lost contact". Cut a node's link and you will see this happen.</> },
  { title: '3. A sensor sees something', types: ['detection_report'], find: (e) => !e.msg.detection_report.derived_detection,
    text: <>A sensor sends a <b>detection report</b>: where the thing is relative to the sensor (range and bearing, or bearing only), how sure it is, what it looks like, and any signal it heard. A radar gives range; a camera or RF detector gives only direction. Each node numbers things its own way (<code>object_id</code>).</> },
  { title: '4. The fusion node combines them', types: ['detection_report'], find: (e) => !!e.msg.detection_report.derived_detection,
    text: <>The fusion node matches reports from different sensors into one <b>track</b> and sends its own detection report to the operator screen. <code>derived_detection</code> lists which sensor reports it was built from, so every track can be traced back to its evidence.</> },
  { title: '5. Pointing a sensor', types: ['task'], find: (e) => !!(e.msg.task.command && e.msg.task.command.look_at),
    text: <>Radar finds things; the camera is narrow and has to be told where to look. The fusion node sends a <b>task</b> with a <code>look_at</code> command. The camera turns, dwells, and its detection reports now carry a classification (Multirotor or Fixed wing).</> },
  { title: '6. Engaging', types: ['task', 'task_ack'], find: (e) => (e.type === 'task' ? !!(e.msg.task.command && e.msg.task.command.request) : true),
    text: <>To engage, the fusion node sends a <b>task</b> to an effector (<code>request: "Engage"</code> plus the track). The effector replies with a <b>task acknowledgement</b>: accepted, or rejected with a reason (out of range, no line of sight, nothing at the cued position, wrong type of target). SAPIENT has no dedicated "engage" command, so this uses the free-text request field.</> },
  { title: '7. A person decides', types: ['alert', 'alert_ack'], find: (e) => (e.type === 'alert' ? /Engagement request/.test(e.msg.alert.description) : true),
    text: <>SAPIENT has no message for weapon release. This game emulates it with an <b>alert</b> from the fusion node asking a person, and an <b>alert acknowledgement</b> carrying the answer. Set "Engagement authority" in the top right to try it.</> },
  { title: '8. Kill reported, then confirmed', types: ['alert'], find: (e) => /Kill (reported|confirmed|NOT)/.test(e.msg.alert.description),
    text: <>There is no kill-confirmation message either. The effector reports its task completed; the fusion node raises an alert and waits for the sensors to lose the track before it confirms (or warns that the target is still there).</> },
  { title: '9. When something is wrong', types: ['error', 'alert'], find: (e) => e.type === 'error' || /Lost contact|Contact restored/.test(e.msg.alert.description),
    text: <>A message that breaks the rules gets an <b>error</b> from the middleware. A node that goes quiet gets a "Lost contact" <b>alert</b>. Try "Inject fault" in the Messages tab.</> },
];

const exampleFor = (s) => {
  for (let i = bus.entries.length - 1; i >= 0; i--) { const e = bus.entries[i]; if (s.types.includes(e.type) && (!s.find || s.find(e))) return e; }
  return null;
};

export function followMessages(tr) {
  const ids = new Set([tr.id, ...[...tr.sources.values()].map((v) => v.objectId)]);
  return bus.entries.filter((e) => {
    const m = e.msg[e.type];
    if (e.type === 'detection_report') return ids.has(m.object_id);
    if (e.type === 'task') return m.command && m.command.command_parameter === tr.id;
    if (e.type === 'alert') return tr.short && (m.description.includes(tr.short + ' ') || m.description.endsWith(tr.short));
    return false;
  }).slice(-60);
}

export function LearnTab({ active }) {
  useTick(active);
  const { net } = useGame().sim;
  const [text, setText] = useState('Pick an example to read it here.');
  const [followId, setFollowId] = useState('');
  const [followed, setFollowed] = useState([]);
  const tracks = [...net.tracks.values()].filter((t) => t.short);
  const describe = (ent) => `${net.nameOf(ent.from)} → ${net.nameOf(ent.to)} at ${ent.t.toFixed(1)} s\n\n${annotate(ent.msg).join('\n')}`;
  const showStep = (s) => {
    const ent = exampleFor(s);
    setText(ent ? `${s.title}\n${describe(ent)}` : 'No message of this kind yet in this run. Place some systems, wire them and start a wave.');
  };
  const follow = (id) => {
    setFollowId(id);
    const tr = net.tracks.get(id);
    setFollowed(tr ? followMessages(tr) : []);
  };
  return (
    <>
      <div className="sys note">How information flows in this system, step by step. Each step shows a real message from this run with a plain-English note beside each field. Messages are in the form defined by BSI Flex 335 v2.0; the wording is mine.</div>
      {STEPS.map((s, i) => (
        <div className="sys step" key={i}>
          <div className="sys-h"><b>{s.title}</b></div>
          <div>{s.text}</div>
          <button className="mini" data-step={i} onClick={() => showStep(s)}>Show an example from this run</button>
        </div>
      ))}
      <div className="sys">
        <div className="sys-h"><b>Follow a track</b></div>
        <div>Pick a track to see every message that led to it: the sensor reports, the fused reports, and any tasks and alerts that mention it.</div>
        <select id="follow" value={followId} onChange={(e) => follow(e.target.value)}>
          <option value="">choose a track...</option>
          {tracks.map((t) => <option key={t.id} value={t.id}>{t.short} ({t.airframe === 'Unknown' ? 'unclassified' : t.airframe})</option>)}
        </select>
        <div id="follow-list" className="pk-list">
          {followed.map((m) => (
            <div className="pk" key={m.seq} onClick={() => setText(describe(m))}>
              <i style={{ background: TYPE_COLOUR[m.type] }} />{m.t.toFixed(1)}s {net.nameOf(m.from)} → {net.nameOf(m.to)} <b>{m.type}</b>
            </div>
          ))}
          {followId && !followed.length && <div className="muted">no messages yet</div>}
        </div>
      </div>
      <pre id="learn-json" className="pk-json big">{text}</pre>
    </>
  );
}
