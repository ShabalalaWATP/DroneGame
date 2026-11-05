// Choosing the world on the start screen. Map packs load as the page opens, so a real map with a start point is ready straight away.
// The start point can be clicked,
// typed as a grid reference, latitude and longitude, or eastings and northings, or taken from this laptop's location.
// With no map pack there, one can be built.

import { useEffect, useRef, useState } from 'react';
import { WORLD } from '../sim/config/index.js';
import { gridRef, onGrid, parsePosition } from '../sim/bng.js';
import { siteProblem, snap, worldId } from '../sim/world-pack.js';
import { useGame } from './hooks.js';
import { createSiteMap } from './site-map.js';
import { view } from '../render/view.js';
import { accuracyText, inBritain, locateMe } from './locate.js';

const covers = (entry, e, n) => Math.abs(e - entry.east) <= entry.half - WORLD.radius && Math.abs(n - entry.north) <= entry.half - WORLD.radius;
const inside = (entry, e, n) => Math.abs(e - entry.east) <= entry.half && Math.abs(n - entry.north) <= entry.half;
const clamp = (v, middle, room) => Math.min(Math.max(v, middle - room), middle + room);
// The Leaflet map on the start screen. Its drawing stays in site-map.js, as the minimap's stays in minimap.js.
function SiteMap({ packs, site, wanted, decoded, onPick }) {
  const box = useRef(null);
  const leaflet = useRef(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    leaflet.current = createSiteMap(box.current, { onPick: (point) => pick.current(point) });
    return () => { leaflet.current.remove(); leaflet.current = null; };
  }, []);
  useEffect(() => { packs.forEach((pack) => leaflet.current.addPack(pack)); }, [packs]);
  useEffect(() => { leaflet.current.show(site || wanted, site ? decoded : null); }, [site, wanted, decoded]);
  return <div id="site-map" ref={box} />;
}

function Builder({ point, onBuilt }) {
  const { api } = useGame();
  const [lidar, setLidar] = useState(true);
  const [status, setStatus] = useState(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!status?.running) return undefined;
    const timer = setInterval(async () => {
      try {
        const now = await api.packs.buildStatus();
        setStatus(now);
        if (!now.running) { clearInterval(timer); if (now.ok) onBuilt(); else setProblem(now.message || 'The map could not be built.'); }
      } catch (e) { setProblem(e.message); clearInterval(timer); }
    }, 2000);
    return () => clearInterval(timer);
  }, [status?.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setProblem('');
    try { setStatus(await api.packs.build({ east: Math.round(point.e), north: Math.round(point.n), lidar })); } catch (e) { setProblem(e.message); }
  };
  return (
    <div id="pack-build" className="sys note">
      <b>No map here yet.</b> Build one around {gridRef(point.e, point.n)}. The first time in an area, this downloads up to about 0.6 GB of OS open data, and requests reveal this region to the Environment Agency and AWS.
      <label className="opt"><input type="checkbox" id="pack-lidar" checked={lidar} onChange={(e) => setLidar(e.target.checked)} /> Include lidar heights: about 10 minutes, England only. Without it, about 2 minutes, with assumed tree and building heights.</label>
      {status?.running
        ? <div id="pack-progress" className="muted">Building... {status.message}</div>
        : <button id="pack-build-go" className="primary" onClick={start}>Build this map</button>}
      {problem && <div id="pack-build-error" className="saved-error">{problem}</div>}
    </div>
  );
}

