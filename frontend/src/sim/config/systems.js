import { WORLD } from './world.js';
import { SENSORS } from './sensors.js';
import { EFFECTORS } from './effectors.js';

// Everything you can buy. The whole run draws on one fixed budget (ECONOMY).
export const STRUCTURES = { ...SENSORS, ...EFFECTORS };
for (const [id, def] of Object.entries(STRUCTURES)) def.id = id;

// The purchase bar: one row per kind of system, with its sizes smallest first. The medium size is the one offered first.
export const TOOLBAR = [
  { kind: 'radar', name: 'Radar', key: '1', classes: ['radar_s', 'radar', 'radar_l'] },
  { kind: 'rf', name: 'RF detector', key: '2', classes: ['rf_s', 'rf', 'rf_l'] },
  { kind: 'camera', name: 'EO/IR camera', key: '3', classes: ['camera_s', 'camera', 'camera_l'] },
  { kind: 'jammer', name: 'RF jammer', key: '4', classes: ['jammer_s', 'jammer', 'jammer_l'] },
  { kind: 'interceptor', name: 'Interceptor drones', key: '5', classes: ['interceptor'] },
  { kind: 'missile', name: 'Missile', key: '6', classes: ['missile'] },
  { kind: 'laser', name: 'Laser', key: '7', classes: ['laser'] },
];
export const firstClass = ({ classes }) => classes[classes.length >> 1];

// game range = published range x WORLD.rangeScale. Call again after changing the scale.
export function applyRangeScale() {
  for (const def of Object.values(STRUCTURES)) def.range = Math.round(def.published * WORLD.rangeScale);
}
applyRangeScale();
