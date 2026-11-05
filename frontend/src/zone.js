// Drawing the area the player wants to defend. The outline being drawn lives in the view settings, and game.js hands a closed one
// to the simulation, where the enemy attacks it. Points are [x, z] in scene units, like a laydown's systems.

import { WORLD } from './sim/config/index.js';
import { onMap } from './sim/units.js';

export { inZone } from './sim/attack-area.js';

const MAX_POINTS = 32; // MAX_ZONE_POINTS in backend/app/schemas.py
const NEAR_FIRST = 8, DOUBLE_CLICK = 1.5; // scene units: 160 m and 30 m

const apart = ([ax, az], [bx, bz]) => Math.hypot(ax - bx, az - bz);

// A click while drawing. Clicking near the first point or double-clicking closes the zone. A closed zone starts again.
export function addZonePoint(zone, x, z) {
  if (!onMap(x, z)) return zone;
  const points = zone && !zone.closed ? zone.points : [], at = [x, z];
  if (points.length >= 3 && (apart(at, points[0]) < NEAR_FIRST || apart(at, points[points.length - 1]) < DOUBLE_CLICK)) return { points, closed: true };
  if (points.length && apart(at, points[points.length - 1]) < DOUBLE_CLICK) return zone;
  const next = [...points, at];
  return { points: next, closed: next.length >= MAX_POINTS };
}

export const closeZone = (zone) => (zone && zone.points.length >= 3 ? { points: zone.points, closed: true } : zone);
export const undoZonePoint = (zone) => (zone && !zone.closed ? { points: zone.points.slice(0, -1), closed: false } : zone);

export function ringZone(metres, n = 24) {
  const r = metres / WORLD.metresPerUnit;
  return { points: Array.from({ length: n }, (_, i) => [r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI)]), closed: true };
}

// A saved laydown carries the zone beside its systems.
export const zoneFromSpec = (spec) => (spec.zone ? { points: spec.zone, closed: true } : null);
