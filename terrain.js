// Procedural terrain for the simulation: heights, forest canopy, buildings, power lines, and line-of-sight tests.
// No rendering here (see terrain-view.js), so it can run headless. Coordinates are metres in scene axes:
// x is east, z is south (north is -z), y is height above the station base.

import { WORLD, TERRAIN, COMMS } from './config.js';
import { mulberry32, hashSeed } from './rng.js';

// The terrain currently in use. Other modules read it through the helpers below.
export const terrainState = { data: null, hillshade: null };
export const terrain = () => terrainState.data;

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// Seeded 2D value noise, 0..1
function makeNoise(rng) {
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) vals[i] = rng();
  const lat = (ix, iy) => vals[perm[(ix & 255) + perm[iy & 255]]];
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const sx = smooth(x - ix), sy = smooth(y - iy);
    const a = lat(ix, iy), b = lat(ix + 1, iy), c = lat(ix, iy + 1), d = lat(ix + 1, iy + 1);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  }
  function fbm(x, y, octaves = 4) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * noise(x * freq, y * freq); norm += amp; amp *= 0.5; freq *= 2.03; }
    return sum / norm;
  }
  return { noise, fbm };
}

// The power station, in metres from the origin. 'yard' is the switchyard where the power lines start.
export const STATION = [
  { kind: 'box', x: -60, z: 40, w: 120, d: 40, h: 26, name: 'Turbine hall' },
  { kind: 'box', x: 30, z: 40, w: 50, d: 45, h: 48, name: 'Boiler house' },
  { kind: 'cyl', x: 75, z: 60, r: 5, h: 100, name: 'Stack' },
  { kind: 'tower', x: -85, z: -75, r: 32, h: 70, name: 'Cooling tower' },
  { kind: 'tower', x: -20, z: -90, r: 32, h: 70, name: 'Cooling tower' },
  { kind: 'box', x: 20, z: -40, w: 30, d: 20, h: 10, name: 'Control building' },
  { kind: 'box', x: -30, z: 5, w: 40, d: 14, h: 12, name: 'Workshop' },
  { kind: 'box', x: 60, z: 10, w: 16, d: 16, h: 9, name: 'Stores' },
  { kind: 'yard', x: 110, z: -40, w: 70, d: 60, name: 'Switchyard' },
];

