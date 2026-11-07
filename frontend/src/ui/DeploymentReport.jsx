// The end-of-deployment report: how it ended, what was fired and jammed, what it stopped, what got through and what it cost.

import { money } from '../sim/economy.js';

const TITLE = { site: 'SITE LOST', patrol: 'PATROL LOST', ended: 'DEPLOYMENT ENDED' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const duration = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);
const used = (f) => (f.beam ? `${f.n} s of beam` : plural(f.n, f.kind === 'missile' || f.kind === 'interceptor' ? f.kind : 'round'));

export function DeploymentReport({ report: r }) {
  const c = r.cost;
  return (
    <div id="deployment-report">
      <h1>{TITLE[r.outcome]}</h1>
      <p>{r.outcome === 'ended' ? 'You ended the deployment' : 'You held out'} after <b>{r.waves}</b> full wave(s).</p>
      <p id="report-drones"><b>{r.launched}</b> drones launched · <b>{r.intercepted}</b> intercepted · <b>{r.leaked}</b> got through · <b>{r.left}</b> turned away</p>

      <h2>What shot down what</h2>
      {r.killers.length ? (
        <ul id="report-killers">{r.killers.map((k) => <li key={k.by}><b>{k.name}</b> {k.n}: {k.of.map((o) => `${o.n} ${o.name}`).join(', ')}</li>)}</ul>
      ) : <p className="muted">Nothing was shot down.</p>}

      <h2>Munitions and jamming used</h2>
      {r.fired.length || r.jammed.length ? (
        <table className="mini" id="report-used">
          <thead><tr><th>System</th><th>Used</th><th>Cost</th><th>Kills</th></tr></thead>
          <tbody>
            {r.fired.map((f) => <tr key={f.id}><td>{f.name}</td><td>{used(f)}</td><td>{money(f.cost)}</td><td>{f.kills}</td></tr>)}
            {r.jammed.map((j) => <tr key={j.id}><td>{j.name}</td><td>{duration(j.seconds)} jamming</td><td>none</td><td>–</td></tr>)}
          </tbody>
        </table>
      ) : <p className="muted">Nothing was fired or jammed.</p>}
      {r.jammed.length > 0 && <p className="muted">Jamming brought down {plural(r.jamKills, 'drone')} in all.</p>}

      <h2>Cost of the defence</h2>
      <p id="report-cost">Systems {money(c.systems)} · munitions {money(c.munitions)} · <b>total {money(c.spent)}</b>{c.lost > 0 && <> · systems lost worth {money(c.lost)}</>}</p>
      <p className="muted">The enemy attack cost {money(c.enemy)}, of which {money(c.destroyed)} was destroyed{c.perIntercept != null && `; munitions came to ${money(c.perIntercept)} per drone intercepted`}.</p>

      <h2>Own losses</h2>
      <p id="report-losses">{r.outcome === 'patrol' ? 'Patrol' : 'Site'} integrity {Math.round(r.health * 100)}%{r.lost.length ? ` · lost ${r.lost.map((l) => `${l.n} ${l.name}`).join(', ')}` : ' · no systems lost'}</p>
    </div>
  );
}
