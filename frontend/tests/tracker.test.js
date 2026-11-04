import { describe, expect, it } from 'vitest';
import { createTracker, TRACKER } from '../src/sim/tracker.js';

const rad = (d) => (d * Math.PI) / 180;
let seq = 0;
const newTracker = () => createTracker(() => `T${++seq}`);

// a radar at the origin seeing a target at (east, north, up)
function radarAt(east, north, up, t, scan, node = 'radar') {
  const hr = Math.hypot(east, north);
  return { node, from: [0, 0, 0], az: Math.atan2(east, north), el: Math.atan2(up, hr), range: Math.hypot(hr, up), sigAz: rad(0.5), sigEl: rad(1), sigRange: 8, t, scan };
}
// a bearing-only sensor at `from` looking at (east, north)
function bearingAt(from, east, north, t, scan, node) {
  return { node, from, az: Math.atan2(east - from[0], north - from[1]), el: null, range: null, sigAz: rad(1), sigEl: null, sigRange: 0, t, scan };
}

describe('track lifecycle', () => {
  it('confirms after enough hits, coasts when updates stop, then drops', () => {
    const tk = newTracker();
    let tr;
    for (let i = 0; i < TRACKER.confirmHits; i++) {
      tr = tk.ingest(radarAt(1000, 2000, 100, i, i), i);
      expect(tr).not.toBeNull();
      if (i < TRACKER.confirmHits - 1) expect(tr.status).toBe('tentative');
    }
    expect(tr.status).toBe('confirmed');
    expect(tr.justConfirmed).toBe(true);
    expect(tk.tracks.size).toBe(1);
    tk.prune(2 + TRACKER.coastAfter + 0.1);
    expect(tr.status).toBe('coasting');
    expect(tk.prune(2 + TRACKER.confirmedTimeout + 0.1)).toEqual([tr]);
    expect(tk.tracks.size).toBe(0);
  });

  it('drops a tentative track quickly', () => {
    const tk = newTracker();
    tk.ingest(radarAt(1000, 2000, 100, 0, 0), 0);
    expect(tk.prune(TRACKER.tentativeTimeout + 0.1).length).toBe(1);
  });
});

describe('filter', () => {
  it('converges on a moving target and learns its velocity', () => {
    const tk = newTracker();
    let tr;
    for (let i = 0; i < 20; i++) tr = tk.ingest(radarAt(1000 + 30 * i, 2000, 100, i, i), i);
    const e = tk.estimate(tr, 19);
    expect(Math.abs(e.east - (1000 + 30 * 19))).toBeLessThan(40);
    expect(Math.abs(e.north - 2000)).toBeLessThan(40);
    expect(Math.abs(e.vel[0] - 30)).toBeLessThan(8);
  });

  it('keeps separate targets on separate tracks', () => {
    const tk = newTracker();
    for (let i = 0; i < 5; i++) {
      tk.ingest(radarAt(1000, 2000, 100, i, i * 2), i);
      tk.ingest(radarAt(-3000, -2000, 100, i, i * 2 + 1), i);
    }
    expect(tk.tracks.size).toBe(2);
  });

  it('takes only one measurement per sensor scan on a track', () => {
    const tk = newTracker();
    const a = tk.ingest(radarAt(1000, 2000, 100, 0, 7), 0);
    const b = tk.ingest(radarAt(1001, 2001, 100, 0, 7), 0);
    expect(b).not.toBe(a);
  });

  it('extrapolates the estimate and widens its error as time passes', () => {
    const tk = newTracker();
    let tr;
    for (let i = 0; i < 10; i++) tr = tk.ingest(radarAt(1000 + 30 * i, 2000, 100, i, i), i);
    const now = tk.estimate(tr, 9), later = tk.estimate(tr, 11);
    expect(later.east).toBeGreaterThan(now.east);
    expect(later.err).toBeGreaterThan(now.err);
    expect(tk.estimate(tr, 8).err).toBeCloseTo(now.err, 6); // no negative extrapolation
    const dt = 2, err = tk.posError(tr), want = Math.sqrt(err ** 2 + ((TRACKER.accel * dt * dt) / 2) ** 2);
    expect(later.err).toBeCloseTo(want, 6); // both terms are variances
  });
});

describe('bearing-only measurements', () => {
  it('cannot start a track alone, and wait as candidates', () => {
    const tk = newTracker();
    expect(tk.ingest(bearingAt([0, 0, 0], 1000, 2000, 0, 0, 'rf1'), 0)).toBeNull();
    expect(tk.candidates.length).toBe(1);
    expect(tk.prune(TRACKER.candidateLife + 0.1)).toEqual([]);
    expect(tk.candidates.length).toBe(0);
  });

  it('triangulate into a track when two sensors cross', () => {
    const tk = newTracker();
    tk.ingest(bearingAt([0, 0, 0], 1000, 2000, 0, 0, 'rf1'), 0);
    const tr = tk.ingest(bearingAt([3000, 0, 0], 1000, 2000, 0, 0, 'rf2'), 0);
    expect(tr).not.toBeNull();
    expect(Math.hypot(tr.pos[0] - 1000, tr.pos[1] - 2000)).toBeLessThan(120);
  });

  it('give no fix from nearly parallel lines or the same sensor', () => {
    const tk = newTracker();
    tk.ingest(bearingAt([0, 0, 0], 0, 5000, 0, 0, 'rf1'), 0);
    expect(tk.ingest(bearingAt([10, 0, 0], 10, 5000, 0, 0, 'rf2'), 0)).toBeNull();
    const same = newTracker();
    same.ingest(bearingAt([0, 0, 0], 0, 5000, 0, 0, 'rf1'), 0);
    expect(same.ingest(bearingAt([0, 0, 0], 3000, 3000, 0, 1, 'rf1'), 0)).toBeNull();
  });

  it('triangulate in 3D when both sensors give elevation', () => {
    const tk = newTracker();
    const cam = (from, node) => {
      const dx = 1000 - from[0], dy = 2000 - from[1];
      return { node, from, az: Math.atan2(dx, dy), el: Math.atan2(300 - from[2], Math.hypot(dx, dy)), range: null, sigAz: rad(0.5), sigEl: rad(0.5), sigRange: 0, t: 0, scan: 0 };
    };
    tk.ingest(cam([0, 0, 10], 'eo1'), 0);
    const tr = tk.ingest(cam([3000, 0, 10], 'eo2'), 0);
    expect(tr).not.toBeNull();
    expect(Math.abs(tr.pos[2] - 300)).toBeLessThan(60);
  });

  it('update a track that already exists', () => {
    const tk = newTracker();
    let tr;
    for (let i = 0; i < 4; i++) tr = tk.ingest(radarAt(1000, 2000, 100, i, i), i);
    const hits = tr.hits;
    expect(tk.ingest(bearingAt([0, 0, 0], 1000, 2000, 4, 0, 'rf1'), 4)).toBe(tr);
    expect(tr.hits).toBe(hits + 1);
  });

  it('forget everything on clear', () => {
    const tk = newTracker();
    tk.ingest(radarAt(1000, 2000, 100, 0, 0), 0);
    tk.ingest(bearingAt([0, 0, 0], -3000, 100, 0, 0, 'rf1'), 0);
    tk.clear();
    expect(tk.tracks.size).toBe(0);
    expect(tk.candidates.length).toBe(0);
  });
});
