// Which OpenStreetMap tiles the demo map asks for, and where they land.

import { describe, expect, it } from 'vitest';
import { OSM, tilesFor } from '../src/render/osm-map.js';

describe('OpenStreetMap tiles', () => {
  const tiles = tilesFor(OSM);

  it('finds the known tile for a known place', () => {
    // Greenwich at zoom 14 is the first column east of the prime meridian
    const here = tilesFor({ ...OSM, lat: 51.4779, lon: 0.0001, zoom: 14, halfMetres: 1 });
    expect(here.map((t) => [t.x, t.y])).toEqual([[8192, 5450]]);
  });
  it('covers the whole canvas with no gaps, using a sensible number of tiles', () => {
    expect(tiles.length).toBeGreaterThan(50);
    expect(tiles.length).toBeLessThan(200);
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + t.size))).toBeGreaterThanOrEqual(OSM.canvas);
    expect(Math.max(...tiles.map((t) => t.top + t.size))).toBeGreaterThanOrEqual(OSM.canvas);
  });
  it('places the middle of the area at the middle of the canvas', () => {
    const small = tilesFor({ ...OSM, halfMetres: 1, canvas: 100 });
    for (const t of small) {
      expect(t.left).toBeLessThanOrEqual(50);
      expect(t.left + t.size).toBeGreaterThanOrEqual(50);
    }
  });
});
