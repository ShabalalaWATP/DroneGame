// The map on a real world's ground. Everything is painted into one canvas, so grid lines and roads always follow the ground,
// and a smaller copy serves the minimap and the Plan tab. Nothing here can reach the rules.

import * as THREE from 'three';
import { wgs84ToBng } from '../sim/bng.js';
import { latLonOf } from '../sim/world-pack.js';

const SIZE = 4096, SMALL = 1024;
export const OSM_URL = 'https://tile.openstreetmap.org', OSM_ZOOM = 14;
const ROADS = [['Motorway', 10, '#4d9de0'], ['Primary', 8, '#3fbf6f'], ['A Road', 7, '#e15554'], ['B Road', 6, '#f0a33a'], ['Minor', 3.5, '#ffffff'], ['Local', 2, '#dddddd'], ['Restricted', 2, '#cccccc']];

const roadStyle = (cls) => ROADS.find(([start]) => cls.startsWith(start));
const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;

// The OSM tiles over a world, and where three of each tile's corners land on the national grid.
export function tilesOver({ north, south, east, west }, zoom = OSM_ZOOM) {
  const scale = 2 ** zoom, col = (lon) => Math.floor(((lon + 180) / 360) * scale);
  const row = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * scale); };
  const tiles = [];
  for (let y = row(north); y <= row(south); y++) {
    for (let x = col(west); x <= col(east); x++) {
      tiles.push({
        x, y, zoom,
        origin: wgs84ToBng(tileLat(y, zoom), tileLon(x, zoom)), right: wgs84ToBng(tileLat(y, zoom), tileLon(x + 1, zoom)), down: wgs84ToBng(tileLat(y + 1, zoom), tileLon(x, zoom)),
      });
    }
  }
  return tiles;
}

