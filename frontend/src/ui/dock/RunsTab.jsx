// Every finished run, newest first. Results are reported by this browser, so they are a record for you, not proof of a score.

import { useEffect, useState } from 'react';
import { money } from '../../sim/economy.js';
import { worldLabel } from '../../sim/world-pack.js';
import { useArmed, useGame, useLoad, useTick } from '../hooks.js';

const PAGE = 20;
const when = (iso) => new Date(iso).toLocaleString();

export function RunsTab({ active }) {
  useTick(active);
  const { api, saver } = useGame();
  const [offset, setOffset] = useState(0);
  const [note, setNote] = useState('');
  const pending = saver.pending();
  const { data, error, reload } = useLoad(() => api.runs.page(PAGE, offset), active, [offset, saver.saved()]);
  const remove = useArmed();

  // this page has emptied, because its last run was deleted: show what is now the last page
  useEffect(() => {
    if (data && !data.items.length && offset > 0) setOffset(Math.floor(Math.max(data.total - 1, 0) / PAGE) * PAGE);
  }, [data, offset]);

  const deleteRun = async (id) => {
    try { await api.runs.remove(id); setNote('Run deleted.'); await reload(); } catch (e) { setNote(e.message); }
  };
  const retry = async () => {
    const saved = await saver.flush();
    if (!saved && saver.pending()) setNote('The save server is still not running. Your kept runs are safe in this browser.');
    await reload();
  };

  const total = data ? data.total : 0;
  return (
    <>
      <div className="sys note">Every run is recorded when it ends, however it ends. Results are as reported by this browser: a record for you, not proof of a score.</div>
      {pending > 0 && <div id="runs-pending" className="saved-error">{pending} run{pending > 1 ? 's' : ''} kept in this browser, waiting to be saved. <button id="runs-retry" className="mini" onClick={retry}>Save now</button></div>}
      {note && <div id="runs-note" className="saved-note">{note}</div>}
      {error && <div id="runs-error" className="saved-error">{error} <button className="mini" onClick={reload}>Try again</button></div>}
      {data && !total && !error && <div className="muted">No runs recorded yet. A run is recorded once its first wave has started.</div>}
      {data && data.items.length > 0 && (
        <>
          <table className="mini" id="runs-list">
            <thead><tr><th>Finished</th><th>Seed</th><th>Ground</th><th>Waves</th><th>Kills</th><th>Leaks</th><th>Health</th><th>Spent</th><th>Left</th><th>Enemy</th><th /></tr></thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.finished_at)}</td><td>{r.scenario_seed}</td><td>{worldLabel(r.world)}</td><td>{r.waves_completed}</td><td>{r.kills}</td><td>{r.leaks}</td>
                  <td>{Math.round(r.health)}%</td><td>{money(r.capex + r.consumables)}</td><td>{money(r.budget_left)}</td><td>{money(r.enemy_cost)}</td>
                  <td><button className="mini" onClick={remove.confirm(r.id, () => deleteRun(r.id))}>{remove.armed === r.id ? 'Sure?' : 'Delete'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="runs-paging">
            <button className="mini" disabled={offset === 0} onClick={() => setOffset(Math.max(offset - PAGE, 0))}>Newer</button>
            <span className="muted">{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
            <button className="mini" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Older</button>
          </div>
        </>
      )}
    </>
  );
}
