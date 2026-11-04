// Keeps the structure honest: the simulation must stay free of rendering and the DOM, and files must stay small.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '../src');
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') || p.endsWith('.jsx') ? [p] : [];
});
const importsOf = (src) => [...src.matchAll(/^import\s+(.+?)\s+from\s+'([^']+)'/gm)].map((m) => ({ names: m[1], from: m[2] }));

describe('simulation boundary', () => {
  for (const file of files(join(SRC, 'sim'))) {
    const name = relative(SRC, file);
    const src = readFileSync(file, 'utf8');
    it(`${name} has no DOM or browser dependency`, () => {
      expect(src).not.toMatch(/\b(document|window|requestAnimationFrame|innerWidth|localStorage)\b/);
    });
    it(`${name} imports only rules, and only Vector3 from three`, () => {
      for (const { names, from } of importsOf(src)) {
        expect(from).not.toMatch(/render|\/ui\/|react/);
        if (from.startsWith('three')) expect(names).toBe('{ Vector3 }');
      }
    });
  }
});

describe('rendering boundary', () => {
  for (const file of files(join(SRC, 'render'))) {
    const name = relative(SRC, file);
    it(`${name} does not depend on the UI`, () => {
      for (const { from } of importsOf(readFileSync(file, 'utf8'))) expect(from).not.toMatch(/\/ui\//);
    });
  }
});

describe('UI safety', () => {
  for (const file of files(join(SRC, 'ui'))) {
    it(`${relative(SRC, file)} never builds HTML from strings`, () => {
      expect(readFileSync(file, 'utf8')).not.toMatch(/innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write/);
    });
  }
});

describe('file size', () => {
  for (const file of files(SRC)) {
    it(`${relative(SRC, file)} is within 350 lines`, () => {
      expect(readFileSync(file, 'utf8').split('\n').length).toBeLessThanOrEqual(351);
    });
  }
});
