// Which drone types the waves send. The default is the four generic types, which keeps the original waves exactly.
// A wave has a slot for each of the four types (see waves.js). Each slot sends the ticked drones of its type, taking turns, or any
// ticked strike drone if none of its type is ticked. Spotters only come if one is ticked, because they never strike.

import { DRONES, DRONE_CLASSES } from './config/index.js';

export const DEFAULT_MIX = DRONE_CLASSES.map((d) => d.id);
const isSpotter = (id) => DRONES[id].role === 'spotter';
const typeOf = (id) => DRONES[id].variantOf ?? id;

export const hasStrike = (ids) => Array.isArray(ids) && ids.some((id) => Object.hasOwn(DRONES, id) && !isSpotter(id));
export const isDefaultMix = (mix) => mix.length === DEFAULT_MIX.length && mix.every((id, i) => id === DEFAULT_MIX[i]);

// A mix made safe to keep: known types only, once each, in catalogue order, with at least one that strikes. A save is untrusted.
export function cleanMix(ids) {
  if (!hasStrike(ids)) return DEFAULT_MIX;
  const want = new Set(ids);
  return Object.keys(DRONES).filter((id) => want.has(id));
}

// The drones that fill each of the four slots.
export function slotsFor(mix) {
  const of = (type) => mix.filter((id) => typeOf(id) === type);
  const strikes = mix.filter((id) => !isSpotter(id));
  const fill = (type) => (of(type).length ? of(type) : strikes);
  return { fpv: fill('fpv'), fw: fill('fw'), fo: fill('fo'), spotter: of('spotter') };
}
