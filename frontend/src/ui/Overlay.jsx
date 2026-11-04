// The start screen before deployment, and the game over card.

import { useState } from 'react';
import { ECONOMY } from '../sim/config/index.js';
import { enemyCost, money } from '../sim/economy.js';
import { cleanSeed } from '../game.js';
import { view } from '../render/view.js';
import { parseWorldId } from '../sim/world-pack.js';
import { Debrief } from './assistant/Debrief.jsx';
import { useGame, useTick } from './hooks.js';
import { WorldPicker } from './WorldPicker.jsx';

const STAGES = [['1. See', 'Place sensors'], ['2. Stop', 'Place effectors'], ['3. Connect', 'Network it all'], ['4. Prove', 'Rehearse, then fight']];

function StartCard({ openDock }) {
  const game = useGame();
  const { sim, commands } = game;
  const [seed, setSeed] = useState(sim.state.seed);
  const onRealMap = !!parseWorldId(sim.state.terrainSeed); // after leaving one, its world string is no use as a terrain seed
  const [terrain, setTerrain] = useState(onRealMap ? '1' : sim.state.terrainSeed);
  const [realWorld, setRealWorld] = useState(null); // a world string, once a real map and start point are chosen
  const [wantReal, setWantReal] = useState(!!view.startAt || onRealMap);
  const deploy = () => {
    const s = cleanSeed(seed.trim());
    if (wantReal) {
      const problem = commands.deploy(s, realWorld);
      if (problem) { game.toast(problem); return false; }
      history.replaceState(null, '', `?seed=${encodeURIComponent(s)}`); // the site never goes in a URL
      return true;
    }
    const t = cleanSeed(terrain.trim());
    commands.deploy(s, t);
    history.replaceState(null, '', `?seed=${encodeURIComponent(s)}&terrain=${encodeURIComponent(t)}`);
    return true;
  };
  const notChosen = wantReal && !realWorld;
  return (
    <div className="card welcome">
      <div className="wz-debrief-head">SITE GUARD</div>
      <h1>Defend a site</h1>
      {!wantReal && <>
        <p className="lead">You place and network sensors and weapons on a fixed {money(ECONOMY.budget)} budget, then watch your system try to find and stop inbound drones. The heart of it is the gap between where drones really are and where your system believes they are.</p>
        <div className="stages">{STAGES.map(([head, text]) => <div key={head}><b>{head}</b>{text}</div>)}</div>
      </>}
      <p className="muted">A game and a teaching tool. Most figures are vendor claims or labelled assumptions, so do not base real decisions on it.</p>
      <details className="seeds">
        <summary>Advanced: scenario and terrain seeds</summary>
        <div className="seed-row">
          <label htmlFor="seed-input">Scenario seed</label>
          <input id="seed-input" type="text" spellCheck="false" maxLength={64} value={seed} onChange={(e) => setSeed(e.target.value)} />
          <button id="btn-seed-random" title="Pick a random seed" onClick={() => setSeed(String(Math.floor(Math.random() * 900000) + 100000))}>Random</button>
        </div>
        <div className="seed-row">
          <label htmlFor="terrain-input">Terrain seed</label>
          <input id="terrain-input" type="text" spellCheck="false" maxLength={64} value={terrain} onChange={(e) => setTerrain(e.target.value)} />
        </div>
        <p className="muted seed-note">The same scenario seed and laydown give the same attack every time. The terrain seed changes the ground (hills, woods, power lines) without changing the attack.</p>
      </details>
      <WorldPicker wantReal={wantReal} onWantReal={setWantReal} onWorld={setRealWorld} />
      <div className="start-actions">
        <button id="btn-guide" className="wz-go" disabled={notChosen} onClick={() => { if (deploy()) game.setViewOption('wizard', 'open'); }}>Guide me through it</button>
        <button id="btn-deploy" disabled={notChosen} onClick={deploy}>{notChosen ? 'Choose a map and start point' : 'I know the game, just deploy'}</button>
        {openDock && <button id="btn-load-saved" className="quiet" disabled={notChosen} onClick={() => { if (deploy()) openDock('saved'); }}>Load a saved laydown</button>}
      </div>
    </div>
  );
}

function GameOverCard({ onReview }) {
  const { sim, commands, saver } = useGame();
  const { state, ledger } = sim;
  return (
    <div className="card game-over">
      <div>
        <h1>SITE LOST</h1>
        <p>You held out for <b>{Math.max(state.wave - 1, 0)}</b> full wave(s).</p>
        <p>Kills <b>{state.kills}</b> · Enemy attack cost <b>{money(enemyCost(ledger.launched))}</b> · Defence spend <b>{money(ledger.capex + ledger.consumables)}</b></p>
        {saver.message() && <p id="save-status" className="muted">{saver.message()}</p>}
        <button id="btn-restart" className="primary" onClick={() => commands.reset('keep')}>Retry with the same laydown</button>{' '}
        <button id="btn-restart-clear" onClick={() => commands.reset('clear')}>New laydown</button>
      </div>
      <Debrief onReview={onReview} />
    </div>
  );
}

export function Overlay({ openDock }) {
  useTick();
  const [reviewing, setReviewing] = useState(false);
  const game = useGame();
  const { state } = game.sim;
  if (state.over) {
    if (reviewing) {
      const back = () => { game.getReplay()?.exit(); setReviewing(false); };
      return <button id="btn-results" className="primary" onClick={back}>Back to the results</button>;
    }
    return <div id="overlay"><GameOverCard onReview={() => setReviewing(true)} /></div>;
  }
  if (reviewing) setReviewing(false); // a new run has started
  if (!state.started) return <div id="overlay"><StartCard openDock={openDock} /></div>;
  return null;
}