export function createMapTexture(renderer, relief) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  const small = document.createElement('canvas');
  small.width = small.height = SMALL;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  // the scene's lights dim a map to about two thirds, so some of it is added back as its own light
  const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 1, metalness: 0 });
  let painting = 0;

  async function paintPictures(pictures, layer, west, top, px) {
    for (const p of pictures) {
      if (p.layer !== layer || p.west >= west + 14000 || p.west + p.width <= west || p.top <= top - 14000 || p.top - p.height >= top) continue;
      const bitmap = await createImageBitmap(p.blob);
      g.drawImage(bitmap, px(p.west - west), px(top - p.top), px(p.width), px(p.height));
      bitmap.close();
    }
  }

  function tileImage(tile) {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.referrerPolicy = 'strict-origin-when-cross-origin'; // OSM's tile policy asks for a referrer, and the page's own policy sends none
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = `${OSM_URL}/${tile.zoom}/${tile.x}/${tile.y}.png`;
    });
  }

  // Each tile is stretched by its own corners, because OSM's squares sit at an angle to the national grid.
  async function paintLive(data, west, top, px) {
    const corner = (x, z) => latLonOf(data.geo, x, -z);
    const a = corner(-data.R, -data.R), b = corner(data.R, data.R), c = corner(data.R, -data.R), d = corner(-data.R, data.R);
    const tiles = tilesOver({ north: Math.max(a.lat, c.lat), south: Math.min(b.lat, d.lat), east: Math.max(b.lon, c.lon), west: Math.min(a.lon, d.lon) });
    const images = await Promise.all(tiles.map(tileImage));
    let failed = 0;
    images.forEach((image, i) => {
      if (!image) { failed++; return; }
      const { origin, right, down } = tiles[i], k = px(1) / 256;
      g.setTransform((right.e - origin.e) * k, (origin.n - right.n) * k, (down.e - origin.e) * k, (origin.n - down.n) * k, px(origin.e - west), px(top - origin.n));
      g.drawImage(image, 0, 0);
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    return { failed, total: tiles.length };
  }

  function paintRoads(features, data, px) {
    const dx = data.geo.e0 - data.geo.packEast, dz = data.geo.packNorth - data.geo.n0, at = (v, d) => px(v - d + data.R);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = 0.85;
    for (const [cls, points] of features.roads || []) {
      const style = roadStyle(String(cls));
      if (!style) continue;
      g.lineWidth = style[1]; g.strokeStyle = style[2];
      g.beginPath();
      points.forEach(([x, z], i) => { if (i) g.lineTo(at(x, dx), at(z, dz)); else g.moveTo(at(x, dx), at(z, dz)); });
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  function paintNames(features, data, px) {
    const dx = data.geo.e0 - data.geo.packEast, dz = data.geo.packNorth - data.geo.n0, at = (v, d) => px(v - d + data.R);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.fillStyle = '#fff';
    for (const [text, kind, height, x, z] of features.names || []) {
      const big = height === 'Large' ? 54 : height === 'Medium' ? 38 : 0;
      if (!big || kind === 'Landform') continue;
      g.font = `600 ${big}px system-ui`; // canvas text, never HTML: names come from the pack file
      g.strokeText(String(text), at(x, dx), at(z, dz)); g.fillText(String(text), at(x, dx), at(z, dz));
    }
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }

  function paintGrid(data, west, top, px) {
    g.font = '600 26px system-ui'; g.textBaseline = 'bottom'; g.lineJoin = 'round';
    for (let e = Math.ceil(west / 1000) * 1000; e <= west + 2 * data.R; e += 1000) {
      g.strokeStyle = 'rgba(30,110,255,0.75)'; g.lineWidth = e % 10000 ? 2 : 4;
      g.beginPath(); g.moveTo(px(e - west), 0); g.lineTo(px(e - west), SIZE); g.stroke();
      const n = Math.ceil((top - 2 * data.R) / 1000) * 1000 + 1000;
      for (let v = n; v < top; v += 5000) label(String(Math.floor(e / 1000) % 100).padStart(2, '0'), px(e - west) + 6, px(top - v));
    }
    for (let n = Math.ceil((top - 2 * data.R) / 1000) * 1000; n <= top; n += 1000) {
      g.strokeStyle = 'rgba(30,110,255,0.75)'; g.lineWidth = n % 10000 ? 2 : 4;
      g.beginPath(); g.moveTo(0, px(top - n)); g.lineTo(SIZE, px(top - n)); g.stroke();
      for (let v = Math.ceil(west / 1000) * 1000 + 1000; v < west + 2 * data.R; v += 5000) label(String(Math.floor(n / 1000) % 100).padStart(2, '0'), px(v - west) + 6, px(top - n) - 2);
    }
    g.textBaseline = 'alphabetic';
  }
  function label(text, x, y) {
    g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.fillStyle = '#0b3ea8';
    g.strokeText(text, x, y); g.fillText(text, x, y);
  }

  // options: { baseMap: 'os' | 'satellite' | 'relief' | 'live', roads, grid }. Resolves with { failed, total } for a live map.
  async function paint(data, source, options) {
    const ticket = ++painting;
    const west = data.geo.e0 - data.R, top = data.geo.n0 + data.R, px = (metres) => (metres / (2 * data.R)) * SIZE;
    const layer = await (async () => {
      g.fillStyle = '#e8e4da'; g.fillRect(0, 0, SIZE, SIZE);
      if (options.baseMap === 'relief') { g.drawImage(relief(data), 0, 0, SIZE, SIZE); return {}; }
      if (options.baseMap === 'live') return paintLive(data, west, top, px);
      await paintPictures(source.pictures, options.baseMap === 'satellite' ? 'satellite' : 'osmap', west, top, px);
      return {};
    })();
    if (ticket !== painting) return layer; // a newer choice took over while this one was loading
    if (options.roads) paintRoads(source.features, data, px);
    if (options.grid) paintGrid(data, west, top, px);
    if (options.roads) paintNames(source.features, data, px);
    texture.needsUpdate = true;
    small.getContext('2d').drawImage(canvas, 0, 0, SMALL, SMALL);
    return layer;
  }

  return { material, small, paint };
}
