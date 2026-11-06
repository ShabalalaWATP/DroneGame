// What can be changed on one placed system. This one table drives the panel, the limits, the prices and what loads from a save.
// Every field changes the simulation, and every gain has a cost: price, older data, a louder signature or more false alarms.
// The limits, prices and threshold factors are assumptions: tune them here. Saved values are untrusted, so only keys in this table are read.

import { STRUCTURES } from './config/index.js';
import { BANDS, CLUTTER, arcsText, bandOf, bandRange, bandSharpness, beamGain, lowestEdge, parseArcs } from './sensor-model.js';

const each = (ids, limits) => Object.fromEntries(ids.map((id) => [id, limits]));
const RADARS = ['radar_s', 'radar_a400', 'radar', 'radar_a800', 'radar_giraffe', 'radar_l'], RFS = ['rf_s', 'rf', 'rf_elysion', 'rf_l'], CAMERAS = ['camera_s', 'camera', 'camera_l'], JAMMERS = ['jammer_s', 'jammer', 'jammer_auds', 'jammer_l'], ACOUSTICS = ['acoustic_s', 'acoustic', 'acoustic_l'];
const PANELLED = { radar_s: [1, 3], radar_l: [1, 3], radar_a800: [1, 4], radar_a400: [1, 4] }; // fixed-panel radars: up to all round
const MEDIUM_UP = RADARS.filter((id) => STRUCTURES[id].size !== 'S'); // 2D is offered on Medium and Large radars
const TOP_EDGE = Object.fromEntries(RADARS.filter((id) => STRUCTURES[id].elevation + lowestEdge > 15).map((id) => [id, [15, STRUCTURES[id].elevation + lowestEdge]])); // a narrow beam keeps its top
const FLAT_PRICE = 0.3, MICRO_DOPPLER_PRICE = 0.15; // share of the system's price saved by 2D, and added by a micro-Doppler classifier: assumptions
const choicesOf = (table) => Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.label]));
const MAST_PRICE = 0.015, RELOAD_PRICE = 0.1; // share of the system's price, per metre and per second
const THRESHOLD = { low: { range: 1.1, falseAlarm: 2 }, high: { range: 0.9, falseAlarm: 0.5 } };

export const UNIT_FIELDS = [
  {
    key: 'mount', label: 'Mast height', unit: 'm', step: 1, base: (c) => c.mount, direct: 'mount',
    limits: { radar_s: [5, 25], radar: [5, 35], radar_a800: [5, 35], radar_a400: [5, 35], radar_giraffe: [5, 20], radar_l: [10, 40], rf_s: [2, 10], rf: [2, 15], rf_elysion: [2, 15], rf_l: [2, 20], camera_s: [5, 20], camera: [5, 25], camera_l: [5, 30], ...each(JAMMERS, [2, 20]), acoustic_s: [2, 6], acoustic: [2, 6], acoustic_l: [2, 10] },
    price: (v, c) => (v - c.mount) * MAST_PRICE * c.cost,
    help: 'Higher sees over more trees and terrain, at a price.',
  },
  {
    key: 'power', label: 'Transmit power', unit: '%', step: 5, base: () => 100, limits: { ...each(RADARS, [10, 100]), ...each(JAMMERS, [10, 100]) },
    range: (v, c) => (c.kind === 'radar' ? Math.pow(v / 100, 0.25) : Math.sqrt(v / 100)), signature: (v) => v / 100,
    help: 'Less power means less range, and is quieter to emitter-seeking drones.',
  },
  {
    // The tracker stretches its timeouts by each sensor's update interval (tracker.js), so a slow scan holds its tracks.
    key: 'scan', label: 'Scan period', unit: 's', step: 0.1, base: (c) => c.sapient.interval, limits: each(RADARS, [0.5, 5]),
    range: (v, c) => Math.pow(v / c.sapient.interval, 0.25), sapient: 'interval',
    help: 'Slower reaches further, but its data is older.',
  },
  {
    key: 'panels', label: 'Panels', unit: '', step: 1, base: () => 1, direct: 'panels', limits: PANELLED,
    price: (v, c) => (v - 1) * c.cost,
    help: 'Each panel adds its arc beside the others, at the price of another radar head.',
  },
  {
    // No standard value: left unset, it faces away from what is being defended, wherever that is (laydown.js).
    key: 'facing', label: 'Facing', unit: '°', step: 5, base: () => null, limits: Object.fromEntries(Object.keys(PANELLED).map((id) => [id, [0, 355]])),
    help: 'The compass bearing the middle of its arc points along. Reset, it faces away from what you defend.',
  },
  {
    key: 'dims', label: 'Height', base: (c) => c.dims ?? 'full', direct: 'dims', limits: each(MEDIUM_UP, true), choices: { full: '3D, measures height', flat: '2D, no height' },
    price: (v, c) => (v === 'flat' ? -FLAT_PRICE * c.cost : 0),
    help: '2D is cheaper, but gives no height: cameras must search up and down, and height is a guess.',
  },
  {
    key: 'band', label: 'Band', base: (c) => bandOf(c), limits: each(RADARS, true), choices: choicesOf(BANDS),
    price: (v, c) => (BANDS[v].price / BANDS[bandOf(c)].price - 1) * c.cost, range: (v, c) => bandRange(v, c),
    help: 'A higher band measures angles better and sees small drones a little further, at a higher price.',
  },
  {
    key: 'microDoppler', label: 'Micro-Doppler classifier', base: (c) => c.microDoppler ?? 'no', direct: 'microDoppler', limits: each(RADARS, true), choices: { no: 'No', yes: 'Yes' },
    price: (v, c) => ((v === 'yes') - (c.microDoppler === 'yes')) * MICRO_DOPPLER_PRICE * c.cost,
    help: 'Tells a multirotor from a fixed wing by its moving parts, inside half its reach.',
  },
  {
    key: 'elevLow', label: 'Low edge of the beam', unit: '°', step: 1, base: () => lowestEdge, direct: 'elevLow', limits: each(RADARS, [lowestEdge, 5]),
    falseAlarm: (v) => Math.pow(2, (lowestEdge - v) / 10),
    help: 'Raising it halves ground clutter false alarms for every 10°, but low flyers close in pass under it.',
  },
  {
    key: 'elevTop', label: 'Top edge of the beam', unit: '°', step: 1, base: (c) => c.elevation + lowestEdge, direct: 'elevTop', limits: TOP_EDGE,
    help: 'Lowering it searches less sky, so it reaches further, but leaves a gap overhead.',
  },
  {
    key: 'blank', label: 'Blanking arcs', base: () => null, direct: 'blank', limits: each(RADARS, true), arcs: true, parse: parseArcs, show: arcsText,
    invalid: 'Write up to 3 blanking arcs as compass bearings from-to, such as 40-80, 200-220',
    help: 'Up to 3, as compass bearings clockwise, such as 40-80, 200-220. It has no false alarms there, and sees nothing there.',
  },
  {
    key: 'clutter', label: 'Clutter filter', base: () => 'medium', limits: each(RADARS, true), choices: choicesOf(CLUTTER),
    lowRange: (v) => CLUTTER[v].lowRange, falseAlarm: (v) => CLUTTER[v].falseAlarm,
    help: 'Low sees low flyers further, with more false alarms. High is the reverse, and misses slow and crossing drones.',
  },
  {
    key: 'threshold', label: 'Detection threshold', base: () => 'normal', limits: { ...each(RADARS, true), ...each(RFS, true), ...each(CAMERAS, true), ...each(ACOUSTICS, true) },
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
    key: 'reload', label: 'Time between shots', unit: 's', step: 0.5, base: (c) => c.cooldown, direct: 'cooldown', limits: { interceptor_s: [2, 8], interceptor: [1.5, 6], interceptor_p1: [1.5, 6], interceptor_l: [1.5, 6], missile_rr: [2, 8], missile_hvm: [2, 8], missile_paladin: [0.5, 3], missile_skysabre: [3, 10], missile_s: [1, 4], missile: [2, 8], missile_l: [3, 10] },
    price: (v, c) => (c.cooldown - v) * RELOAD_PRICE * c.cost,
    help: 'Faster launchers cost more.',
  },
  {
    key: 'beam', label: 'Beam damage', unit: 'hp/s', step: 2, base: (c) => c.dps, direct: 'dps', limits: { laser_rfdew: [28, 112], laser_s: [7, 28], laser: [14, 56], laser_l: [28, 112] },
    price: (v, c) => (v / c.dps - 1) * c.cost,
    help: 'A stronger beam burns faster, and its price rises in step.',
  },
];

