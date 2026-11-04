// What the world looks like, and finding your way around it. None of this reaches the simulation, except placing a system,
// which is the normal command. An option that can't be used stays visible and says why.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { terrainState } from '../sim/terrain.js';
import { STRUCTURES, WORLD } from '../sim/config/index.js';
import { gridRef, parseGridRef } from '../sim/bng.js';
import { view } from '../render/view.js';
import { useGame, useTick } from './hooks.js';
import { accuracyText, locateMe } from './locate.js';

const BASE_MAPS = [['os', 'OS map'], ['satellite', 'Satellite'], ['relief', 'Shaded relief'], ['live', 'Live OpenStreetMap']];
const usable = (id, source) => {
  if (id === 'satellite' && !source?.pictures.some((p) => p.layer === 'satellite')) return 'not in this pack';
  if (id === 'live' && globalThis.navigator?.onLine === false) return 'needs internet';
  return null;
};
export const nextBaseMap = (current) => BASE_MAPS[(BASE_MAPS.findIndex(([id]) => id === current) + 1) % BASE_MAPS.length][0];

function Credits({ geo, source }) {
  const credits = source?.credits || {};
  const parts = [view.baseMap === 'live' ? 'Map © OpenStreetMap contributors' : null, view.baseMap === 'satellite' ? credits.satellite : credits.osmap, geo.tier === 'lidar' ? credits.lidar : null];
  return createPortal(<div id="map-credit" className="muted map-note">{parts.filter(Boolean).join('. ')}. Masts are notional.</div>, document.body); // always on screen, outside the scrolling panel
}

export function MapControls() {
  useTick();
  const game = useGame();
  const geo = terrainState.data?.geo;
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const planToggle = <label title="Look straight down (P)"><input type="checkbox" id="map-plan" checked={view.planView} onChange={(e) => game.setViewOption('planView', e.target.checked)} /> Plan view (P)</label>;
  if (!geo) return <>{planToggle}<div className="muted map-note">Generated ground. Choose a real map on the start screen.</div></>;

  const m = WORLD.metresPerUnit;
  const source = game.mapSource?.(game.sim.state.terrainSeed);
  const toScene = (e, n) => ({ x: (e - geo.e0) / m, z: (geo.n0 - n) / m });
  const inWorld = ({ x, z }) => Math.abs(x) * m <= terrainState.data.R && Math.abs(z) * m <= terrainState.data.R;
  const cursor = game.cursor();
  const here = cursor && inWorld(cursor) ? `${gridRef(geo.e0 + cursor.x * m, geo.n0 - cursor.z * m)}, ${Math.round(geo.H0 + terrainState.data.groundAt(cursor.x * m, cursor.z * m))} m` : '';

  const centreOnMe = async () => {
    setNote('Finding your location...');
    try {
      const fix = await locateMe();
      const at = toScene(fix.e, fix.n);
      if (!inWorld(at)) {
        view.me = null;
        setNote(`You are at ${gridRef(fix.e, fix.n)}, outside this world.`);
        return;
      }
      view.me = at;
      game.getView()?.centreOn(at.x, at.z);
      setNote(`You are at ${gridRef(fix.e, fix.n)}, ${accuracyText(fix.accuracy)}.`);
    } catch (problem) { setNote(problem.message); }
  };
  const placeHere = (e) => {
    e.preventDefault();
    const point = parseGridRef(typed);
    if (!point) { setNote('That is not a grid reference, such as SU 220 660.'); return; }
    const at = toScene(point.e, point.n), tool = game.getTool();
    if (!inWorld(at)) { setNote('That grid reference is outside this world.'); return; }
    if (STRUCTURES[tool]) {
      const problem = game.commands.place(tool, at.x, at.z);
      setNote(problem || `Placed at ${gridRef(point.e, point.n)}.`);
    } else {
      game.getView()?.centreOn(at.x, at.z);
      setNote(`Moved to ${gridRef(point.e, point.n)}. Pick a system first to place one there.`);
    }
  };

  return (
    <details id="map-controls" open>
      <summary>Map</summary>
      <label title="The picture on the ground (M). It never changes the rules."> Map
        <select id="map-base" value={view.baseMap} onChange={(e) => game.setViewOption('baseMap', e.target.value)}>
          {BASE_MAPS.map(([id, label]) => { const why = usable(id, source); return <option key={id} value={id} disabled={!!why}>{label}{why ? ` (${why})` : ''}</option>; })}
        </select>
      </label>
      <label title="With satellite, this is the hybrid view"><input type="checkbox" id="map-roads" checked={view.mapRoads} onChange={(e) => game.setViewOption('mapRoads', e.target.checked)} /> Roads and names</label>
      <label title="Labelled 1 km squares (G). The OS map's own lines stay visible on that map."><input type="checkbox" id="map-grid" checked={view.mapGrid} onChange={(e) => game.setViewOption('mapGrid', e.target.checked)} /> National grid (G)</label>
      {planToggle}
      <div className="row">
        <button id="map-me" title="Uses this laptop's location. It stays in this browser." onClick={centreOnMe}>My location</button>
        <button id="map-site" onClick={() => game.getView()?.centreOn(0, 0)}>The site</button>
      </div>
      <form id="map-goto" className="row" onSubmit={placeHere}>
        <input id="map-ref" type="text" spellCheck="false" maxLength={20} placeholder="Grid ref" title="Move there, or place the selected system there" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button type="submit">Go</button>
      </form>
      <div id="map-here" className="muted map-note">{here || 'Point at the map'}</div>
      {note && <div id="map-message" className="map-note">{note}</div>}
      {view.baseMap === 'live' && <div className="muted map-note">Live tiles tell OpenStreetMap which area you are viewing.</div>}
      {geo.lidarHalf < WORLD.radius && <div className="muted map-note">Terrain 50 ground: tree and building heights are assumed.</div>}
      <Credits geo={geo} source={source} />
    </details>
  );
}
