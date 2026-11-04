// Where this laptop is, from the browser. The position stays in this browser unless the player makes it their site.

import { onGrid, wgs84ToBng } from '../sim/bng.js';

const REASONS = {
  1: 'Location is blocked. Allow it for this site in the browser, and turn on location in Windows settings.',
  2: 'This laptop could not work out where it is. Check that location services are on.',
  3: 'Finding your location took too long. Try again, or type a grid reference.',
};
const BLOCKED = 1;

// Resolves with { lat, lon, accuracy (metres), e, n }. Rejects with a message the player can act on.
// Asking for high accuracy can time out on a laptop that a Wi-Fi estimate would have answered, so that is tried before giving up.
export function locateMe(geolocation = globalThis.navigator?.geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('This browser cannot share your location.')); return; }
    const found = ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy, ...wgs84ToBng(coords.latitude, coords.longitude) });
    const failed = (problem) => reject(new Error(REASONS[problem.code] || 'Your location could not be found.'));
    geolocation.getCurrentPosition(
      found,
      (problem) => {
        if (problem.code === BLOCKED) failed(problem);
        else geolocation.getCurrentPosition(found, failed, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

// The national grid only means something around Great Britain.
export const inBritain = ({ e, n }) => onGrid(e, n);

// Most laptops have no GPS chip, and estimate from nearby Wi-Fi, so the player should see how good the fix is.
export const accuracyText = (metres) => (metres > 2000 ? `only good to about ${Math.round(metres / 1000)} km` : `good to about ${Math.round(metres)} m`);
