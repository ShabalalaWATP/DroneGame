// The deployment pack tray: the kit of the unit deployed from the profile, to drag onto the map. Counts come from the map itself,
// so selling a system puts it back in the tray. They are a guide, not a limit: the toolbar still buys anything.

import { PEOPLE, STRUCTURES, UNIT_VEHICLES } from '../../sim/config/index.js';
import { useGame } from '../hooks.js';
import { PanelHead, SystemCard, dragProps } from '../SystemCard.jsx';
import { remaining, useAccount } from './pack.js';

const LIME = 0xc6ff00;

export function UnitTray({ withWizard }) {
  const game = useGame(), account = useAccount();
  const unit = account?.activeUnit;
  if (!unit) return null;
  const left = remaining(unit.assets, game.sim), tool = game.getTool();
  const systems = left.systems.filter((l) => STRUCTURES[l.id]), people = left.people; // a system a later version drops is skipped
  const locked = game.sim.designLocked();
  return (
    <div id="tool-picker" className={`panel${withWizard ? ' with-wizard' : ''}`} role="region" aria-label={`Deployment pack: ${unit.name}`}>
      <PanelHead title={`${unit.callsign ? `${unit.callsign}: ` : ''}${unit.name}`} color={LIME} onHide={() => game.openCatalogue('unit', false)} />
      <p className="pick-hint">Drag each item onto the map to deploy it. The count shows what is still to place. A system can also be clicked, then placed by clicking the map.</p>
      {systems.length > 0 && <p className="opt-h">Sensors and effectors</p>}
      <div className="pick-list">
        {systems.map((l) => (
          <SystemCard key={l.id} id={l.id} pressed={l.id === tool} onPick={() => game.pickFromTray(l.id)} className={`tray-line${l.left ? '' : ' used'}`}>
            <span className="tray-left">{l.left ? `${l.left} of ${l.count} to place` : `All ${l.count} placed`}</span>
          </SystemCard>
        ))}
      </div>
      {people.length > 0 && <p className="opt-h">People</p>}
      <div className="pick-list">
        {people.map((g, i) => (
          <div key={i} className={`pick-card tray-line${g.left ? '' : ' used'}`} data-tray-people={i} title={PEOPLE[g.protection].desc} {...dragProps(game, { people: { count: g.count, protection: g.protection } }, !locked)}>
            <b>{g.count} people</b><span className="pick-price">{PEOPLE[g.protection].name}</span>
            <span className="tray-left">{g.left ? 'Drag onto the map' : 'Placed'}</span>
          </div>
        ))}
      </div>
      {unit.assets.vehicles.length > 0 && (
        <>
          <p className="opt-h">Vehicles</p>
          <ul className="people-list">
            {unit.assets.vehicles.map((v) => <li key={v.id}><span>{v.count} × {UNIT_VEHICLES[v.id].name}</span></li>)}
          </ul>
          <p className="muted">Vehicles are the unit&apos;s transport. They are listed for planning and are not placed on the map yet.</p>
        </>
      )}
      {!systems.length && !people.length && <p className="muted">This pack is empty. Add kit to it from your profile.</p>}
    </div>
  );
}
