// A patrol: a group of simulated people walking a looped route, with a sensor vehicle ahead and a weapon vehicle behind. Strike
// drones attack the patrol in place of the station. Nothing here draws a random number, so a patrol walks the same way on every run,
// and a laydown without one runs none of this. See docs/PATROL_MODE.md.

import { COMMS, PATROL, STRUCTURES, WORLD } from './config/index.js';
import { terrainState } from './terrain.js';
import { SITE_POS, hereU, onMap, u } from './units.js';
import { buyTerminal, money } from './economy.js';
import { addStructure, designLocked, removeStructure, wireFusion, wireNode } from './laydown.js';
import { addGroup } from './people.js';

const FOOT = PATROL.foot;
const SAMPLE = 20; // metres between ground checks along each leg
export const MAX_WAYPOINTS = 32; // MAX_ZONE_POINTS in backend/app/schemas.py

const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);

function groundProblem(x, z) {
  const xm = x * WORLD.metresPerUnit, zm = z * WORLD.metresPerUnit, data = terrainState.data;
  if (!onMap(x, z)) return 'The route goes off the map';
  if (data.coverAt(xm, zm) === 4) return 'The route crosses water';
  if (data.slope(xm, zm) > 0.4) return 'The route crosses ground too steep to walk';
  if (data.onBuilding(xm, zm)) return 'The route goes through a building';
  return null;
}

// Distance along the loop to each waypoint, in scene units, ending with the whole loop.
function legEnds(route) {
  const ends = [0];
  route.forEach(([ax, az], i) => { const [bx, bz] = route[(i + 1) % route.length]; ends.push(ends[i] + Math.hypot(bx - ax, bz - az)); });
  return ends;
}

// Why this route can't be walked, or null. It loops from the last waypoint back to the first, and every leg is checked on the ground.
export function routeProblem(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_WAYPOINTS || !points.every(isPoint)) return `A route needs 2 to ${MAX_WAYPOINTS} waypoints`;
  if (!(legEnds(points).at(-1) > 0)) return 'The route has no length';
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil((Math.hypot(bx - ax, bz - az) * WORLD.metresPerUnit) / SAMPLE));
    for (let s = 0; s < steps; s++) {
      const problem = groundProblem(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps);
      if (problem) return problem;
    }
  }
  return null;
}

// Where the route is this far along it (scene units), round and round the loop.
export function along(p, dist) {
  const total = p.ends.at(-1), d = ((dist % total) + total) % total;
  let i = 0;
  while (d > p.ends[i + 1]) i++;
  const [ax, az] = p.route[i], [bx, bz] = p.route[(i + 1) % p.route.length];
  const f = (d - p.ends[i]) / (p.ends[i + 1] - p.ends[i] || 1);
  return { x: ax + (bx - ax) * f, z: az + (bz - az) * f };
}

// The people walk at the patrol's spot, keeping their places in the group, and the escort keeps its gap along the route.
function placeAll(w) {
  const p = w.patrol, g = p.group, at = along(p, p.dist), dx = at.x - g.x, dz = at.z - g.z;
  for (let i = 0; i < g.count; i++) { g.spots[i * 2] += dx; g.spots[i * 2 + 1] += dz; }
  g.x = at.x; g.z = at.z; g.y = hereU(at.x, at.z);
  w.peopleRev++;
  for (const [s, gap] of [[p.sensor, FOOT.escortGap], [p.effector, -FOOT.escortGap]]) {
    const q = along(p, p.dist + u(gap));
    s.pos.set(q.x, hereU(q.x, q.z), q.z);
  }
  w.state.zoneCentre = at; // spotters orbit the patrol, and the fusion node measures threats from it
}

// Both vehicles and their terminals, and a terminal for the fusion node if it has none.
const escortCost = (w) => STRUCTURES[FOOT.sensor].cost + STRUCTURES[FOOT.effector].cost + COMMS.starlink.cost * (w.net.fusion.uplinks.has('starlink') ? 2 : 3);

function startPatrol(w, route) {
  const [x, z] = route[0];
  const vehicle = (id) => {
    const s = addStructure(w, id, x, z);
    s.escort = true;
    w.state.budget -= s.def.cost; w.ledger.capex += s.def.cost;
    wireNode(w, s, 'starlink'); // shortcut: assumes a terminal that works on the move. Model cellular or a mesh radio if escorts need a choice.
    return s;
  };
  const sensor = vehicle(FOOT.sensor), effector = vehicle(FOOT.effector);
  wireFusion(w, 'starlink', true);
  const group = addGroup(w, x, z, Math.max(1, Math.round(FOOT.groupSize)), 'open');
  group.patrol = true;
  w.patrol = { route, ends: legEnds(route), dist: 0, group, sensor, effector, halted: false };
  placeAll(w);
}

// Before the first wave nothing has happened, so the escort is refunded in full. The fusion node keeps its terminal.
export function clearPatrol(w) {
  const p = w.patrol;
  if (!p) return;
  for (const s of [p.sensor, p.effector]) {
    if (!w.structures.includes(s)) continue;
    w.state.budget += s.def.cost; w.ledger.capex -= s.def.cost;
    if (s.uplink) buyTerminal(w, s.uplink, null);
    removeStructure(w, s);
  }
  const at = w.people.indexOf(p.group);
  if (at >= 0) w.people.splice(at, 1);
  w.peopleRev++;
  w.patrol = null;
  w.state.zoneCentre = SITE_POS;
}

// Set, replace or (with null) clear the patrol. Returns why not, or null.
export function setPatrol(w, points) {
  if (designLocked(w)) return 'The patrol is locked once the first wave starts';
  clearPatrol(w);
  if (points == null) return null;
  if (w.state.zone) return 'Clear the area to defend first: with a patrol, the patrol is what the enemy attacks';
  const problem = routeProblem(points);
  if (problem) return problem;
  if (w.state.budget < escortCost(w)) return `Not enough budget for the escort (${money(escortCost(w))} needed, ${money(w.state.budget)} left)`;
  startPatrol(w, points.map(([x, z]) => [x, z]));
  return null;
}

// Once the attack starts the patrol walks on, halting while its weapon is engaging: the crew stop to fire.
export function updatePatrol(w, dt) {
  const p = w.patrol;
  if (!p || !(w.state.wave > 0 || w.state.sandbox)) return;
  p.halted = !!p.effector.task && w.structures.includes(p.effector);
  if (!p.halted) p.dist += u(FOOT.walkSpeed) * dt;
  placeAll(w);
}

// What a strike drone homes on. shortcut: it always knows where the patrol is. Use the last spotter fix once spotters cue strikes.
export const patrolAim = (w) => ({ x: w.patrol.group.x, z: w.patrol.group.z, structure: null, patrol: true });
