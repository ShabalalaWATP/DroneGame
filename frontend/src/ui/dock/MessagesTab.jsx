// The message log and inspector: what a middleware (or a packet capture) would see.

import { useLayoutEffect, useRef, useState } from 'react';
import { bus } from '../../sim/sapient.js';
import { view } from '../../render/view.js';
import { annotate } from '../sapient-help.js';
import { download, useGame, useTick } from '../hooks.js';

const TYPES = [
  ['registration', 'Reg'], ['registration_ack', 'RegAck'], ['status_report', 'Status'], ['detection_report', 'Detect'],
  ['task', 'Task'], ['task_ack', 'TaskAck'], ['alert', 'Alert'], ['alert_ack', 'AlertAck'], ['error', 'Error'],
];
const MAX_ROWS = 150;
const count = (n) => n.toLocaleString('en-US');

export function summary(e) {
  const c = e.msg[e.type];
  switch (e.type) {
    case 'registration': return `${c.name} (${c.node_definition[0].node_type.replace('NODE_TYPE_', '')})`;
    case 'registration_ack': return c.acceptance ? 'accepted' : 'rejected';
    case 'status_report': return `${c.mode} · ${c.system.replace('SYSTEM_', '')}${c.info === 'INFO_NEW' ? ' · new' : ''}`;
    case 'detection_report': {
      const rb = c.range_bearing;
      const where = rb ? `az ${rb.azimuth.toFixed(1)}°${rb.range != null ? ` r ${Math.round(rb.range)} m` : ''}` : 'location';
      return `obj ${(c.object_id || '').slice(-5)} · ${where} · conf ${c.detection_confidence}`;
    }
    case 'task': return `${c.task_name}: ${c.control.replace('CONTROL_', '')}`;
    case 'task_ack': return `${c.task_status.replace('TASK_STATUS_', '')}${c.reason ? ': ' + c.reason.join('; ') : ''}`;
    case 'alert': return `${c.alert_type.replace('ALERT_TYPE_', '')}: ${c.description}`;
    case 'alert_ack': return c.alert_ack_status.replace('ALERT_ACK_STATUS_', '');
    case 'error': return c.error_message.join('; ');
    default: return '';
  }
}

function detailText(entry, explain) {
  if (!entry) return 'Select a message to see its JSON.';
  const n = entry.net;
  const netLine = n && !n.local ? `// network: ${n.dropped ? 'LOST (' + n.reason + ')' : 'delivered after ' + Math.round(n.delay * 1000) + ' ms'}\n` : '';
  return netLine + (explain ? annotate(entry.msg).join('\n') : JSON.stringify(entry.msg, null, 2));
}

export function MessagesTab({ active }) {
  useTick(active);
  const { sim, commands } = useGame();
  const { net } = sim;
  const [off, setOff] = useState(() => new Set());
  const [nodeFilter, setNodeFilter] = useState('all');
  const [frozen, setFrozen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [explain, setExplain] = useState(false);
  const shown = useRef([]);
  const list = useRef(null);

  if (!frozen) {
    // while rewinding, the log shows only what had been sent up to the moment being reviewed
    const matches = (e) => !off.has(e.type) && (view.replayT == null || e.t <= view.replayT) && (nodeFilter === 'all' || e.from === nodeFilter || e.to === nodeFilter);
    const rows = [];
    for (let i = bus.entries.length - 1; i >= 0 && rows.length < MAX_ROWS; i--) if (matches(bus.entries[i])) rows.push(bus.entries[i]);
    shown.current = rows.reverse();
  }

  const lastSeq = shown.current.length ? shown.current[shown.current.length - 1].seq : 0;
  const stick = useRef(true);
  useLayoutEffect(() => { // stay at the bottom unless the player has scrolled up
    const el = list.current;
    if (stick.current) el.scrollTop = el.scrollHeight;
  }, [lastSeq]);

  const toggleType = (t) => setOff((prev) => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; });
  return (
    <>
      <div className="msg-tools">
        <div id="chips">
          {TYPES.map(([t, label]) => <button key={t} className={`chip t-${t}${off.has(t) ? ' off' : ''}`} data-type={t} onClick={() => toggleType(t)}>{label} <b>{bus.counts[t] || 0}</b></button>)}
        </div>
        <div className="row">
          <select id="node-filter" value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}>
            <option value="all">All nodes</option>
            {[...net.nodes.values(), net.gui].map((n) => <option key={n.nodeId} value={n.nodeId}>{n.name}</option>)}
          </select>
          <button id="log-freeze" className={frozen ? 'active' : ''} onClick={() => setFrozen((f) => !f)}>{frozen ? 'Resume' : 'Freeze'}</button>
          <button id="log-clear" onClick={() => { commands.clearMessages(); setSelected(null); shown.current = []; }}>Clear</button>
          <button id="log-export" title={`Download the messages still kept (the newest ${count(bus.max)} at most) as newline-delimited JSON`} onClick={() => download('sapient-log.ndjson', bus.entries.map((e) => JSON.stringify(e.msg)).join('\n'), 'application/x-ndjson')}>Export</button>
          <button id="log-fault" title="Send a malformed report to see the middleware's Error reply" onClick={() => commands.injectFault()}>Inject fault</button>
          <label className="muted" title="Show a plain-English note beside each field"><input type="checkbox" id="log-explain" checked={explain} onChange={(e) => setExplain(e.target.checked)} /> Explain</label>
        </div>
        {bus.entries.length < bus.seq && <div id="log-kept" className="muted">Keeping {count(bus.entries.length)} of {count(bus.seq)} messages. Older ones can no longer be listed, rewound to or exported.</div>}
      </div>
      <div id="msg-list" ref={list} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 30; }}>
        {shown.current.map((e) => (
          <div key={e.seq} className={`row t-${e.type}${selected && selected.seq === e.seq ? ' sel' : ''}`} onClick={() => setSelected(e)}>
            <span className="tm">{e.t.toFixed(1)}s</span>
            <span className="ft">{net.nameOf(e.from)} → {net.nameOf(e.to)}</span>
            <span className="ty">{e.type}</span>
            <span className="sm">{e.net && e.net.dropped && <><b className="dropmark" title={e.net.reason}>✗ {e.net.reason}</b> </>}{summary(e)}</span>
          </div>
        ))}
      </div>
      <pre id="msg-detail" className={selected ? '' : 'empty'}>{detailText(selected, explain)}</pre>
    </>
  );
}
