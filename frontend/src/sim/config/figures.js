import { ADAPT, WORLD, WAVES } from './world.js';
import { COMMS } from './comms.js';
import { STRUCTURES, applyRangeScale } from './systems.js';
import { DRONES } from './drones.js';

// ---------- tuneable research figures ----------
// Every number that came from research (or is a labelled assumption) can be edited in the Sources tab. These helpers
// remember the researched values so each one can be reset, and export/import a set of edits as JSON.
const STRUCT_KEYS = ['published', 'cost', 'shotCost', 'missileSpeed', 'damage', 'splash', 'fuze', 'cooldown', 'magazine', 'storage', 'reloadTime', 'dps', 'falseAlarm', 'lowRange', 'fov', 'dwell', 'slow', 'killTime'];
const DRONE_KEYS = ['cost', 'speed', 'hp', 'rcs', 'size', 'rfPower', 'sound', 'evade', 'jamResist'];

export const FIGURE_FIELDS = {
  published: { label: 'Range', unit: 'm', step: 100, basis: 'research' },
  cost: { label: 'Price', unit: '$', step: 1000, basis: 'price' },
  shotCost: { label: 'Per shot', unit: '$', step: 100, basis: 'price' },
  missileSpeed: { label: 'Speed', unit: 'm/s', step: 10, basis: 'research' },
  damage: { label: 'Damage', unit: 'hp', step: 5, basis: 'rule' },
  splash: { label: 'Blast radius', unit: 'm', step: 5, basis: 'rule' },
  fuze: { label: 'Fuze radius', unit: 'm', step: 5, basis: 'rule' },
  cooldown: { label: 'Between shots', unit: 's', step: 0.5, basis: 'rule' },
  magazine: { label: 'Magazine', unit: 'rounds', step: 1, basis: 'assumption' },
  storage: { label: 'In storage', unit: 'rounds', step: 1, basis: 'assumption' },
  reloadTime: { label: 'Reload', unit: 's', step: 5, basis: 'assumption' },
  dps: { label: 'Beam damage', unit: 'hp/s', step: 2, basis: 'rule' },
  falseAlarm: { label: 'False alarms', unit: 'per scan', step: 0.01, basis: 'rule' },
  lowRange: { label: 'Clutter range', unit: 'm', step: 50, basis: 'rule' },
  fov: { label: 'View', unit: 'deg', step: 1, basis: 'rule' },
  dwell: { label: 'Dwell', unit: 's', step: 0.5, basis: 'rule' },
  slow: { label: 'Slow factor', unit: 'x', step: 0.05, basis: 'rule' },
  killTime: { label: 'Crash after', unit: 's', step: 0.5, basis: 'rule' },
  latency: { label: 'Latency', unit: 's', step: 0.005, basis: 'research' },
  capacity: { label: 'Capacity', unit: 'bit/s', step: 1000000, basis: 'research' },
  loss: { label: 'Packet loss', unit: 'fraction', step: 0.005, basis: 'rule' },
  towerRange: { label: 'Tower range (low band)', unit: 'm', step: 500, basis: 'assumption' },
  speed: { label: 'Speed', unit: 'm/s', step: 1, basis: 'rule' },
  hp: { label: 'Health', unit: 'hp', step: 5, basis: 'rule' },
  rcs: { label: 'Radar cross-section', unit: 'm²', step: 0.01, basis: 'assumption' },
  size: { label: 'Size', unit: 'm', step: 0.05, basis: 'assumption' },
  rfPower: { label: 'RF link power', unit: 'x FPV', step: 0.5, basis: 'assumption' },
  sound: { label: 'Loudness', unit: 'x FPV reach', step: 0.5, basis: 'assumption' },
  evade: { label: 'Evasion', unit: '1=easy', step: 0.05, basis: 'rule' },
  jamResist: { label: 'Jam resistance', unit: '0–1', step: 0.05, basis: 'rule' },
};

const grab = (obj, keys) => Object.fromEntries(keys.filter((k) => typeof obj[k] === 'number').map((k) => [k, obj[k]]));
export const RESEARCHED = {
  structures: Object.fromEntries(Object.entries(STRUCTURES).map(([id, d]) => [id, grab(d, STRUCT_KEYS)])),
  drones: Object.fromEntries(Object.entries(DRONES).map(([id, d]) => [id, grab(d, DRONE_KEYS)])),
  comms: {
    starlink: grab(COMMS.starlink, ['cost', 'latency', 'capacity', 'loss']),
    cellular: grab(COMMS.cellular, ['cost', 'latency', 'capacity', 'loss', 'towerRange']),
  },
  world: { rangeScale: WORLD.rangeScale },
  waves: { fpvGap: WAVES.fpvGap },
  adapt: { evadePerWave: ADAPT.evadePerWave, jamResistPerWave: ADAPT.jamResistPerWave },
};
const STORE = { structures: STRUCTURES, drones: DRONES, comms: COMMS };
const KINDS = ['structures', 'drones', 'comms'];

// Set one figure. kind is 'structures', 'drones' or 'comms'.
export function setFigure(kind, id, key, value) {
  STORE[kind][id][key] = value;
  if (kind === 'structures' && key === 'published') applyRangeScale();
}
export function resetFigure(kind, id, key) {
  setFigure(kind, id, key, RESEARCHED[kind][id][key]);
}
export function resetAllFigures() {
  for (const kind of KINDS) for (const [id, vals] of Object.entries(RESEARCHED[kind])) for (const [k, v] of Object.entries(vals)) setFigure(kind, id, k, v);
  WORLD.rangeScale = RESEARCHED.world.rangeScale; WAVES.fpvGap = RESEARCHED.waves.fpvGap;
  Object.assign(ADAPT, RESEARCHED.adapt);
  applyRangeScale();
}
// Only the figures that differ from the researched values.
export function exportFigures() {
  const out = { structures: {}, drones: {}, comms: {}, world: {}, waves: {}, adapt: {} };
  for (const kind of KINDS) {
    for (const [id, vals] of Object.entries(RESEARCHED[kind])) {
      const src = STORE[kind][id];
      for (const [k, v] of Object.entries(vals)) if (src[k] !== v) (out[kind][id] = out[kind][id] || {})[k] = src[k];
    }
  }
  if (WORLD.rangeScale !== RESEARCHED.world.rangeScale) out.world.rangeScale = WORLD.rangeScale;
  if (WAVES.fpvGap !== RESEARCHED.waves.fpvGap) out.waves.fpvGap = WAVES.fpvGap;
  for (const [k, v] of Object.entries(RESEARCHED.adapt)) if (ADAPT[k] !== v) out.adapt[k] = ADAPT[k];
  return out;
}
export function importFigures(json) {
  for (const kind of KINDS) {
    for (const [id, vals] of Object.entries(json[kind] || {})) {
      // own properties only: the JSON is untrusted, and "constructor" would otherwise reach the Object function
      if (!Object.hasOwn(RESEARCHED[kind], id)) continue;
      for (const [k, v] of Object.entries(vals)) if (Object.hasOwn(RESEARCHED[kind][id], k) && Number.isFinite(v)) setFigure(kind, id, k, v);
    }
  }
  if (json.world && Number.isFinite(json.world.rangeScale)) WORLD.rangeScale = json.world.rangeScale;
  if (json.waves && Number.isFinite(json.waves.fpvGap)) WAVES.fpvGap = json.waves.fpvGap;
  for (const k of Object.keys(RESEARCHED.adapt)) if (json.adapt && Number.isFinite(json.adapt[k])) ADAPT[k] = json.adapt[k];
  applyRangeScale();
}
