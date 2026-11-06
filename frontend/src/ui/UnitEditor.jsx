// The Configure side of the Unit panel: rename a system, change its fields within their limits, and sell it.

import { useState } from 'react';
import { BUILD, SPECTRUM, STRUCTURES } from '../sim/config/index.js';
import { money } from '../sim/economy.js';
import { fieldsFor, settingValue } from '../sim/unit-config.js';
import { useArmed } from './hooks.js';
import { NumberInput } from './NumberInput.jsx';

// One setting. onChange makes the change and returns the value that resulted, which may differ if it was clamped or refused.
export function UnitField({ field, id, value, changed, onChange, locked, prefix = 'unit' }) {
  const [attempt, setAttempt] = useState(0); // redraws the input when the result differs from what was typed
  const change = (v) => { if (onChange(v) !== v) setAttempt((a) => a + 1); };
  const price = field.price && changed ? Math.round(field.price(value, STRUCTURES[id])) : 0;
  const limits = field.limits[id];
  const inputId = `${prefix}-${field.key}`;
  return (
    <div className="up-field">
      <label htmlFor={inputId}>{field.label}{field.unit ? ` (${field.unit})` : ''}</label>
      {field.choices
        ? (
          <select id={inputId} value={value} disabled={locked} onChange={(e) => change(e.target.value)}>
            {Object.entries(field.choices).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        )
        : field.arcs
          ? (
            <input
              key={`${attempt}-${field.show(value)}`} id={inputId} type="text" maxLength={40} defaultValue={field.show(value)} placeholder="None" disabled={locked}
              onBlur={(e) => { if (e.target.value !== field.show(value)) change(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            />
          )
          : <NumberInput key={attempt} id={inputId} value={value} step={field.step} min={limits[0]} max={limits[1]} disabled={locked} onCommit={change} />}
      <button className="up-reset" aria-label={`Reset ${field.label}`} title="Back to this size's standard value" disabled={locked || !changed} onClick={() => change(null)}>↺</button>
      <span className="muted">
        {field.help}{field.choices || field.arcs ? '' : ` ${limits[0]} to ${limits[1]} ${field.unit}.`}
        {price !== 0 && <b> {price > 0 ? '+' : '-'}{money(Math.abs(price))}</b>}
      </span>
    </div>
  );
}

function Names({ s, game, locked }) {
  const [name, setName] = useState(s.custom?.name ?? '');
  const [callsign, setCallsign] = useState(s.custom?.callsign ?? '');
  const save = () => {
    if (name === (s.custom?.name ?? '') && callsign === (s.custom?.callsign ?? '')) return;
    const problem = game.commands.renameUnit(s, name, callsign);
    if (problem) { game.toast(problem); setCallsign(s.custom?.callsign ?? ''); setName(s.custom?.name ?? ''); }
  };
  const onKey = (e) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  return (
    <>
      <div className="up-field">
        <label htmlFor="unit-name">Name</label>
        <input id="unit-name" type="text" maxLength={40} value={name} placeholder={s.autoName} disabled={locked} onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={onKey} />
      </div>
      <div className="up-field">
        <label htmlFor="unit-callsign">Callsign</label>
        <input id="unit-callsign" type="text" maxLength={12} value={callsign} placeholder={s.autoShort} disabled={locked} onChange={(e) => setCallsign(e.target.value)} onBlur={save} onKeyDown={onKey} />
      </div>
    </>
  );
}

export function UnitEditor({ s, game }) {
  const { sim, commands } = game;
  const locked = sim.designLocked();
  const sell = useArmed();
  const def = s.def, refund = Math.round(def.cost * BUILD.sellRefund);
  return (
    <div id="unit-editor">
      <div className="up-summary">
        <b>{(def.range / 1000).toFixed(1)} km</b> range · <b>{money(def.cost)}</b> this unit
        {def.cost !== STRUCTURES[def.id].cost && <span className="muted"> (standard {money(STRUCTURES[def.id].cost)})</span>}
      </div>
      {locked && <p className="muted">Locked once the first wave starts, so runs stay comparable.{s.jamBands ? ' Jamming bands can still change.' : ''}</p>}
      <Names s={s} game={game} locked={locked} />
      {fieldsFor(def.id).map((f) => (
        <UnitField
          key={f.key}
          field={f} id={def.id} value={settingValue(def, f)} changed={def.settings[f.key] != null} locked={locked}
          onChange={(v) => {
            const problem = commands.configureUnit(s, f.key, v);
            if (problem) game.toast(problem);
            return settingValue(s.def, f);
          }}
        />
      ))}
      {s.jamBands && (
        <fieldset className="up-bands">
          <legend>Jamming bands</legend>
          {Object.entries(SPECTRUM.bands).map(([id, b]) => (
            <label key={id}><input type="checkbox" checked={s.jamBands.has(id)} onChange={(e) => commands.toggleJamBand(s, id, e.target.checked)} /> {b.label}</label>
          ))}
        </fieldset>
      )}
      {!locked && <button id="unit-sell" onClick={sell.confirm('sell', () => commands.sell(s.pos.x, s.pos.z))}>{sell.armed ? 'Sure? Click again' : `Sell for ${money(refund)}`}</button>}
    </div>
  );
}
