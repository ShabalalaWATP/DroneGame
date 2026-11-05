// Try attacks against the laydown without risking the site.

import { useState } from 'react';
import { DRONES } from '../sim/config/index.js';
import { money } from '../sim/economy.js';
import { clamp } from '../sim/units.js';
import { useGame, useTick } from './hooks.js';
import { useMovable } from './useMovable.js';

const COMPASS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
const LEVELS = [1, 2, 3, 4, 5, 6, 8, 10];

export function Sandbox() {
  useTick();
  const { sim, commands } = useGame();
  const { state, drones } = sim;
  const { style, handle } = useMovable();
  const [form, setForm] = useState({ type: Object.keys(DRONES)[0], count: '3', dir: '0', gap: '4' });
  const [small, setSmall] = useState(false); // shrunk to its title and live figures, to watch an attack
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const launch = () => commands.launchSandboxAttack({
    type: form.type, bearingDeg: form.dir,
    count: clamp(Math.round(Number(form.count) || 1), 1, 30), gap: Math.max(Number(form.gap) || 0, 0),
  });
  return (
    <>
      <div id="sandbox" className={`panel${state.sandbox ? '' : ' hidden'}`} data-movable style={style}>
        <button id="sb-minimise" aria-expanded={!small} aria-label={small ? 'Expand the sandbox panel' : 'Minimise the sandbox panel'} title={small ? 'Expand' : 'Minimise'} onClick={() => setSmall(!small)}>{small ? '▢' : '–'}</button>
        <h3 title="Drag to move. Double-click to put it back." {...handle}>SANDBOX</h3>
        {!small && <>
        <div className="note">Attack your laydown without consequences: the site and your systems cannot be damaged and shots are free. Leaving resets the run and keeps your laydown, so you can still place and wire systems here.</div>
        <label>Enemy has adapted to wave{' '}
          <select id="sb-level" value={state.sbLevel} onChange={(e) => commands.setSandboxLevel(Number(e.target.value))}>
            {LEVELS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="row"><button id="sb-wave" className="primary" onClick={() => commands.launchSandboxWave()}>Launch that wave's attack</button></div>
        <div className="label" style={{ marginTop: 8 }}>CUSTOM ATTACK</div>
        <label>Drone <select id="sb-type" value={form.type} onChange={set('type')}>{Object.entries(DRONES).map(([k, d]) => <option key={k} value={k}>{d.name}</option>)}</select></label>
        <label>Number <input id="sb-count" type="number" min="1" max="30" value={form.count} onChange={set('count')} /></label>
        <label>From <select id="sb-dir" value={form.dir} onChange={set('dir')}>{COMPASS.map(([n, b]) => <option key={n} value={b}>{n}</option>)}<option value="rand">Random</option></select></label>
        <label>Seconds apart <input id="sb-gap" type="number" min="0" max="60" value={form.gap} onChange={set('gap')} /></label>
        <div className="row">
          <button id="sb-launch" className="primary" onClick={launch}>Launch</button>
          <button id="sb-clear" onClick={() => commands.clearSandboxDrones()}>Clear drones</button>
          <button id="sb-exit" onClick={() => commands.exitSandbox()}>Exit sandbox</button>
        </div>
        </>}
        <div id="sb-info" className="note">{state.sbQueue.length} drone(s) queued · {drones.length} in the air · shots fired (free here) {money(state.sbSpent)} · leaks {state.leaks}</div>
      </div>
      <div id="sandbox-banner" className={state.sandbox ? '' : 'hidden'}>SANDBOX: the site cannot be damaged. Exit sandbox to reset.</div>
    </>
  );
}
