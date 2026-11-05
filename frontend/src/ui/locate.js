// Where this laptop is, from the browser. The position stays in this browser unless the player makes it their site.

import { onGrid, wgs84ToBng } from '../sim/bng.js';

const REASONS = {
  1: 'Location is blocked. Allow it for this site in the browser, and turn on location in Windows settings.',
  2: 'This laptop could not work out where it is. Check that location services are on.',
  3: 'Finding your location took too long, which a weak connection can cause. Try again, or type a grid reference.',
};
const BLOCKED = 1;

// Resolves with { lat, lon, accuracy (metres), e, n }. Rejects with a message the player can act on.
// A rough answer, which may be the browser's recent one, and a precise one are asked for together, so a poor connection only
// has to manage one of them. The first answer resolves, and onBetter hears about a more accurate one arriving later.
const ROUGH = { enableHighAccuracy: false, timeout: 30000, maximumAge: 600000 };
const PRECISE = { enableHighAccuracy: true, timeout: 30000, maximumAge: 30000 };
export function locateMe(geolocation = globalThis.navigator?.geolocation, onBetter = () => {}) {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('This browser cannot share your location.')); return; }
    let best = null, waiting = 2;
    const found = ({ coords }) => {
      waiting--;
      const fix = { lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy, ...wgs84ToBng(coords.latitude, coords.longitude) };
      if (!best) { best = fix; resolve(fix); } else if (fix.accuracy < best.accuracy) { best = fix; onBetter(fix); }
    };
    const failed = (problem) => {
      waiting--;
      if (!best && (problem.code === BLOCKED || waiting === 0)) reject(new Error(REASONS[problem.code] || 'Your location could not be found.'));
    };
    geolocation.getCurrentPosition(found, failed, ROUGH);
    geolocation.getCurrentPosition(found, failed, PRECISE);
  });
}

// The national grid only means something around Great Britain.
export const inBritain = ({ e, n }) => onGrid(e, n);

// Most laptops have no GPS chip, and estimate from nearby Wi-Fi, so the player should see how good the fix is.
export const accuracyText = (metres) => (metres > 2000 ? `only good to about ${Math.round(metres / 1000)} km` : `good to about ${Math.round(metres)} m`);