export const fieldsFor = (id) => UNIT_FIELDS.filter((f) => f.limits[id]);

// A value made safe to use for this field on this system, or undefined if it cannot be used at all.
function cleanValue(field, id, value) {
  if (field.arcs) return field.parse(value);
  if (field.choices) return Object.hasOwn(field.choices, value) ? value : undefined;
  if (!Number.isFinite(value)) return undefined;
  const [min, max] = field.limits[id];
  return Math.min(max, Math.max(min, Number((min + Math.round((value - min) / field.step) * field.step).toFixed(2))));
}

// Only what differs from the catalogue is kept, so a unit with no changes saves and plays exactly as before.
export function setSetting(settings, field, id, value) {
  const clean = value == null ? field.base(STRUCTURES[id]) : cleanValue(field, id, value);
  if (clean === undefined) return false;
  if (clean === field.base(STRUCTURES[id]) || (field.arcs && !clean.length)) delete settings[field.key];
  else settings[field.key] = clean;
  return true;
}

export function cleanSettings(id, saved) {
  const settings = {};
  if (saved && typeof saved === 'object') for (const f of fieldsFor(id)) if (Object.hasOwn(saved, f.key)) setSetting(settings, f, id, saved[f.key]);
  return settings;
}

export const settingValue = (def, field) => def.settings[field.key] ?? field.base(STRUCTURES[def.id]) ?? def[field.key] ?? ''; // a placed radar's facing has no standard value

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
  Object.defineProperty(def, 'range', { get: () => Math.round(scaled('range') * beamGain(def)) });
  for (const prop of ['signature', 'falseAlarm', 'lowRange']) if (fields.some((f) => f[prop])) Object.defineProperty(def, prop, { get: () => scaled(prop) });
  for (const f of fields) {
    if (f.direct) Object.defineProperty(def, f.direct, { get: () => settings[f.key] ?? c[f.direct] });
    if (f.sapient) Object.defineProperty(def.sapient, f.sapient, { get: () => settings[f.key] ?? c.sapient[f.sapient] });
  }
  if (c.kind === 'radar') { // the band sets angle error and what the Spectrum tab shows, and a 2D radar measures no height
    const n = c.sapient.noise, sharp = () => (settings.band ? bandSharpness(settings.band, c) : 1);
    Object.defineProperty(def.sapient.noise, 'az', { get: () => n.az * sharp(), enumerable: true });
    Object.defineProperty(def.sapient.noise, 'el', { get: () => (settings.dims === 'flat' ? undefined : n.el * sharp()), enumerable: true });
    Object.defineProperty(def, 'emits', { get: () => (settings.band ? [{ label: `${BANDS[settings.band].label} radar`, f: BANDS[settings.band].f }] : c.emits) });
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
