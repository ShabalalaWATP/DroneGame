// Scene units and ground heights, used by every part of the rules.

import { WORLD } from './config/index.js';
import { terrainState } from './terrain.js';

export const u = (metres) => metres / WORLD.metresPerUnit; // metres -> scene units
export const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const groundM = (xu, zu) => terrainState.data.groundAt(xu * WORLD.metresPerUnit, zu * WORLD.metresPerUnit); // metres
export const hereU = (xu, zu) => groundM(xu, zu) / WORLD.metresPerUnit; // scene units
export const SITE_POS = { x: 0, y: 0, z: 0 };
