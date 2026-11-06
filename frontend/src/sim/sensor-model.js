// Where a radar looks. A rotating radar covers all round. A fixed-panel radar covers its arc per panel, the panels side by side and
// centred on where it faces, as a compass bearing. Every radar covers a band of elevation from a little below the horizon upwards,
// so a drone close overhead can be above the beam.

const BELOW_HORIZON = 10; // degrees the lowest beam sits below the horizon: an assumption, so a radar on a mast can look down on low flyers

export const coverArc = (def) => Math.min(360, (def.arc ?? 360) * (def.panels ?? 1));
export const elevationBand = (def) => (def.elevation == null ? null : [-BELOW_HORIZON, def.elevation - BELOW_HORIZON]);

// Is a direction, as a compass bearing and an elevation in degrees, inside what this system covers? Only radars are limited here.
export function inCover(def, az, el) {
  if (def.kind !== 'radar') return true;
  const arc = coverArc(def);
  if (arc < 360 && Math.abs(((((az - (def.facing ?? 0)) % 360) + 540) % 360) - 180) > arc / 2) return false;
  const band = elevationBand(def);
  return !band || (el >= band[0] && el <= band[1]);
}

// This system as it would stand at pos, facing as a placed one would. A new object, so the definition it is given is never changed.
export function standingAt(def, centre, pos) {
  const placed = Object.create(def);
  Object.defineProperty(placed, 'facing', { value: def.settings?.facing ?? outwardFrom(centre, pos) }); // defined, as a placed unit's facing is a getter
  return placed;
}

// The compass bearing from the centre of what is defended out to a spot, to the nearest 5°: the way a radar faces unless told otherwise.
export function outwardFrom(centre, pos) {
  const east = pos.x - centre.x, north = centre.z - pos.z;
  if (!east && !north) return 0;
  return (Math.round(((Math.atan2(east, north) * 180) / Math.PI + 360) / 5) * 5) % 360;
}
