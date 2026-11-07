// The patrol's column: each vehicle, the system it carries and where it keeps along the route, ahead of the soldiers or behind.
// Changing it rebuilds the patrol on the same route, so it is only open before the first wave.

import { MAX_ESCORTS, MAX_ESCORT_GAP, MOUNTS, PATROL, PATROL_VEHICLES, STRUCTURES } from '../sim/config/index.js';
import { useGame } from './hooks.js';
import { NumberInput } from './NumberInput.jsx';

const carried = (vehicle) => Object.keys(MOUNTS).filter((id) => MOUNTS[id] <= PATROL_VEHICLES[vehicle].carries);

export function PatrolColumn({ patrol, locked }) {
  const game = useGame();
  const column = patrol.column;
  const apply = (next) => {
    const refused = game.commands.setPatrol(patrol.route, next);
    if (refused) game.toast(refused);
    game.bump();
  };
  const live = () => game.sim.getPatrol().column; // read when acting, as the panel may not have redrawn since the last change
  const change = (i, edit) => apply(live().map((e, j) => {
    if (j !== i) return e;
    const next = { ...e, ...edit };
    return carried(next.vehicle).includes(next.system) ? next : { ...next, system: carried(next.vehicle)[0] }; // a smaller vehicle takes a system it can carry
  }));
  if (locked) return <ul className="people-list">{column.map((e, i) => <li key={i}><span>{PATROL_VEHICLES[e.vehicle].name}: {STRUCTURES[e.system].name}, {Math.abs(e.gap)} m {e.gap < 0 ? 'behind' : 'ahead'}</span></li>)}</ul>;
  return (
    <div className="patrol-column">
      <ul className="people-list">
        {column.map((e, i) => (
          <li key={i} data-escort={i}>
            <select aria-label={`Vehicle ${i + 1}`} value={e.vehicle} onChange={(ev) => change(i, { vehicle: ev.target.value })}>
              {Object.entries(PATROL_VEHICLES).map(([id, v]) => <option key={id} value={id}>{v.name}</option>)}
            </select>
            <select aria-label={`What vehicle ${i + 1} carries`} value={e.system} onChange={(ev) => change(i, { system: ev.target.value })}>
              {carried(e.vehicle).map((id) => <option key={id} value={id}>{STRUCTURES[id].name}</option>)}
            </select>
            <NumberInput id={`escort-gap-${i}`} aria-label={`Metres ahead of the soldiers (behind if negative), vehicle ${i + 1}`} value={e.gap} min={-MAX_ESCORT_GAP} max={MAX_ESCORT_GAP} step={5} onCommit={(v) => change(i, { gap: Math.round(v) })} />
            {column.length > 1 && <button aria-label={`Remove vehicle ${i + 1}`} title="Remove this vehicle" onClick={() => apply(live().filter((_, j) => j !== i))}>×</button>}
          </li>
        ))}
      </ul>
      <p className="muted">Gap is metres ahead of the soldiers, or behind if negative. A Mule carries light systems, a Hilux medium ones too, and a Patria anything here.</p>
      {column.length < MAX_ESCORTS && <button id="escort-add" onClick={() => apply([...live(), { vehicle: 'mule', system: 'gun_hmg', gap: -PATROL.foot.escortGap * live().length }])}>Add a vehicle</button>}
    </div>
  );
}
