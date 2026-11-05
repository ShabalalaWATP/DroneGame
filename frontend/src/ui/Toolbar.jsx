// The purchase bar: which system is being placed.

import { BUILD, STRUCTURES, TOOLBAR, firstClass, sizeButtons } from '../sim/config/index.js';
import { money } from '../sim/economy.js';
import { hex, useGame, useTick } from './hooks.js';

export function Toolbar() {
  useTick();
  const game = useGame();
  const tool = game.getTool(), budget = game.sim.state.budget;
  return (
    <div id="toolbar" className="panel">
      {TOOLBAR.map((group) => {
        const def = STRUCTURES[game.toolChoice(group)], sizes = sizeButtons(group), sized = sizes.length > 0;
        return (
          <div className="tool-row" key={group.kind}>
            <button
              data-tool={sized ? undefined : firstClass(group)}
              className={`tool${sized ? ' sized' : ''}${group.classes.includes(tool) ? ' active' : ''}${budget < def.cost ? ' poor' : ''}`}
              style={{ borderLeftColor: hex(def.color) }}
              title={`${def.product}. ${def.desc}\nModelled on: ${def.ref.analogues.join(', ')}\nCost ${money(def.cost)}${def.shotCost ? `, ${money(def.shotCost)} per shot` : ''}${group.classes.length > 1 ? `\nPress ${group.key} again for the next one` : ''}`}
              onClick={() => game.setTool(def.id)}
            >
              <div className="n">{group.name}</div><div className="c">{money(def.cost)}</div>
              {def.shotCost > 0 && <div className="s">{money(def.shotCost)}/shot</div>}
              <div className="k">[{group.key}] {def.product}</div>
            </button>
            {sized && (
              <div className="tool-sizes" role="group" aria-label={`${group.name} size`}>
                {sizes.map((id) => (
                  <button
                    key={id}
                    data-tool={id}
                    className={STRUCTURES[id].size === def.size ? 'chosen' : ''}
                    aria-pressed={STRUCTURES[id].size === def.size}
                    aria-label={`${STRUCTURES[id].name}: ${STRUCTURES[id].product}`}
                    title={`${STRUCTURES[id].product}: ${money(STRUCTURES[id].cost)}, ${(STRUCTURES[id].range / 1000).toFixed(1)} km`}
                    onClick={() => game.setTool(id)}
                  >{STRUCTURES[id].size}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button data-tool="people" className={`tool${tool === 'people' ? ' active' : ''}`} title="Place groups of simulated people, to see what an attack would do to them" onClick={() => game.setTool('people')}>
        <div className="n">People</div><div className="c">{game.sim.people.reduce((sum, g) => sum + g.count, 0) || ''}</div><div className="k">[8] simulated</div>
      </button>
      <button className={`tool${tool === 'sell' ? ' active' : ''}`} title="Click a structure to sell it for a refund" onClick={() => game.setTool('sell')}>
        <div className="n">Sell</div><div className="c">{Math.round(BUILD.sellRefund * 100)}%</div><div className="k">[X]</div>
      </button>
    </div>
  );
}
