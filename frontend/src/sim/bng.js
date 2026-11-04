// British National Grid: grid references, typed positions, and turning a GPS position into easting and northing.

const LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'; // the grid has no I
const EAST_NORTH = /^\s*E?\s*(\d{4,7}(?:\.\d+)?)\s*E?\s*[,\s]\s*N?\s*(\d{4,7}(?:\.\d+)?)\s*N?\s*$/i;
const LAT_LON = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS]?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW]?)\s*$/i;

export const onGrid = (e, n) => e >= 0 && e < 700000 && n >= 0 && n < 1300000;

// A grid reference, eastings then northings in metres, or latitude then longitude in decimal degrees.
// Gives { e, n }, which may be off the grid (check with onGrid), or null if it cannot be read.
export function parsePosition(text) {
  const grid = parseGridRef(text);
  if (grid) return grid;
  const metres = EAST_NORTH.exec(text || '');
  if (metres) return { e: Number(metres[1]), n: Number(metres[2]) };
  const degrees = LAT_LON.exec(text || '');
  if (!degrees) return null;
  const [, lat, ns, lon, ew] = degrees;
  if ((lat.startsWith('-') && ns) || (lon.startsWith('-') && ew)) return null; // "-1.7 W" could mean either side of Greenwich
  const latitude = (/s/i.test(ns) ? -1 : 1) * Number(lat), longitude = (/w/i.test(ew) ? -1 : 1) * Number(lon);
  return Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ? null : wgs84ToBng(latitude, longitude);
}

export function parseGridRef(text) {
  const match = /^\s*([A-HJ-Za-hj-z]{2})\s*(\d*)\s*(\d*)\s*$/.exec(text || '');
  if (!match) return null;
  const [, letters, first, second] = match;
  const digits = first + second;
  if (digits.length % 2 || digits.length > 10 || (second && first.length !== second.length)) return null;
  const a = LETTERS.indexOf(letters[0].toUpperCase()), b = LETTERS.indexOf(letters[1].toUpperCase());
  const east = ((a - 2 + 25) % 5) * 5 + (b % 5), north = 19 - Math.floor(a / 5) * 5 - Math.floor(b / 5);
  if (east > 6 || north < 0 || north > 12) return null;
  const half = digits.length / 2, scale = 10 ** (5 - half);
  return { e: east * 100000 + (half ? Number(digits.slice(0, half)) * scale : 0), n: north * 100000 + (half ? Number(digits.slice(half)) * scale : 0) };
}

export function gridRef(e, n, figures = 6) {
  if (!onGrid(e, n)) return 'off the grid';
  const a = Math.floor((19 - Math.floor(n / 100000)) / 5) * 5 + Math.floor((Math.floor(e / 100000) + 10) / 5);
  const b = ((19 - Math.floor(n / 100000)) * 5) % 25 + Math.floor(e / 100000) % 5;
  const part = (v) => String(Math.floor((v % 100000) / 10 ** (5 - figures / 2))).padStart(figures / 2, '0');
  return `${LETTERS[a]}${LETTERS[b]} ${part(e)} ${part(n)}`;
}

// GPS (WGS 84) to the grid, by the published Helmert shift. Good to about 5 m, which is finer than a laptop's location.
export function wgs84ToBng(latDeg, lonDeg) {
  const rad = Math.PI / 180, lat = latDeg * rad, lon = lonDeg * rad;
  const a84 = 6378137, e84 = 0.00669437999014;
  const nu84 = a84 / Math.sqrt(1 - e84 * Math.sin(lat) ** 2);
  const x = nu84 * Math.cos(lat) * Math.cos(lon), y = nu84 * Math.cos(lat) * Math.sin(lon), z = nu84 * (1 - e84) * Math.sin(lat);
  const s = 1 + 20.4894e-6, sec = rad / 3600, rx = -0.1502 * sec, ry = -0.247 * sec, rz = -0.8421 * sec;
  const X = -446.448 + s * (x - rz * y + ry * z), Y = 125.157 + s * (rz * x + y - rx * z), Z = -542.06 + s * (-ry * x + rx * y + z);

  const a = 6377563.396, b = 6356256.909, e2 = 1 - (b * b) / (a * a), p = Math.hypot(X, Y);
  let phi = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 8; i++) phi = Math.atan2(Z + (e2 * a * Math.sin(phi)) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), p);
  const lambda = Math.atan2(Y, X);

  // Transverse Mercator, on the national grid's own origin
  const f0 = 0.9996012717, phi0 = 49 * rad, lam0 = -2 * rad, n = (a - b) / (a + b), sinP = Math.sin(phi), cosP = Math.cos(phi), tanP = Math.tan(phi);
  const nu = (a * f0) / Math.sqrt(1 - e2 * sinP * sinP), rho = (a * f0 * (1 - e2)) / (1 - e2 * sinP * sinP) ** 1.5, eta2 = nu / rho - 1;
  const dp = phi - phi0, sp = phi + phi0;
  const M = b * f0 * ((1 + n + 1.25 * n * n + 1.25 * n ** 3) * dp - (3 * n + 3 * n * n + 2.625 * n ** 3) * Math.sin(dp) * Math.cos(sp)
    + (1.875 * n * n + 1.875 * n ** 3) * Math.sin(2 * dp) * Math.cos(2 * sp) - (35 / 24) * n ** 3 * Math.sin(3 * dp) * Math.cos(3 * sp));
  const dl = lambda - lam0, t2 = tanP * tanP;
  const northing = M - 100000 + (nu / 2) * sinP * cosP * dl ** 2 + (nu / 24) * sinP * cosP ** 3 * (5 - t2 + 9 * eta2) * dl ** 4 + (nu / 720) * sinP * cosP ** 5 * (61 - 58 * t2 + t2 * t2) * dl ** 6;
  const easting = 400000 + nu * cosP * dl + (nu / 6) * cosP ** 3 * (nu / rho - t2) * dl ** 3 + (nu / 120) * cosP ** 5 * (5 - 18 * t2 + t2 * t2 + 14 * eta2 - 58 * t2 * eta2) * dl ** 5;
  return { e: easting, n: northing };
}