export function WorldPicker({ wantReal, onWantReal, onWorld }) {
  const game = useGame();
  const [listing, setListing] = useState(null);
  const [entry, setEntry] = useState(null);
  const [decoded, setDecoded] = useState(null);
  const [site, setSite] = useState(null);
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [wanted, setWanted] = useState(null); // a point with no pack yet
  const [ready, setReady] = useState([]); // every pack loaded so far, shown on the map
  const file = useRef(null);
  const latest = useRef(0); // only the newest choice may finish, as a pack can take a moment to load
  const touched = useRef(false); // the player has made a choice of their own

  const refresh = async () => { const found = await game.packs.list(); setListing(found); return found; };
  useEffect(() => { if (wantReal && !listing) refresh(); }, [wantReal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    const sentHere = view.startAt; // from a game, to open a map of a place outside that world
    view.startAt = null;
    (async () => {
      if (sentHere) await goTo(sentHere, sentHere.note);
      const { packs } = await refresh();
      // A real map is ready to go, unless the address says this player was just on generated ground.
      if (live && packs.length && !sentHere && !touched.current && !new URLSearchParams(location.search).has('terrain')) {
        onWantReal(true);
        await choosePack(packs[0], null, false);
      }
      for (const pack of packs) { // the rest load behind the scenes, so moving between them is instant
        try { const loaded = await game.loadPack(pack); if (live) setReady((was) => (was.includes(loaded) ? was : [...was, loaded])); } catch { /* it says why when chosen */ }
      }
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePack = async (chosen, point, byPlayer = true) => {
    if (byPlayer) touched.current = true;
    const ticket = ++latest.current;
    setEntry(chosen); setDecoded(null); setSite(null); onWorld(null); setNote('Loading the map...');
    try {
      const loaded = await game.loadPack(chosen);
      if (ticket !== latest.current) return false;
      setDecoded(loaded);
      setReady((was) => (was.includes(loaded) ? was : [...was, loaded]));
      setNote('');
      setStart(loaded, point || { e: chosen.east, n: chosen.north });
      return true;
    } catch (e) { if (ticket === latest.current) { setNote(e.message); setEntry(null); } return false; }
  };
  function setStart(loaded, { e, n }) {
    const e0 = snap(e), n0 = snap(n), problem = siteProblem(loaded.pack, e0, n0);
    if (problem) { setNote(problem); return; }
    setSite({ e: e0, n: n0 });
    setNote('');
    onWorld(worldId(loaded.pack.hash, e0, n0));
  }
  // Go to a point: into the pack already open if it fits, then any other pack, otherwise offer to build one.
  const goTo = async (point, prefix = '') => {
    touched.current = true;
    const ticket = ++latest.current;
    setWanted(null);
    if (decoded && covers(decoded.pack.header, point.e, point.n)) { setStart(decoded, point); if (prefix) setNote(prefix); return; }
    const all = (listing || await refresh()).packs;
    const match = all.find((p) => covers(p, point.e, point.n));
    if (ticket !== latest.current) return;
    if (match) { if (await choosePack(match, point) && prefix) setNote(prefix); return; }
    setEntry(null); setDecoded(null); setSite(null); onWorld(null);
    setWanted(point);
    setNote(prefix);
  };
  // A click just inside a pack's edge means that pack, moved in far enough to fit the whole world.
  const pickOnMap = (point) => {
    const home = listing?.packs.find((p) => inside(p, point.e, point.n));
    if (home) goTo({ e: clamp(point.e, home.east, home.half - WORLD.radius), n: clamp(point.n, home.north, home.half - WORLD.radius) });
    else goTo(point);
  };
  const useMyLocation = async () => {
    setNote('Finding your location...');
    try {
      const fix = await locateMe();
      if (!inBritain(fix)) { setNote('You appear to be outside Great Britain, which these maps cover.'); return; }
      await goTo(fix, `Your location, ${accuracyText(fix.accuracy)}.`);
    } catch (e) { setNote(e.message); }
  };
  const goTyped = (e) => {
    e.preventDefault();
    const point = parsePosition(typed);
    if (!point) setNote('That is not a position. Use a grid reference (SU 220 660), latitude and longitude (51.39, -1.68), or eastings and northings (422000, 166000).');
    else if (!onGrid(point.e, point.n)) setNote('That is outside Great Britain, which these maps cover.');
    else goTo(point);
  };
  // Saves the chosen map as a file, for someone else to bring in with Import.
  const exportPack = async () => {
    try {
      const url = URL.createObjectURL(await game.packs.fileOf(entry));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${entry.name.replace(/[^\w -]/g, '').trim() || 'map'}.sgmap`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (problem) { setNote(problem.message); }
  };
  const importPack = async (e) => {
    const chosen = e.target.files[0];
    e.target.value = '';
    if (!chosen) return;
    setNote('Checking the map pack...');
    try {
      const added = await game.packs.importFile(chosen);
      await refresh();
      await choosePack(added);
    } catch (problem) { setNote(problem.message); }
  };

  const tier = decoded && site && (decoded.pack.header.lidarHalf >= WORLD.radius + Math.max(Math.abs(site.e - decoded.pack.header.east), Math.abs(site.n - decoded.pack.header.north))
    ? 'Lidar heights across this world.' : 'Part or all of this world uses Terrain 50, with assumed tree and building heights.');

  return (
    <div id="world-picker">
      <div className="row world-choice">
        <label><input type="radio" name="world" id="world-real" checked={wantReal} onChange={() => { touched.current = true; onWantReal(true); }} /> Real map</label>
        <label><input type="radio" name="world" id="world-generated" checked={!wantReal} onClick={() => { touched.current = true; }} onChange={() => onWantReal(false)} /> Generated ground</label>
      </div>
      {wantReal && (
        <div id="world-real-panel">
          {listing?.serverDown && <div className="saved-error">The save server is not running, so only maps imported into this browser are listed.</div>}
          <SiteMap packs={ready} site={site} wanted={wanted} decoded={decoded} onPick={pickOnMap} />
          <div id="site-info" className="muted map-note">
            {site ? <>Start point <b>{gridRef(site.e, site.n, 8)}</b>. Click the map to move it. The red square is your 14 km world. {tier}</> : 'Click the map to choose where to defend.'}
          </div>
          <div className="row">
            <select id="pack-list" value={entry?.hash || ''} onChange={(e) => { const c = listing.packs.find((p) => p.hash === e.target.value); setWanted(null); if (c) choosePack(c); }}>
              <option value="">{listing ? (listing.packs.length ? 'Jump to a map' : 'No maps yet') : 'Looking for maps...'}</option>
              {listing?.packs.map((p) => <option key={p.hash} value={p.hash}>{p.name} ({gridRef(p.east, p.north, 4)})</option>)}
            </select>
            <button id="pack-export" disabled={!entry} title="Save this map as a file to give to someone else. They bring it in with Import, and need no downloads." onClick={exportPack}>Export</button>
            <button id="pack-import" onClick={() => file.current.click()}>Import</button>
            <input type="file" id="pack-file" ref={file} accept=".sgmap" hidden onChange={importPack} />
          </div>
          <div className="row">
            <button id="use-my-location" title="Asks this laptop where it is. It stays in this browser unless you deploy there." onClick={useMyLocation}>Use my location</button>
            <form className="row" onSubmit={goTyped}>
              <input id="site-ref" type="text" spellCheck="false" autoComplete="off" maxLength={60} placeholder="Grid ref, lat/long or E/N" title="For example SU 220 660, or 51.39, -1.68, or 422000 166000" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button type="submit" id="site-ref-go">Go</button>
            </form>
          </div>
          {note && <div id="world-note" className="map-note">{note}</div>}
          {wanted && <Builder point={wanted} onBuilt={async () => { const point = wanted; setWanted(null); await refresh(); await goTo(point); }} />}
        </div>
      )}
    </div>
  );
}
