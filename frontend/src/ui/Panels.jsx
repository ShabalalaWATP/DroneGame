// The smaller panels: tuning, legend, toasts and the operator's approval cards.

import { useEffect, useRef, useState } from 'react';
import { ADAPT, WORLD } from '../sim/config/index.js';
import { useGame, useTick } from './hooks.js';
import { NumberInput } from './NumberInput.jsx';

export function Tuning({ open }) {
  const { commands } = useGame();
  const adaptField = (label, key, step) => (
    <label>{label}<NumberInput value={ADAPT[key]} step={step} onCommit={(v) => commands.setAdapt(key, v)} /></label>
  );
  return (
    <div id="tuning" className={`panel${open ? '' : ' hidden'}`}>
      <div className="label">GAME</div>
      <label>Time scale (x)<NumberInput value={WORLD.timeScale} step={0.5} min={0.5} onCommit={(v) => { WORLD.timeScale = v; }} /></label>
      <div className="muted" style={{ margin: '6px 0' }}>Ranges, prices and drone figures are in the SAPIENT panel, Sources tab.</div>
      <div className="label">ENEMY LEARNING (per wave)</div>
      {adaptField('Evade gain', 'evadePerWave', 0.01)}
      {adaptField('Jam resist gain', 'jamResistPerWave', 0.01)}
    </div>
  );
}

const LEGEND = [
  ['#ffd600', 'FW Spotter: high, orbits, hard to jam, boosts strikes'],
  ['#ff9100', 'FO Strike: slow FPV on fibre: no radio, no jam'],
  ['#ff1744', 'FPV Strike: fast, agile, jammable, emits RF'],
  ['#d500f9', 'FW Strike: fast, high, RF-silent, partly jammable'],
  ['#8a94a3', 'Grey ghost: real drone no sensor has (truth overlay)'],
  ['#ffffff', 'Faint diamond: a fused track (tick Highlight tracks to colour it: white = unclassified, red = multirotor, magenta = fixed-wing)'],
];
export function Legend() {
  return (
    <details id="hud-bottom-left" className="panel">
      <summary>Legend</summary>
      <div className="label">THREATS</div>
      {LEGEND.map(([c, text]) => <div key={c}><i style={{ background: c }} />{text}</div>)}
      <div className="hint">Drag to orbit · right-drag to pan · scroll to zoom</div>
    </details>
  );
}

export function Toast() {
  const game = useGame();
  const [{ text, show }, setToast] = useState({ text: '', show: false });
  const timer = useRef(0);
  useEffect(() => game.onToast((msg) => {
    setToast({ text: msg, show: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2600);
  }), [game]);
  return <div id="toast" className={show ? 'show' : ''}>{text}</div>;
}

export function Approvals() {
  useTick();
  const { sim, commands } = useGame();
  const list = sim.net.pendingRequests;
  return (
    <div id="approval" className={`panel${list.length ? '' : ' hidden'}`}>
      {list.map((r) => (
        <div className="req" key={r.id}>
          <div className="req-h">AUTHORISE ENGAGEMENT?</div>
          <div>{r.text}</div>
          <div className="req-b">
            <button className="primary" onClick={() => commands.decide(r.id, true)}>Approve</button>
            <button onClick={() => commands.decide(r.id, false)}>Deny</button>
          </div>
        </div>
      ))}
    </div>
  );
}
