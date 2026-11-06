// What a radio detector hears, and the bands a jammer can be fitted for. A drone radiates on the bands of its control and video links
// (SPECTRUM in config/comms.js), and a detector hears it only on a band it covers, and only while none of your own jammers nearby is
// filling that band. A classifier library names the airframe when it knows the family of the drone's link; with none, the detector
// hears energy and nothing more.

import { SPECTRUM, overlaps } from './config/index.js';

// A drone that radiates on a band no source gives, such as a mesh modem, is taken to use the common 2.4 GHz band: an assumption.
const UNKNOWN_BAND = 'control24';
const LINK_BANDS = Object.keys(SPECTRUM.bands).filter((b) => b !== 'gnss'); // drones only receive navigation signals

// Libraries a detector can carry, and the link families each knows (a drone's `protocol`). Every catalogue detector comes with the
// commercial one, as sold. Prices are a share of the detector's own price. All assumptions.
export const LIBRARIES = {
  none: { label: 'None: energy only', name: 'no', knows: null, price: -0.2 },
  commercial: { label: 'Commercial (DJI, Autel)', name: 'commercial', knows: ['commercial'], price: 0 },
  hobby: { label: 'FPV and hobby (ELRS, Crossfire)', name: 'FPV and hobby', knows: ['hobby'], price: 0.15 },
  tactical: { label: 'Tactical (long-range military)', name: 'tactical', knows: ['tactical'], price: 0.25 },
  full: { label: 'Full: all three', name: 'full', knows: ['commercial', 'hobby', 'tactical'], price: 0.4 },
};
export const libraryKnows = (def, droneDef) => !!LIBRARIES[def.library]?.knows?.includes(droneDef.protocol);

export const bandGhz = (id) => (SPECTRUM.bands[id].f[0][0] + SPECTRUM.bands[id].f[0][1]) / 2;

// Every band a jammer can be fitted for. A list of them, as typed or saved, made clean: known bands, once each, in this order, at least one.
export const JAM_BANDS = Object.keys(SPECTRUM.bands);
export function parseBands(value) {
  if (!Array.isArray(value) || !value.length || !value.every((b) => JAM_BANDS.includes(b))) return undefined;
  return JAM_BANDS.filter((b) => value.includes(b));
}

// The bands a drone radiates on.
export function radiates(droneDef) {
  if (!droneDef.rfEmitter) return [];
  const links = droneDef.links || {};
  const bands = [links.control, links.video].filter((b) => LINK_BANDS.includes(b));
  return bands.length ? bands : [UNKNOWN_BAND];
}

// The drone bands this detector covers.
export const covers = (def) => LINK_BANDS.filter((b) => overlaps(SPECTRUM.bands[b].f, def.listens || []));

// The band a detector hears this drone on, or null: the lowest it can, because that carries furthest. deaf: bands it cannot hear now.
export function heardBand(def, droneDef, deaf) {
  let best = null;
  for (const b of radiates(droneDef)) if (!deaf?.has(b) && covers(def).includes(b) && (!best || bandGhz(b) < bandGhz(best))) best = b;
  return best;
}