export function generateTerrain(seed) {
  const rng = mulberry32(hashSeed(`${seed}:terrain`));
  const nElev = makeNoise(rng), nRidge = makeNoise(rng), nForest = makeNoise(rng), nDetail = makeNoise(rng);
  const nWarp = makeNoise(rng), nRiver = makeNoise(rng);
  const { cell, relief, flatRadius, blendRadius, waterLevel } = TERRAIN;
  const R = WORLD.radius;
  const N = Math.round((2 * R) / cell) + 1; // grid points per side
  const ground = new Float32Array(N * N);
  const canopy = new Uint8Array(N * N); // tree height (m), 0 = none
  const bldg = new Uint8Array(N * N);   // building height (m), 0 = none
  const cover = new Uint8Array(N * N);  // 0 open, 1 forest, 2 built, 3 power-line corridor, 4 water
  const at = (i, j) => j * N + i;
  const wc = (i) => -R + i * cell;

  // Heights: the ground is twisted (domain warping) so ridges wind instead of running in straight lines, mountains are
  // built from ridged noise where a broad "mountain" mask is high, river valleys are cut along a noise contour, and
  // everything is flattened to nothing around the station. Anything below waterLevel becomes flat water.
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = wc(i), z = wc(j), r = Math.hypot(x, z);
      const wx = x + TERRAIN.warp * (nWarp.fbm(x / 2600 + 13, z / 2600 - 7, 3) - 0.5) * 2;
      const wz = z + TERRAIN.warp * (nWarp.fbm(x / 2600 - 21, z / 2600 + 9, 3) - 0.5) * 2;
      const base = nElev.fbm(wx / 4200, wz / 4200, 5);
      const mountain = 0.3 + 0.7 * smooth((base - 0.3) / 0.35);
      let ridge = 0, amp = 1, freq = 1 / 2100, weight = 0, prev = 1;
      for (let o = 0; o < 5; o++) { // ridged multifractal: sharp crests, with finer crests on the coarser ones
        let n = 1 - Math.abs(2 * nRidge.noise(wx * freq + o * 17, wz * freq - o * 9) - 1);
        n = n * n * (0.4 + 0.6 * prev); prev = n;
        ridge += n * amp; weight += amp; amp *= 0.5; freq *= 2.1;
      }
      ridge /= weight;
      let h = relief * (0.22 * smooth(base) + 0.95 * mountain * Math.pow(ridge, 1.15));
      h += 16 * nDetail.fbm(x / 260, z / 260, 3);
      h *= 0.32 + 0.95 * smooth((r - 900) / 4200); // the station sits in a broad valley; the ground climbs into ridges around it
      const rv = Math.abs(nRiver.fbm(wx / 2800 + 40, wz / 2800 - 12, 3) - 0.5);
      const valley = Math.pow(1 - smooth(rv / TERRAIN.riverWidth), 0.6);
      h += (waterLevel - 6 - h) * valley * 0.92; // river channels run down to just below the water surface
      h *= smooth((r - flatRadius) / (blendRadius - flatRadius));
      ground[at(i, j)] = Math.max(h, waterLevel);
    }
  }

  const slopeAt = (i, j) => {
    const i0 = clamp(i - 1, 0, N - 1), i1 = clamp(i + 1, 0, N - 1), j0 = clamp(j - 1, 0, N - 1), j1 = clamp(j + 1, 0, N - 1);
    return Math.hypot(ground[at(i1, j)] - ground[at(i0, j)], ground[at(i, j1)] - ground[at(i, j0)]) / (2 * cell);
  };

  // water: anything at the water level is a river or lake
  for (let k = 0; k < ground.length; k++) if (ground[k] <= waterLevel + 0.01) cover[k] = 4;

  // forest: thick where the forest noise is high, never on steep ground, in water, above the tree line or near the station
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = wc(i), z = wc(j);
      if (Math.hypot(x, z) < TERRAIN.clearRadius || cover[at(i, j)] === 4 || ground[at(i, j)] > relief * TERRAIN.treeLine) continue;
      if (nForest.fbm(x / 900 + 10, z / 900 - 5, 4) > TERRAIN.forestThreshold && slopeAt(i, j) < 0.5) {
        canopy[at(i, j)] = Math.round(TERRAIN.canopyMin + (TERRAIN.canopyMax - TERRAIN.canopyMin) * nDetail.fbm(x / 70, z / 70, 2));
        cover[at(i, j)] = 1;
      }
    }
  }

  // buildings
  const buildings = [];
  function rasterBox(b) {
    const i0 = Math.floor((b.x - b.w / 2 + R) / cell), i1 = Math.ceil((b.x + b.w / 2 + R) / cell);
    const j0 = Math.floor((b.z - b.d / 2 + R) / cell), j1 = Math.ceil((b.z + b.d / 2 + R) / cell);
    for (let j = clamp(j0, 0, N - 1); j <= clamp(j1, 0, N - 1); j++) {
      for (let i = clamp(i0, 0, N - 1); i <= clamp(i1, 0, N - 1); i++) {
        const k = at(i, j);
        bldg[k] = Math.max(bldg[k], Math.min(255, Math.round(b.h)));
        canopy[k] = 0; cover[k] = 2;
      }
    }
  }
  for (const s of STATION) {
    if (s.kind === 'box') rasterBox(s);
    else if (s.kind === 'cyl' || s.kind === 'tower') rasterBox({ x: s.x, z: s.z, w: 2 * s.r, d: 2 * s.r, h: s.h });
  }
  for (let h = 0; h < TERRAIN.hamlets; h++) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = rng() * Math.PI * 2, d = 1800 + rng() * 3200;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const i = Math.round((x + R) / cell), j = Math.round((z + R) / cell);
      if (canopy[at(i, j)] || slopeAt(i, j) > 0.12 || cover[at(i, j)] === 4 || ground[at(i, j)] > relief * 0.3) continue;
      const n = 6 + Math.floor(rng() * 7);
      for (let b = 0; b < n; b++) {
        const bd = { x: x + (rng() - 0.5) * 260, z: z + (rng() - 0.5) * 260, w: 10 + rng() * 8, d: 8 + rng() * 6, h: 5 + rng() * 5 };
        buildings.push(bd);
        rasterBox(bd);
      }
      break;
    }
  }

  // power lines: two lines run out from the switchyard, with a cleared corridor under them
  const yard = STATION.find((s) => s.kind === 'yard');
  const lines = [];
  const baseAng = rng() * Math.PI * 2;
  for (const ang0 of [baseAng, baseAng + Math.PI * (0.7 + rng() * 0.6)]) {
    const pylons = [];
    let x = yard.x, z = yard.z, a = ang0, len = 0;
    const maxLen = 5500 + rng() * 1000;
    while (len < maxLen && Math.hypot(x, z) < R - 300) {
      pylons.push({ x, z });
      a += (rng() - 0.5) * 0.1;
      x += Math.cos(a) * TERRAIN.pylonSpacing; z += Math.sin(a) * TERRAIN.pylonSpacing;
      len += TERRAIN.pylonSpacing;
    }
    lines.push(pylons);
    for (let p = 1; p < pylons.length; p++) {
      const A = pylons[p - 1], B = pylons[p];
      const steps = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / (cell / 2));
      for (let s = 0; s <= steps; s++) {
        const px = A.x + ((B.x - A.x) * s) / steps, pz = A.z + ((B.z - A.z) * s) / steps;
        const ci = Math.round((px + R) / cell), cj = Math.round((pz + R) / cell);
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const k = at(clamp(ci + di, 0, N - 1), clamp(cj + dj, 0, N - 1));
          canopy[k] = 0;
          if (cover[k] !== 2 && cover[k] !== 4) cover[k] = 3;
        }
      }
    }
  }

  // cell towers: a few masts on high ground, spread out around the station, picked from random candidates
  const towers = [];
  const candidates = Array.from({ length: 60 }, () => {
    const a = rng() * Math.PI * 2, d = 3500 + rng() * 3500;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    return { x, z, h: ground[at(clamp(Math.round((x + R) / cell), 0, N - 1), clamp(Math.round((z + R) / cell), 0, N - 1))] };
  }).filter((c) => c.h > waterLevel + 2).sort((a, b) => b.h - a.h);
  for (const c of candidates) {
    if (towers.length >= COMMS.towers) break;
    if (towers.every((t) => Math.hypot(t.x - c.x, t.z - c.z) > 3000)) towers.push({ x: c.x, z: c.z, ground: c.h });
  }

  // Friendly flight logs: the routes the site's own drones normally fly (inspecting the power lines, patrolling the
  // perimeter). The fusion node compares tracks with these; they are what "previous flight logs" means in this game.
  // No random numbers are drawn here, so adding them does not change the terrain.
  const routes = [];
  lines.forEach((pylons, k) => {
    const pts = pylons.filter((p) => Math.hypot(p.x - yard.x, p.z - yard.z) < 3000).map((p) => ({ x: p.x, z: p.z }));
    if (pts.length >= 3) routes.push({ id: `line${k + 1}`, name: `Line inspection ${k + 1}`, pts: [...pts, ...pts.slice(0, -1).reverse()], agl: 60, speed: 11, loop: false });
  });
  routes.push({
    id: 'patrol', name: 'Perimeter patrol', agl: 100, speed: 10, loop: true,
    pts: Array.from({ length: 14 }, (_, i) => ({ x: Math.cos((i / 14) * Math.PI * 2) * 800, z: Math.sin((i / 14) * Math.PI * 2) * 800 })),
  });

  // ---------- queries ----------
  function groundAt(x, z) { // bilinear
    const fx = clamp((x + R) / cell, 0, N - 1.001), fz = clamp((z + R) / cell, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = ground[at(i, j)], b = ground[at(i + 1, j)], c = ground[at(i, j + 1)], d = ground[at(i + 1, j + 1)];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  const cellOf = (x, z) => at(clamp(Math.round((x + R) / cell), 0, N - 1), clamp(Math.round((z + R) / cell), 0, N - 1));

  // Line of sight between two points (metres). Returns { clear, blocker, canopy } where canopy is the metres of the
  // path inside tree canopy. Trees close to the start (a sensor or weapon) are assumed cleared.
  function los(ax, ay, az, bx, by, bz, endClear = TERRAIN.endClear) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const lenH = Math.hypot(dx, dz);
    const n = Math.max(2, Math.ceil(lenH / cell));
    const step = lenH / n;
    let canopyLen = 0;
    for (let s = 1; s < n; s++) {
      const t = s / n;
      const x = ax + dx * t, z = az + dz * t, y = ay + dy * t;
      const g = groundAt(x, z), k = cellOf(x, z);
      if (y < g + bldg[k]) return { clear: false, blocker: bldg[k] ? 'building' : 'terrain', canopy: canopyLen };
      const c = canopy[k];
      if (c && y < g + c && t * lenH > endClear) canopyLen += step;
    }
    return { clear: true, blocker: null, canopy: canopyLen };
  }

  return {
    seed, N, cell, R, ground, canopy, bldg, cover, buildings, lines, towers, routes, station: STATION,
    groundAt, cellOf, los,
    coverAt: (x, z) => cover[cellOf(x, z)],
    // true if there is water at or within r metres of this spot (sampled on a ring): systems cannot be built there
    nearWater: (x, z, r = 60) => {
      for (let k = 0; k < 9; k++) {
        const a = (k / 8) * Math.PI * 2, d = k === 8 ? 0 : r;
        if (cover[cellOf(x + Math.cos(a) * d, z + Math.sin(a) * d)] === 4) return true;
      }
      return false;
    },
    canopyAt: (x, z) => canopy[cellOf(x, z)],
    bldgAt: (x, z) => bldg[cellOf(x, z)],
    slope: (x, z) => {
      const e = cell;
      return Math.hypot(groundAt(x + e, z) - groundAt(x - e, z), groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
    },
  };
}
