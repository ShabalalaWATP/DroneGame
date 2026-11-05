// The map on the start screen, drawn by Leaflet: pan and zoom around Great Britain, and click where to defend. Leaflet stays here,
// as it draws flat tiles in the page. The game's 3D ground has its own map (render/map-texture.js).

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WORLD } from '../sim/config/index.js';
import { wgs84ToBng } from '../sim/bng.js';
import { latLonOf } from '../sim/world-pack.js';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const BRITAIN = [[49.9, -7.6], [58.7, 1.8]];
const CHOICE_KEY = 'site-guard-start-map';
const PICTURE = 1024; // pixels across a pack's offline picture
const NO_LIVE_MAP = 'No live map';
const CLOSE_ENOUGH = 9; // a zoom where the world's square can be seen

// Where a national grid position is, using the fit stored in a pack.
const onMap = (h, e, n) => {
  const { lat, lon } = latLonOf({ e0: h.east, n0: h.north, packEast: h.east, packNorth: h.north, lonFit: h.lonFit, latFit: h.latFit }, e - h.east, n - h.north);
  return [lat, lon];
};
const square = (h, e, n, half) => [onMap(h, e - half, n + half), onMap(h, e + half, n + half), onMap(h, e + half, n - half), onMap(h, e - half, n - half)];

function remembered(storage) { try { return storage?.getItem(CHOICE_KEY); } catch { return null; } }
function remember(storage, name) { try { storage?.setItem(CHOICE_KEY, name); } catch { /* only a convenience */ } }

// One pack's pictures as a single image. shortcut: laid straight on the map, so it sits up to about 1.5 degrees off true in the far east and west of Britain. Fine for choosing a spot, because a click is converted from its real latitude and longitude.
async function packPicture(decoded, layer) {
  const { header } = decoded.pack, west = header.east - header.half, top = header.north + header.half, k = PICTURE / (2 * header.half);
  const paper = document.createElement('canvas');
  paper.width = paper.height = PICTURE;
  const g = paper.getContext('2d');
  if (!g) return null;
  for (const p of decoded.pictures.filter((x) => x.layer === layer)) {
    const w = Math.ceil(p.width * k), h = Math.ceil(p.height * k);
    const bitmap = await createImageBitmap(p.blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' });
    g.drawImage(bitmap, (p.west - west) * k, (top - p.top) * k, w, h);
    bitmap.close();
  }
  return paper.toDataURL('image/jpeg', 0.8);
}

// onPick({ e, n }) hears about a click on the map.
export function createSiteMap(container, { onPick, storage = globalThis.localStorage }) {
  const map = L.map(container, { minZoom: 5, maxZoom: 18 }).fitBounds(BRITAIN);
  const tiles = (className) => L.tileLayer(TILES, {
    className, maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', // OSM's tile policy asks for a referrer, and the page's own policy sends none
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  });
  const bases = { Street: tiles(''), Light: tiles('tile-light'), Dark: tiles('tile-dark'), [NO_LIVE_MAP]: L.layerGroup() };
  const packs = [];
  const offlineLayers = {
    'OS map (offline)': { group: L.layerGroup(), layer: 'osmap' },
    'Satellite (offline)': { group: L.layerGroup(), layer: 'satellite' },
  };

  // Pictures are only made once they are asked for, as they take a moment.
  async function fill(set, decoded) {
    const url = await packPicture(decoded, set.layer);
    if (!url) return;
    const { header } = decoded.pack, corners = square(header, header.east, header.north, header.half);
    set.group.addLayer(L.imageOverlay(url, L.latLngBounds(corners)));
  }
  for (const set of Object.values(offlineLayers)) {
    set.group.on('add', () => {
      if (set.opened) return;
      set.opened = true;
      packs.forEach((decoded) => fill(set, decoded));
    });
  }
  const showOffline = () => { const { group } = offlineLayers['OS map (offline)']; if (!map.hasLayer(group)) group.addTo(map); };

  const chosen = bases[remembered(storage)] ? remembered(storage) : 'Street';
  bases[chosen].addTo(map);
  if (chosen === NO_LIVE_MAP) showOffline();
  for (const layer of Object.values(bases)) if (layer.on) layer.once('tileerror', showOffline); // no internet: the packs still show
  L.control.layers(bases, Object.fromEntries(Object.entries(offlineLayers).map(([name, set]) => [name, set.group])), { collapsed: false }).addTo(map);
  map.on('baselayerchange', ({ name }) => { remember(storage, name); if (name === NO_LIVE_MAP) showOffline(); });
  map.on('click', ({ latlng }) => onPick(wgs84ToBng(latlng.lat, latlng.lng)));

  let world = null, marker = null;
  return {
    map,
    // Show where a map pack can be used.
    addPack(decoded) {
      if (packs.includes(decoded)) return;
      packs.push(decoded);
      const { header } = decoded.pack;
      L.polygon(square(header, header.east, header.north, header.half), { color: '#1f6fd6', weight: 2, dashArray: '6 5', fillOpacity: 0.04, interactive: false }).addTo(map);
      for (const set of Object.values(offlineLayers)) if (set.opened) fill(set, decoded);
    },
    // Mark the start point: { e, n }, with the pack it is in if there is one, then the world it would give.
    show(point, decoded) {
      if (world) { world.remove(); world = null; }
      if (marker) { marker.remove(); marker = null; }
      if (!point) return;
      const header = decoded?.pack.header;
      if (header) {
        const corners = square(header, point.e, point.n, WORLD.radius);
        world = L.polygon(corners, { color: '#e53935', weight: 2, fillOpacity: 0.06, interactive: false }).addTo(map);
        marker = L.circleMarker(onMap(header, point.e, point.n), { radius: 5, color: '#e53935', fillOpacity: 1, interactive: false }).addTo(map);
        if (map.getZoom() < CLOSE_ENOUGH || !map.getBounds().contains(world.getBounds())) map.fitBounds(world.getBounds().pad(0.5));
      } else if (point.lat !== undefined) {
        marker = L.circleMarker([point.lat, point.lon], { radius: 6, color: '#e53935', fillOpacity: 1, interactive: false }).addTo(map);
        map.panTo([point.lat, point.lon]);
      }
    },
    remove() { map.remove(); },
  };
}
