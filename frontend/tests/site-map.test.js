// @vitest-environment jsdom
// The Leaflet map on the start screen: where a click lands, and what is remembered.
import L from 'leaflet';
import { describe, expect, it, vi } from 'vitest';
import { createSiteMap } from '../src/ui/site-map.js';
import { createFakeStorage } from './support/fake-api.js';

const box = () => document.body.appendChild(document.createElement('div'));

describe('the start map', () => {
  it('turns a click into a national grid position', () => {
    const onPick = vi.fn();
    const { map, remove } = createSiteMap(box(), { onPick, storage: createFakeStorage() });
    map.fire('click', { latlng: L.latLng(51.4, -1.7) });
    const point = onPick.mock.calls[0][0];
    expect(Math.abs(point.e - 420900)).toBeLessThan(500);
    expect(Math.abs(point.n - 166800)).toBeLessThan(500);
    remove();
  });
  it('remembers the choice of no live map, and then asks OpenStreetMap for nothing', () => {
    const storage = createFakeStorage();
    const first = createSiteMap(box(), { onPick: vi.fn(), storage });
    first.map.fire('baselayerchange', { name: 'No live map' });
    first.remove();
    const second = createSiteMap(box(), { onPick: vi.fn(), storage });
    const live = [];
    second.map.eachLayer((layer) => { if (layer instanceof L.TileLayer) live.push(layer); });
    expect(live).toHaveLength(0);
    second.remove();
  });
});
