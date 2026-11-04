import { WAVES } from './config/index.js';

// Returns [{ t, type, bearing, jitter, altFrac, freq }] sorted by spawn time (seconds into the wave).
// `rng` is the wave's own seeded stream (rng.js waveStream), so a wave looks the same however it is reached.
export function makeWave(n, rng) {
  const out = [];
  const groups = Math.min(1 + Math.floor(n / 3), 3);
  const bearings = Array.from({ length: groups }, () => rng() * Math.PI * 2);
  const add = (type, count, start, span) => {
    for (let i = 0; i < count; i++) {
      out.push({
        t: start + (span * i) / Math.max(count, 1), type, bearing: bearings[i % groups],
        jitter: (rng() - 0.5) * 0.3, altFrac: rng(), freq: rng() < 0.5 ? 2.4e9 : 5.8e9,
      });
    }
  };
  // FPV strikes arrive one at a time, each from its own direction, WAVES.fpvGap seconds apart
  for (let i = 0; i < 3 + n * 2; i++) {
    out.push({ t: i * WAVES.fpvGap, type: 'fpv', bearing: rng() * Math.PI * 2, jitter: 0, altFrac: rng(), freq: rng() < 0.5 ? 2.4e9 : 5.8e9 });
  }
  if (n >= 2) add('fw', Math.ceil((n - 1) / 2), 4, 14);
  if (n >= 3) add('fo', Math.floor((n - 1) / 2), 2, 10);
  if (n >= 3) add('spotter', n >= 8 ? 2 : 1, 0, 1);
  return out.sort((a, b) => a.t - b.t);
}
