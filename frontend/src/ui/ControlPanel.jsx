// Top right: starting waves, game speed, view toggles, engagement authority, and opening the other panels.

import { useEffect } from 'react';
import { FUSION } from '../sim/config/index.js';
import { view } from '../render/view.js';
import { useArmed, useGame, useTick } from './hooks.js';
import { MapControls } from './MapControls.jsx';

const SPEEDS = [[0, '❚❚', 'Pause (Space)'], [1, '1x'], [2, '2x'], [3, '3x']];

export function ControlPanel({ onToggleDock, onToggleTuning, onSandbox }) {
  useTick();
  const game = useGame();
  const { sim, commands, clock } = game;
  const { state } = sim;
  const real = state.terrainSeed.startsWith('pack:'); // the demo map is only for generated ground

  useEffect(() => { document.body.classList.toggle('track-hi', view.trackHi); });

  const clear = useArmed(); // it throws the laydown away

  const toggle = (id, key, label, title) => (
    <label title={title}><input type="checkbox" id={id} checked={view[key]} onChange={(e) => game.setViewOption(key, e.target.checked)} /> {label}</label>
  );

  return (
    <div id="hud-top-right" className="panel">
      <button id="btn-wave" className="primary" disabled={state.waveActive || state.over || state.sandbox} onClick={() => commands.startWave()}>
        {state.sandbox ? 'Exit sandbox to start' : state.waveActive ? `Wave ${state.wave} in progress` : `Start wave ${state.wave + 1}`}
      </button>
      <div className="row">
        {SPEEDS.map(([s, text, title]) => (
          <button key={s} className={`speed${clock.speed === s ? ' active' : ''}`} data-speed={s} title={title} onClick={() => game.setSpeed(s)}>{text}</button>
        ))}
      </div>
      <label><input type="checkbox" id="auto" checked={state.autoStart} onChange={(e) => commands.setAutoStart(e.target.checked)} /> Auto-start next wave</label>
      {!real && toggle('osm-toggle', 'osm', 'OpenStreetMap (demo)', 'Live map tiles on the ground, around Marlborough. A picture only: the hills, trees and rules stay as generated. Needs internet, and tells OpenStreetMap you are viewing this area.')}
      {!real && view.osm && <div id="osm-credit" className="muted">Map © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors</div>}
      <MapControls />
      {toggle('rings', 'rings', 'Show ranges (R)')}
      {toggle('truth', 'truth', 'Truth overlay (T)', "On: every drone is drawn where it really is (grey if no sensor has it). Off: you only see what the fusion node believes.")}
      {toggle('labels-toggle', 'labels', 'Labels (L)', 'Name tags on every system and drone')}
      {toggle('track-hi', 'trackHi', 'Highlight tracks', "Tracks are drawn faint grey so they don't crowd the view. Tick to colour them by classification.")}
      <label title="Who decides to engage. SAPIENT has no weapon-release message, so this is a C2 policy."> Engagement authority
        <select id="authority" value={FUSION.authority} onChange={(e) => commands.setAuthority(e.target.value)}>
          <option value="auto">Automatic</option><option value="costly">Ask for costly shots</option><option value="all">Ask for every engagement</option>
        </select>
      </label>
      <button id="btn-sandbox" title="Try attacks against your laydown without risking the site" onClick={() => { if (state.sandbox) commands.exitSandbox(); else { commands.enterSandbox(); onSandbox(); } }}>
        {state.sandbox ? 'Exit sandbox' : 'Sandbox'}
      </button>
      <div className="row">
        <button id="btn-reset" title="Start the run again with the same laydown, wiring and seed" onClick={() => { if (state.started) commands.reset('keep'); }}>Reset run</button>
        <button id="btn-clear" title="Remove everything and start with an empty site" onClick={state.started ? clear.confirm('clear', () => commands.reset('clear')) : undefined}>{clear.armed ? 'Sure? Click again' : 'New laydown'}</button>
      </div>
      <button id="btn-sapient" onClick={onToggleDock}>SAPIENT</button>
      <button id="btn-tuning" onClick={onToggleTuning}>Tuning</button>
    </div>
  );
}
