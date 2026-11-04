// What can be changed on one placed system. This one table drives the panel, the limits, the prices and what loads from a save.
// Every field changes the simulation, and every gain has a cost: price, older data, a louder signature or more false alarms.
// The limits, prices and threshold factors are assumptions: tune them here. Saved values are untrusted, so only keys in this table are read.

import { STRUCTURES } from './config/index.js';

const each = (ids, limits) => Object.fromEntries(ids.map((id) => [id, limits]));
const RADARS = ['radar_s', 'radar', 'radar_l'], RFS = ['rf_s', 'rf', 'rf_l'], CAMERAS = ['camera_s', 'camera', 'camera_l'], JAMMERS = ['jammer_s', 'jammer', 'jammer_l'];
const MAST_PRICE = 0.015, RELOAD_PRICE = 0.1; // share of the system's price, per metre and per second
const THRESHOLD = { low: { range: 1.1, falseAlarm: 2 }, high: { range: 0.9, falseAlarm: 0.5 } };

export const UNIT_FIELDS = [
  {
    key: 'mount', label: 'Mast height', unit: 'm', step: 1, base: (c) => c.mount, direct: 'mount',
    limits: { radar_s: [5, 25], radar: [5, 35], radar_l: [10, 40], rf_s: [2, 10], rf: [2, 15], rf_l: [2, 20], camera_s: [5, 20], camera: [5, 25], camera_l: [5, 30] },
    price: (v, c) => (v - c.mount) * MAST_PRICE * c.cost,
    help: 'Higher sees over more trees and terrain, at a price.',
  },
  {
    key: 'power', label: 'Transmit power', unit: '%', step: 5, base: () => 100, limits: { ...each(RADARS, [10, 100]), ...each(JAMMERS, [10, 100]) },
    range: (v, c) => (c.kind === 'radar' ? Math.pow(v / 100, 0.25) : Math.sqrt(v / 100)), signature: (v) => v / 100,
    help: 'Less power means less range, and is quieter to emitter-seeking drones.',
  },
  {
    // shortcut: 1.5 s at most, because the tracker's timeouts assume about 1 s. Widen it when stage A4 scales them to the update rate.
    key: 'scan', label: 'Scan period', unit: 's', step: 0.1, base: (c) => c.sapient.interval, limits: each(RADARS, [0.5, 1.5]),
    range: (v, c) => Math.pow(v / c.sapient.interval, 0.25), sapient: 'interval',
    help: 'Slower reaches further, but its data is older.',
  },
  {
    key: 'threshold', label: 'Detection threshold', base: () => 'normal', limits: { ...each(RADARS, true), ...each(RFS, true), ...each(CAMERAS, true) },
    choices: { low: 'Low', normal: 'Normal', high: 'High' },
    range: (v) => THRESHOLD[v]?.range ?? 1, falseAlarm: (v) => THRESHOLD[v]?.falseAlarm ?? 1,
    help: 'Low detects further with more false alarms. High is the reverse.',
  },
  {
    key: 'view', label: 'Field of view', unit: '°', step: 0.5, base: (c) => c.fov, direct: 'fov', limits: { camera: [2.5, 10], camera_l: [0.5, 7.1] },
    range: (v, c) => c.fov / v,
    help: 'Narrower reaches further, but a poor cue can miss the target.',
  },
  {
    key: 'dwell', label: 'Dwell on a cue', unit: 's', step: 0.5, base: (c) => c.dwell, direct: 'dwell', limits: each(CAMERAS, [1, 10]),
    help: 'Longer holds a track for more looks, and leaves other tracks waiting.',
  },
  {
    key: 'reload', label: 'Time between shots', unit: 's', step: 0.5, base: (c) => c.cooldown, direct: 'cooldown', limits: { interceptor: [1.5, 6], missile: [2, 8] },
    price: (v, c) => (c.cooldown - v) * RELOAD_PRICE * c.cost,
    help: 'Faster launchers cost more.',
  },
  {
    key: 'beam', label: 'Beam damage', unit: 'hp/s', step: 2, base: (c) => c.dps, direct: 'dps', limits: { laser: [14, 56] },
    price: (v, c) => (v / c.dps - 1) * c.cost,
    help: 'A stronger beam burns faster, and its price rises in step.',
  },
];

export const fieldsFor = (id) => UNIT_FIELDS.filter((f) => f.limits[id]);

// A value made safe to use for this field on this system, or undefined if it cannot be used at all.
function cleanValue(field, id, value) {
  if (field.choices) return Object.hasOwn(field.choices, value) ? value : undefined;
  if (!Number.isFinite(value)) return undefined;
  const [min, max] = field.limits[id];
  return Math.min(max, Math.max(min, Number((min + Math.round((value - min) / field.step) * field.step).toFixed(2))));
}

// Only what differs from the catalogue is kept, so a unit with no changes saves and plays exactly as before.
export function setSetting(settings, field, id, value) {
  const clean = value == null ? field.base(STRUCTURES[id]) : cleanValue(field, id, value);
  if (clean === undefined) return false;
  if (clean === field.base(STRUCTURES[id])) delete settings[field.key];
  else settings[field.key] = clean;
  return true;
}

export function cleanSettings(id, saved) {
  const settings = {};
  if (saved && typeof saved === 'object') for (const f of fieldsFor(id)) if (Object.hasOwn(saved, f.key)) setSetting(settings, f, id, saved[f.key]);
  return settings;
}

export const settingValue = (def, field) => def.settings[field.key] ?? field.base(STRUCTURES[def.id]);

export function unitCost(id, settings = {}) {
  const c = STRUCTURES[id];
  return Math.round(fieldsFor(id).reduce((sum, f) => (f.price && settings[f.key] != null ? sum + f.price(settings[f.key], c) : sum), c.cost));
}

// A unit's own definition sits over the catalogue's. Its values are worked out when read, so figure edits still reach it and one unit can change alone.
export function unitDef(id, settings = {}) {
  const c = STRUCTURES[id], fields = fieldsFor(id);
  const def = Object.create(c);
  def.settings = settings;
  def.sapient = { ...c.sapient };
  if (c.sapient.noise) def.sapient.noise = { ...c.sapient.noise };
  const scaled = (prop) => fields.reduce((v, f) => (f[prop] && settings[f.key] != null ? v * f[prop](settings[f.key], c) : v), c[prop]);
  Object.defineProperty(def, 'cost', { get: () => unitCost(id, settings) });
  Object.defineProperty(def, 'range', { get: () => Math.round(scaled('range')) });
  for (const prop of ['signature', 'falseAlarm']) if (fields.some((f) => f[prop])) Object.defineProperty(def, prop, { get: () => scaled(prop) });
  for (const f of fields) {
    if (f.direct) Object.defineProperty(def, f.direct, { get: () => settings[f.key] ?? c[f.direct] });
    if (f.sapient) Object.defineProperty(def.sapient, f.sapient, { get: () => settings[f.key] ?? c.sapient[f.sapient] });
  }
  return def;
}

// A name or callsign made safe to keep: printable text, within length. Empty means none.
export const cleanName = (text) => (typeof text === 'string' ? text.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 40) : '');
const CALLSIGN = /^[A-Za-z0-9][A-Za-z0-9 -]{0,11}$/;
export const cleanCallsign = (text) => {
  const t = cleanName(text);
  return CALLSIGN.test(t) ? t : '';
};
