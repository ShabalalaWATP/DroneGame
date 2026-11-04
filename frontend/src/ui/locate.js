// Where this laptop is, from the browser. The position stays in this browser unless the player makes it their site.

import { wgs84ToBng } from '../sim/bng.js';

const REASONS = {
  1: 'Location is blocked. Allow it for this site in the browser, and turn on location in Windows settings.',
  2: 'This laptop could not work out where it is. Check that location services are on.',
  3: 'Finding your location took too long. Try again, or type a grid reference.',
};

// Resolves with { lat, lon, accuracy (metres), e, n }. Rejects with a message the player can act on.
export function locateMe(geolocation = globalThis.navigator?.geolocation) {
  return new Promise((resolve, reject) => {
    if (!geolocation) { reject(new Error('This browser cannot share your location.')); return; }
    geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy, ...wgs84ToBng(coords.latitude, coords.longitude) }),
      (problem) => reject(new Error(REASONS[problem.code] || 'Your location could not be found.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
  });
}

// Most laptops have no GPS chip, and estimate from nearby Wi-Fi, so the player should see how good the fix is.
export const accuracyText = (metres) => (metres > 2000 ? `only good to about ${Math.round(metres / 1000)} km` : `good to about ${Math.round(metres)} m`);
