// L-EST97, Estonia's national grid (EPSG:3301): a Lambert conformal conic projection of GRS 80. ETRS89 and WGS 84 differ by far less
// than a laptop's location or a 20 m post, so GPS positions go straight in.

const A = 6378137, F = 1 / 298.257222101, ECC = Math.sqrt(2 * F - F * F), RAD = Math.PI / 180;
const PARALLEL_1 = (59 + 20 / 60) * RAD, PARALLEL_2 = 58 * RAD, ORIGIN_LAT = (57 + 31 / 60 + 3.19415 / 3600) * RAD, ORIGIN_LON = 24 * RAD;
const FALSE_E = 500000, FALSE_N = 6375000;

const flatten = (phi) => ((1 - ECC * Math.sin(phi)) / (1 + ECC * Math.sin(phi))) ** (ECC / 2);
const m = (phi) => Math.cos(phi) / Math.sqrt(1 - (ECC * Math.sin(phi)) ** 2);
const t = (phi) => Math.tan(Math.PI / 4 - phi / 2) / flatten(phi);
const CONE = (Math.log(m(PARALLEL_1)) - Math.log(m(PARALLEL_2))) / (Math.log(t(PARALLEL_1)) - Math.log(t(PARALLEL_2)));
const SCALE = (A * m(PARALLEL_1)) / (CONE * t(PARALLEL_1) ** CONE);
const rho = (phi) => SCALE * t(phi) ** CONE;
const RHO_0 = rho(ORIGIN_LAT);

// Where a site can go: Estonia and a little around it. A build there finds out if there is no data.
export const ESTONIA = { west: 360000, east: 750000, south: 6365000, north: 6640000 };
export const onLest97 = (e, n) => e >= ESTONIA.west && e < ESTONIA.east && n >= ESTONIA.south && n < ESTONIA.north;

export function wgs84ToLest97(lat, lon) {
  const r = rho(lat * RAD), angle = CONE * (lon * RAD - ORIGIN_LON);
  return { e: FALSE_E + r * Math.sin(angle), n: FALSE_N + RHO_0 - r * Math.cos(angle) };
}

export function lest97ToWgs84(e, n) {
  const dx = e - FALSE_E, dy = RHO_0 - (n - FALSE_N);
  const small = (Math.hypot(dx, dy) / SCALE) ** (1 / CONE);
  let phi = Math.PI / 2 - 2 * Math.atan(small);
  for (let i = 0; i < 8; i++) phi = Math.PI / 2 - 2 * Math.atan(small * flatten(phi));
  return { lat: phi / RAD, lon: (Math.atan2(dx, dy) / CONE + ORIGIN_LON) / RAD };
}

// Estonia has no letter squares, so a reference is plain metres, in the same figures a British one would keep.
export function lest97Ref(e, n, figures = 6) {
  if (!onLest97(e, n)) return 'off the grid';
  const step = 10 ** (5 - figures / 2);
  return `E ${Math.floor(e / step) * step} N ${Math.floor(n / step) * step}`;
}
