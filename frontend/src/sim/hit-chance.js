// How likely a shot is to work, and how fast a beam burns. One place, so that the rolls in play and the odds in the panel cannot disagree.
// A system's `pk` is its chance against an easy, slow target close in, on a good track. Most are assumptions: each `ref` says which.

import { FUSION } from './config/index.js';

const RANGE_LOSS = 0.25;  // share of the chance lost at the weapon's limit, for the longer flight and lower energy: an assumption
// The faster the target against the round, the sharper the turn to lead it. Set so a Sting (0.9, 78 m/s) on a Shahed (51 m/s) gets about 0.7,
// in line with the reported 68% average for interceptor drones.
const LEAD_LOSS = 0.5;
const MIN_LEAD = 0.1;     // a round slower than its target can still meet it head on
const BEAM_FULL = 0.25;   // a beam is at full strength out to this share of its range, because the spot has not yet spread

// Evasion spoils a shot and a beam's dwell alike. 1 is no manoeuvre.
export const evasionFactor = (evade) => 0.5 + 0.5 * evade;

// The chance one round works, given how far it had to fly and how good the track was when it was fired.
export function hitChance(def, target, rangeM, cueErrorM = 0) {
  const lead = target.speed / def.missileSpeed;
  const speed = Math.max(MIN_LEAD, 1 - LEAD_LOSS * lead * lead);
  const far = Math.min(rangeM / def.range, 1);
  const cue = 1 / (1 + (cueErrorM / FUSION.acquireRadius) ** 2); // the seeker has to find it from where the track says it is
  return Math.min(1, (def.pk ?? 1) * evasionFactor(target.evade) * speed * (1 - RANGE_LOSS * far * far) * cue);
}

// Share of a beam's damage rate left at this range. Dwell doubles when the range doubles, as ST Engineering publishes for its CDLE laser:
// 5 s at 0.5 km and 10 s at 1 km. shortcut: no rain or haze, which reduce it further. Add them with weather.
export const beamFactor = (def, rangeM) => Math.min(1, (BEAM_FULL * def.range) / Math.max(rangeM, 1));

// Seconds of beam to destroy this target at this range.
export const burnTime = (def, target, rangeM) => target.hp / (def.dps * evasionFactor(target.evade) * beamFactor(def, rangeM));
