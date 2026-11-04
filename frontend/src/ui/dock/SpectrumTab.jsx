import { useRef } from 'react';
import { COMMS, SPECTRUM } from '../../sim/config/index.js';
import { useAnimation, useGame, useTick } from '../hooks.js';
import { drawSpectrum, jamConflicts } from './spectrum-canvas.js';

export function SpectrumTab({ active }) {
  useTick(active);
  const { net } = useGame().sim;
  const canvas = useRef(null);
  useAnimation(active, () => drawSpectrum(canvas.current, net), 300);
  const conflicts = active ? jamConflicts(net) : [];
  return (
    <>
      <canvas id="spec-canvas" ref={canvas} />
      <div id="spec-notes">
        {conflicts.length
          ? <ul>{conflicts.map((c, i) => (
              <li key={i}>
                <b>{c.j.short}</b> jams <b>{SPECTRUM.bands[c.id].label}</b>, which overlaps your <b>{COMMS.cellular.bands[c.cid].label}</b> cellular band used by {c.list.length} link{c.list.length > 1 ? 's' : ''} ({c.list.map((n) => n.short).slice(0, 6).join(', ')}). While {c.j.short} is jamming ({c.j.mode === 'Jam' ? <b>now</b> : 'currently standby'}), cellular links within {c.j.def.range} m of it degrade. Move those links to another band or stop jamming that band.
              </li>
            ))}</ul>
          : <div className="muted">No overlap between your jamming and your cellular links. (Starlink uses Ku-band, far from anything you jam.)</div>}
      </div>
      <div className="plan-note">Frequency in GHz on a logarithmic scale. Bright bars are in use right now. A red stripe is where your own jamming overlaps one of your own links.</div>
    </>
  );
}
