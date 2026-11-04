// The purchase bar: which system is being placed.

import { BUILD, STRUCTURES } from '../sim/config/index.js';
import { money } from '../sim/economy.js';
import { hex, useGame, useTick } from './hooks.js';

export function Toolbar() {
  useTick();
  const game = useGame();
  const tool = game.getTool(), budget = game.sim.state.budget;
  return (
    <div id="toolbar" className="panel">
      {Object.values(STRUCTURES).map((def) => (
        <button
          key={def.id}
          className={`tool${tool === def.id ? ' active' : ''}${budget < def.cost ? ' poor' : ''}`}
          style={{ borderLeftColor: hex(def.color) }}
          title={`${def.desc}\nModelled on: ${def.ref.analogues.join(', ')}\nCost ${money(def.cost)}${def.shotCost ? `, ${money(def.shotCost)} per shot` : ''}`}
          onClick={() => game.setTool(def.id)}
        >
          <div className="n">{def.name}</div><div className="c">{money(def.cost)}</div>
          {def.shotCost > 0 && <div className="s">{money(def.shotCost)}/shot</div>}
          <div className="k">[{def.key}]</div>
        </button>
      ))}
      <button className={`tool${tool === 'sell' ? ' active' : ''}`} title="Click a structure to sell it for a refund" onClick={() => game.setTool('sell')}>
        <div className="n">Sell</div><div className="c">{Math.round(BUILD.sellRefund * 100)}%</div><div className="k">[X]</div>
      </button>
    </div>
  );
}
