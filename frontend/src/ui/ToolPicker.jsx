// Opens beside the toolbar while placing: the real systems of this kind, and the settings the next one will be placed with.

import { useEffect, useState } from 'react';
import { STRUCTURES, TOOLBAR } from '../sim/config/index.js';
import { money } from '../sim/economy.js';
import { fieldsFor, settingValue, unitDef } from '../sim/unit-config.js';
import { view } from '../render/view.js';
import { useGame, useTick } from './hooks.js';
import { UnitField } from './UnitEditor.jsx';
import { PeoplePicker } from './PeoplePicker.jsx';

export function ToolPicker() {
  useTick();
  const game = useGame();
  const tool = game.getTool();
  const [hidden, setHidden] = useState(false);
  useEffect(() => { if (!tool) setHidden(false); }, [tool]);
  if (tool === 'people') return hidden || view.wizard === 'open' ? null : <PeoplePicker onHide={() => setHidden(true)} />;
  const group = TOOLBAR.find((g) => g.classes.includes(tool));
  if (!group || hidden || view.wizard === 'open') return null;
  const settings = game.loadoutFor(tool), def = unitDef(tool, settings);
  return (
    <div id="tool-picker" className="panel" role="region" aria-label={`Choose a ${group.name}`}>
      <div className="up-head" style={{ borderLeftColor: `#${STRUCTURES[tool].color.toString(16).padStart(6, '0')}` }}>
        <b>{group.name}: choose a system</b>
        <button id="picker-close" aria-label="Hide this list" title="Hide this list. Keep clicking the map to place." onClick={() => setHidden(true)}>×</button>
      </div>
      <div className="pick-list">
        {group.classes.map((id) => {
          const c = STRUCTURES[id], next = unitDef(id, game.loadoutFor(id));
          return (
            <button key={id} data-pick={id} aria-pressed={id === tool} className={game.sim.state.budget < next.cost ? 'poor' : ''} onClick={() => { if (id !== tool) game.setTool(id); }}>
              <b>{c.product}</b><span className="pick-price">{money(next.cost)}</span>
              <span>{c.size ? `${c.size} · ` : ''}{(next.range / 1000).toFixed(1)} km{c.shotCost ? ` · ${money(c.shotCost)}/shot` : ''}</span>
              <span className="muted">{c.ref.confidence}</span>
            </button>
          );
        })}
      </div>
      <p className="up-desc">{STRUCTURES[tool].desc}</p>
      <div className="up-summary">Next one placed: <b>{(def.range / 1000).toFixed(1)} km</b> range · <b>{money(def.cost)}</b></div>
      {fieldsFor(tool).map((f) => (
        <UnitField
          key={`${tool}-${f.key}`}
          field={f} id={tool} prefix="place" value={settingValue(def, f)} changed={settings[f.key] != null}
          onChange={(v) => { game.setLoadout(tool, f, v); return settingValue(unitDef(tool, game.loadoutFor(tool)), f); }}
        />
      ))}
      <p className="muted">Click the map to place it. Click a placed system to change it, or to rename it.</p>
    </div>
  );
}
