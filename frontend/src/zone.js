// The area the player wants to defend. It is a planning aid only: it lives in the view settings and never enters the
// simulation, so it cannot change a run. Points are [x, z] in scene units, like a laydown's systems.

import { WORLD } from './sim/config/index.js';

const LIMIT = 350; // WORLD_LIMIT in backend/app/schemas.py
const MAX_POINTS = 32; // MAX_ZONE_POINTS in backend/app/schemas.py
const NEAR_FIRST = 8, DOUBLE_CLICK = 1.5; // scene units: 160 m and 30 m

const apart = ([ax, az], [bx, bz]) => Math.hypot(ax - bx, az - bz);

// A click while drawing. Clicking near the first point or double-clicking closes the zone. A closed zone starts again.
export function addZonePoint(zone, x, z) {
  if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return zone;
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

export function inZone(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// A saved laydown carries the zone beside its systems. The simulation never reads it.
export const withZone = (spec, zone) => (zone && zone.closed ? { ...spec, zone: zone.points } : spec);
export const zoneFromSpec = (spec) => (spec.zone ? { points: spec.zone, closed: true } : null);
