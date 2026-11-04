// Reference runs and regression checks, driven through the window.game hooks. Load in the page with:
//   const r = await import('/tools/reference-runs.js'); await r.runChecks(window.game); await r.runReferences(window.game)
// Compare runReferences() with reference-digests.json: any difference means behaviour changed.

const MIXED = [['radar', 600, 0], ['rf', 900, 0], ['rf', -900, 0], ['camera', 378, 589], ['camera', -378, -589], ['jammer', 702, 384], ['jammer', -702, -384],
  ['interceptor', 490, 99], ['interceptor', -331, 374], ['interceptor', -158, -474], ['missile', -400, 300]];
const LASERS = [['radar', 400, 0], ['radar_s', 324, 505], ['radar_s', -324, -505], ['laser', 430, 133], ['laser', 7, 450], ['laser', -420, 146], ['laser', -267, -362], ['laser', 250, -374]];
const JAMMERS = [['radar_s', 270, 421], ['radar_s', -500, 0], ['radar_s', 270, -421], ['jammer', 478, 148], ['jammer', 110, 487], ['jammer', -371, 335], ['jammer', -478, -148], ['jammer', -110, -487], ['jammer', 371, -335]];

export const SCENARIOS = [
  { name: 'mixed-seed1', seed: '1', laydown: MIXED, waves: 6 },
  { name: 'mixed-seed7', seed: '7', laydown: MIXED, waves: 6 },
  { name: 'mixed-gnss-seed42', seed: '42', laydown: MIXED, waves: 4, gnss: true },
  { name: 'lasers-seed42', seed: '42', laydown: LASERS, waves: 8 },
  { name: 'jammers-seed1', seed: '1', laydown: JAMMERS, waves: 4 },
];

function setUp(g, { seed, laydown, gnss }) {
  g.state.seed = seed;
  g.resetRun('clear');
  g.state.started = true; g.state.speed = 0; // the frame loop must not step the sim while a script drives it
  for (const [id, xm, zm] of laydown) g.addStructure(id, xm / 20, zm / 20);
  if (gnss) for (const s of g.structures) if (s.jamBands) s.jamBands.add('gnss');
  g.network.autoWire();
}

async function play(g, waves) {
  const s = g.state;
  s.warnedWire = true;
  for (let w = 0; w < waves && !s.over; w++) {
    g.startWave();
    for (let n = 0; s.waveActive && !s.over && n < 60000; n += 200) { g.runHeadless(200); await new Promise((r) => setTimeout(r)); }
  }
}

export async function runReferences(g) {
  const out = {};
  for (const sc of SCENARIOS) {
    setUp(g, sc);
    await play(g, sc.waves);
    out[sc.name] = { digest: g.digest(), wave: g.state.wave, kills: g.state.kills, leaks: g.state.leaks, health: g.state.health, budget: Math.round(g.state.budget) };
  }
  g.state.seed = '1';
  return out;
}

export async function runChecks(g) {
  const fails = [];
  const check = (name, ok, detail) => { if (!ok) fails.push(`${name}: ${JSON.stringify(detail)}`); };

  // a run must not depend on time spent building or on placement order
  const digests = [];
  for (const [idle, laydown] of [[0, MIXED], [1, MIXED], [137, MIXED], [0, [...MIXED].reverse()]]) {
    setUp(g, { seed: '1', laydown });
    g.runHeadless(idle);
    await play(g, 3);
    digests.push(g.digest());
  }
  check('run depends on build time or placement order', new Set(digests).size === 1, digests);

  // a reset must restore systems the enemy destroyed
  setUp(g, { seed: '1', laydown: [['radar', 400, 0], ['laser', 430, 133], ['laser', -420, 146], ['laser', -267, -362]] });
  const placed = g.structures.length;
  await play(g, 30);
  const atEnd = g.structures.length, lost = Object.values(g.ledger.lost).reduce((a, b) => a + b, 0);
  g.resetRun('keep'); g.state.speed = 0;
  check('scenario destroyed nothing, so reset was not exercised', lost > 0, { lost });
  check('reset lost destroyed systems', g.structures.length === placed, { placed, atEnd, afterReset: g.structures.length });

  // a strike drone that drifts away must not hold a wave open for ever
  for (const seed of ['1', '7', '42']) {
    setUp(g, { seed, laydown: [['radar', 600, 0], ['radar_s', 324, 505], ['radar_s', -324, -505], ['jammer', 1176, 238], ['jammer', -1176, -238], ['jammer', 238, 1176], ['jammer', -238, -1176], ['jammer', 900, -800], ['jammer', -900, 800]], gnss: true });
    g.state.sandbox = true;
    for (let i = 0; i < 60; i++) g.spawnDrone('fw', (i / 60) * Math.PI * 2);
    g.runHeadless(20000);
    check(`drifted drone never removed (seed ${seed})`, g.drones.length === 0, { left: g.drones.length });
  }
  g.resetRun('clear'); g.state.speed = 0; g.state.seed = '1';
  return fails;
}
