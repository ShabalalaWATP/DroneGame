// The start screen before deployment, and the game over card.

import { useState } from 'react';
import { enemyCost, money } from '../sim/economy.js';
import { cleanSeed } from '../game.js';
import { useGame, useTick } from './hooks.js';
import { WorldPicker } from './WorldPicker.jsx';

function StartCard() {
  const game = useGame();
  const { sim, commands } = game;
  const [seed, setSeed] = useState(sim.state.seed);
  const [terrain, setTerrain] = useState(sim.state.terrainSeed);
  const [realWorld, setRealWorld] = useState(null); // a world string, once a real map and start point are chosen
  const [wantReal, setWantReal] = useState(false);
  const deploy = () => {
    const s = cleanSeed(seed.trim());
    if (wantReal) {
      const problem = commands.deploy(s, realWorld);
      if (problem) game.toast(problem);
      else history.replaceState(null, '', `?seed=${encodeURIComponent(s)}`); // the site never goes in a URL
      return;
    }
    const t = cleanSeed(terrain.trim());
    commands.deploy(s, t);
    history.replaceState(null, '', `?seed=${encodeURIComponent(s)}&terrain=${encodeURIComponent(t)}`);
  };
  return (
    <div className="card">
      <h1>SITE GUARD</h1>
      {!wantReal && <><p>Drones are inbound on your facility. Place <b>sensors</b> to detect them and <b>defences</b> to stop them. Undetected drones can't be targeted.</p>
      <ul>
        <li>Every system is a SAPIENT node: sensors send detection reports to a fusion node, which tasks the defences. Open the <b>SAPIENT</b> panel to watch the messages and see your laydown.</li>
        <li>Pick a system from the bar on the left (or press 1–8), then click the ground to place it.</li>
        <li>You have one fixed budget of <b>$15M</b> for the whole run. Buying systems and every shot fired both come out of it, and nothing is earned back. The <b>Cost</b> tab compares what you spend with what the attack costs the enemy.</li>
        <li>Try attacks in the <b>Sandbox</b> first: the site cannot be damaged there. Press <b>Start wave</b> when you're ready. The laydown locks once the first wave starts, so runs are comparable.</li>
        <li>Mix it up: no single defence handles every drone type, and the enemy gets harder to hit and jam every wave.</li>
      </ul></>}
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
      <WorldPicker wantReal={wantReal} onWantReal={setWantReal} onWorld={setRealWorld} />
      <button id="btn-deploy" className="primary" disabled={wantReal && !realWorld} onClick={deploy}>{wantReal && !realWorld ? 'Choose a map and start point' : 'Deploy'}</button>
    </div>
  );
}

function GameOverCard() {
  const { sim, commands, saver } = useGame();
  const { state, ledger } = sim;
  return (
    <div className="card">
      <h1>SITE LOST</h1>
      <p>You held out for <b>{Math.max(state.wave - 1, 0)}</b> full wave(s).</p>
      <p>Kills <b>{state.kills}</b> · Enemy attack cost <b>{money(enemyCost(ledger.launched))}</b> · Defence spend <b>{money(ledger.capex + ledger.consumables)}</b></p>
      {saver.message() && <p id="save-status" className="muted">{saver.message()}</p>}
      <button id="btn-restart" className="primary" onClick={() => commands.reset('keep')}>Retry with the same laydown</button>{' '}
      <button id="btn-restart-clear" onClick={() => commands.reset('clear')}>New laydown</button>
    </div>
  );
}

export function Overlay() {
  useTick();
  const { state } = useGame().sim;
  if (state.over) return <div id="overlay"><GameOverCard /></div>;
  if (!state.started) return <div id="overlay"><StartCard /></div>;
  return null;
}
