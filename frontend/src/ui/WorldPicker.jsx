// Choosing the world on the start screen: generated ground, or a real map with a start point. The start point can be clicked,
// typed as a grid reference, latitude and longitude, or eastings and northings, or taken from this laptop's location.
// With no map pack there, one can be built.

import { useEffect, useRef, useState } from 'react';
import { WORLD } from '../sim/config/index.js';
import { gridRef, onGrid, parsePosition } from '../sim/bng.js';
import { siteProblem, snap, worldId } from '../sim/world-pack.js';
import { useGame } from './hooks.js';
import { view } from '../render/view.js';
import { accuracyText, inBritain, locateMe } from './locate.js';

const covers = (entry, e, n) => Math.abs(e - entry.east) <= entry.half - WORLD.radius && Math.abs(n - entry.north) <= entry.half - WORLD.radius;
const SIZE = 420;

// Draws the pack's OS map, the world that the start point would give, and the start point.
function SiteMap({ decoded, site, onPick }) {
  const canvas = useRef(null);
  const base = useRef(null);
  const { header } = decoded.pack;
  const west = header.east - header.half, top = header.north + header.half, span = 2 * header.half, k = SIZE / span;

  const draw = () => {
    const g = canvas.current?.getContext('2d');
    if (!g) return;
    g.fillStyle = '#16233a'; g.fillRect(0, 0, SIZE, SIZE);
    if (base.current) g.drawImage(base.current, 0, 0);
    const room = (header.half - WORLD.radius) * k * 2;
    g.setLineDash([5, 4]); g.strokeStyle = '#1f4fa8'; g.lineWidth = 1;
    g.strokeRect((SIZE - room) / 2, (SIZE - room) / 2, room, room); // where a start point can go
    g.setLineDash([]);
    if (site) {
      const x = (site.e - west) * k, y = (top - site.n) * k, r = WORLD.radius * k;
      g.strokeStyle = '#e53935'; g.lineWidth = 2; g.strokeRect(x - r, y - r, 2 * r, 2 * r);
      g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); g.stroke();
    }
  };

  useEffect(() => {
    let live = true;
    const paper = document.createElement('canvas');
    paper.width = paper.height = SIZE;
    const g = paper.getContext('2d');
    (async () => {
      for (const p of decoded.pictures.filter((x) => x.layer === 'osmap')) {
        const w = Math.ceil(p.width * k), h = Math.ceil(p.height * k);
        const bitmap = await createImageBitmap(p.blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
        if (!live) return;
        g?.drawImage(bitmap, (p.west - west) * k, (top - p.top) * k, w, h);
        bitmap.close();
      }
      base.current = paper;
      draw();
    })();
    return () => { live = false; };
  }, [decoded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(draw);

  const click = (e) => {
    const r = canvas.current.getBoundingClientRect();
    onPick(snap(west + ((e.clientX - r.left) / r.width) * span), snap(top - ((e.clientY - r.top) / r.height) * span));
  };
  return <canvas id="site-map" ref={canvas} width={SIZE} height={SIZE} onClick={click} title="Click to set the start point" />;
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
  const file = useRef(null);

  const refresh = async () => { const found = await game.packs.list(); setListing(found); return found; };
  useEffect(() => { if (wantReal && !listing) refresh(); }, [wantReal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // sent here from a game, to open a map of a place outside that world
    if (!view.startAt) return;
    const point = view.startAt;
    view.startAt = null;
    goTo(point, point.note);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choosePack = async (chosen, point) => {
    setEntry(chosen); setDecoded(null); setSite(null); onWorld(null); setNote('Loading the map...');
    try {
      const loaded = await game.loadPack(chosen);
      setDecoded(loaded);
      setNote('');
      setStart(loaded, point || { e: chosen.east, n: chosen.north });
      return true;
    } catch (e) { setNote(e.message); setEntry(null); return false; }
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
    setWanted(null);
    if (decoded && covers(decoded.pack.header, point.e, point.n)) { setStart(decoded, point); if (prefix) setNote(prefix); return; }
    const all = (listing || await refresh()).packs;
    const match = all.find((p) => covers(p, point.e, point.n));
    if (match) { if (await choosePack(match, point) && prefix) setNote(prefix); return; }
    setEntry(null); setDecoded(null); setSite(null); onWorld(null);
    setWanted(point);
    setNote(prefix);
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
        <label><input type="radio" name="world" id="world-generated" checked={!wantReal} onChange={() => onWantReal(false)} /> Generated ground</label>
        <label><input type="radio" name="world" id="world-real" checked={wantReal} onChange={() => onWantReal(true)} /> Real map</label>
      </div>
      {wantReal && (
        <div id="world-real-panel">
          {listing?.serverDown && <div className="saved-error">The save server is not running, so only maps imported into this browser are listed.</div>}
          <div className="row">
            <select id="pack-list" value={entry?.hash || ''} onChange={(e) => { const c = listing.packs.find((p) => p.hash === e.target.value); setWanted(null); if (c) choosePack(c); }}>
              <option value="">{listing ? (listing.packs.length ? 'Choose a map' : 'No maps yet') : 'Looking for maps...'}</option>
              {listing?.packs.map((p) => <option key={p.hash} value={p.hash}>{p.name} ({gridRef(p.east, p.north, 4)})</option>)}
            </select>
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
          {decoded && (
            <>
              <SiteMap decoded={decoded} site={site} onPick={(e, n) => setStart(decoded, { e, n })} />
              <div id="site-info" className="muted map-note">
                {site ? <>Start point <b>{gridRef(site.e, site.n, 8)}</b>. The red square is your 14 km world. {tier}</> : 'Click the map to set the start point.'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
