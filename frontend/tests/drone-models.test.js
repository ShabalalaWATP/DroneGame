// Every drone type gets a model of about its real span, with spinning propellers unless it is a jet.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DRONES } from '../src/sim/config/index.js';
import { buildDrone, drawScale } from '../src/render/drone-models.js';

const mat = new THREE.MeshBasicMaterial();
const mats = { body: mat, dark: mat, spin: mat };

describe('drone models', () => {
  it.each(Object.keys(DRONES))('%s builds at about its published span', (type) => {
    const def = DRONES[type];
    const g = buildDrone(def, mats);
    const size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    const across = Math.max(size.x, size.z);
    expect(across).toBeGreaterThan(def.size * 0.9);
    expect(across).toBeLessThan(def.size * 1.8);
    expect(g.children.filter((c) => c.name === 'rotor').length).toBe(type === 'geran3' ? 0 : def.model === 'quad' ? (type === 'agrast30' ? 6 : 4) : 1);
    // cheap enough for a hundred on screen: a few draw calls and under a thousand triangles each
    const meshes = g.children.filter((c) => c.isMesh);
    expect(meshes.length).toBeLessThanOrEqual(8);
    expect(meshes.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0)).toBeLessThan(1000);
  });

  it('draws a bigger drone bigger, but not in proportion', () => {
    const span = (t) => DRONES[t].size * drawScale(DRONES[t]);
    expect(span('wingloong2')).toBeGreaterThan(span('shahed136') * 2);
    expect(span('wingloong2')).toBeLessThan(span('shahed136') * 3);
    expect(span('fpv7inch')).toBeGreaterThan(span('shahed136') * 0.4);
  });
});
