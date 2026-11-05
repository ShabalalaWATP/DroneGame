import { WORLD } from './world.js';
import { SENSORS } from './sensors.js';
import { EFFECTORS } from './effectors.js';
import { UK_SYSTEMS } from './uk-systems.js';

// Everything you can buy. The whole run draws on one fixed budget (ECONOMY).
export const STRUCTURES = { ...SENSORS, ...EFFECTORS, ...UK_SYSTEMS };
for (const [id, def] of Object.entries(STRUCTURES)) def.id = id;

// The purchase bar: one row per kind of system, listing its real systems smallest first. The standard medium one is offered first.
export const TOOLBAR = [
  { kind: 'radar', name: 'Radar', key: '1', classes: ['radar_s', 'radar_a400', 'radar_a800', 'radar', 'radar_giraffe', 'radar_l'] },
  { kind: 'rf', name: 'RF detector', key: '2', classes: ['rf_s', 'rf', 'rf_elysion', 'rf_l'] },
  { kind: 'camera', name: 'EO/IR camera', key: '3', classes: ['camera_s', 'camera', 'camera_l'] },
  { kind: 'acoustic', name: 'Acoustic sensor', key: '8', classes: ['acoustic_s', 'acoustic', 'acoustic_l'] },
  { kind: 'jammer', name: 'RF jammer', key: '4', classes: ['jammer_s', 'jammer', 'jammer_auds', 'jammer_l'] },
  { kind: 'interceptor', name: 'Interceptor drones', key: '5', classes: ['interceptor_s', 'interceptor', 'interceptor_p1', 'interceptor_l'] },
  { kind: 'missile', name: 'Missile', key: '6', classes: ['missile_s', 'missile_paladin', 'missile_rr', 'missile_hvm', 'missile', 'missile_l', 'missile_skysabre'] },
  { kind: 'laser', name: 'Laser', key: '7', classes: ['laser_rfdew', 'laser_s', 'laser', 'laser_l'] },
];
export const firstClass = ({ classes }) => classes.find((id) => STRUCTURES[id].size === 'M' && !STRUCTURES[id].variantOf) ?? classes[0];
// The S, M and L buttons on a row: the standard systems, leaving out further real systems of a size.
export const sizeButtons = ({ classes }) => classes.filter((id) => STRUCTURES[id].size && !STRUCTURES[id].variantOf);

// game range = published range x WORLD.rangeScale. Call again after changing the scale.
export function applyRangeScale() {
  for (const def of Object.values(STRUCTURES)) def.range = Math.round(def.published * WORLD.rangeScale);
}
applyRangeScale();
