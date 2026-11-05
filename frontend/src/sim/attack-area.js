// The area the player is defending, which is what the enemy attacks once one is drawn. Points are [x, z] in scene units.

export function inZone(points, x, z) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// A saved laydown's area comes from outside the game, so anything that is not a usable outline counts as no area.
export const cleanZone = (points) => (Array.isArray(points) && points.length >= 3 && points.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) ? points : null);

export function zoneCentre(points) {
  const sum = points.reduce((total, [x, z]) => ({ x: total.x + x, z: total.z + z }), { x: 0, z: 0 });
  return { x: sum.x / points.length, z: sum.z / points.length };
}

// A random spot inside the area for one drone to aim at. An outline with no area to speak of falls back to its centre.
export function aimInZone(points, rng) {
  const xs = points.map(([x]) => x), zs = points.map(([, z]) => z);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  for (let i = 0; i < 50; i++) {
    const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
    if (inZone(points, x, z)) return { x, z, structure: null };
  }
  return { ...zoneCentre(points), structure: null };
}
