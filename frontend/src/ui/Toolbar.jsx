// The purchase bar: one row per kind of system. A row opens its list of real systems beside the toolbar, to drag onto the map.

import { BUILD, STRUCTURES, TOOLBAR } from '../sim/config/index.js';
import { money } from '../sim/economy.js';
import { hex, useGame, useTick } from './hooks.js';
import { useAccount } from './account/pack.js';

const cheapest = (group) => Math.min(...group.classes.map((id) => STRUCTURES[id].cost));

function PackRow() {
  const game = useGame(), unit = useAccount()?.activeUnit;
  if (!unit) return null;
  return (
    <button data-catalogue="unit" className={`tool tool-pack${game.catalogue() === 'unit' ? ' active' : ''}`} aria-expanded={game.catalogue() === 'unit'}
      title="Your deployment pack: its kit, ready to drag onto the map" onClick={() => game.openCatalogue('unit')}>
      <div className="n">Deployment pack</div><div className="c" />
      <div className="k">{unit.callsign ? `${unit.callsign} · ` : ''}{unit.name}</div>
    </button>
  );
}

export function Toolbar() {
  useTick();
  const game = useGame();
  const tool = game.getTool(), budget = game.sim.state.budget, open = game.catalogue();
  return (
    <div id="toolbar" className="panel">
      <PackRow />
      {TOOLBAR.map((group) => {
        const picked = group.classes.includes(tool) ? STRUCTURES[tool] : null, from = cheapest(group);
        return (
          <div className="tool-row" key={group.kind} data-kind={group.kind}>
            <button
              data-catalogue={group.kind}
              aria-expanded={open === group.kind}
              className={`tool${open === group.kind ? ' active' : ''}${budget < from && !game.sim.state.packed ? ' poor' : ''}`}
              style={{ borderLeftColor: hex(STRUCTURES[game.toolChoice(group)].color) }}
              title={`${group.name}: click to see the ${group.classes.length} real systems, then drag one onto the map. Key ${group.key}.`}
              onClick={() => game.openCatalogue(group.kind)}
            >
              <div className="n">{group.name}</div><div className="c">{picked ? money(picked.cost) : `from ${money(from)}`}</div>
              <div className="k">[{group.key}] {picked ? picked.product : `${group.classes.length} real systems`}</div>
            </button>
          </div>
        );
      })}
      <button data-tool="people" className={`tool${tool === 'people' ? ' active' : ''}`} title="Place groups of simulated people, to see what an attack would do to them" onClick={() => game.setTool('people')}>
        <div className="n">People</div><div className="c">{game.sim.people.reduce((sum, g) => sum + g.count, 0) || ''}</div><div className="k">[9] simulated</div>
      </button>
      <button id="tool-sell" className={`tool${tool === 'sell' ? ' active' : ''}`} title="Click a structure to sell it for a refund" onClick={() => game.setTool('sell')}>
        <div className="n">Sell</div><div className="c">{Math.round(BUILD.sellRefund * 100)}%</div><div className="k">[X]</div>
      </button>
    </div>
  );
}
