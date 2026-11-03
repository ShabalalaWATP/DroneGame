// Tunable game data. Distances are in metres, speeds in m/s, times in seconds.
//
// Each purchasable system is modelled on a real class of C-UAS equipment (see `ref`). Its game range is
// `published` (a figure taken from public sources, listed per system) multiplied by WORLD.rangeScale.
// Figures marked "assumption" had no verified public number. Vendor figures are marketing claims, not
// independent test results. Edit freely, or use the in-game Tuning panel.

export const WORLD = {
  metresPerUnit: 20,     // 3D scene scale: 1 scene unit = this many metres
  radius: 7000,          // size of the ground disc
  spawnDist: 6000,       // drones appear this far from the site
  timeScale: 5,          // game seconds per real second at 1x (distances are real-scale, so time is compressed)
  droneVisualScale: 4,   // drones are drawn this much larger than "true" size so you can see them
  rangeScale: 1,         // game range = published range x this. 1 = published figures.
};

// Simulated geodetic origin used to turn scene positions into the lat/lon that SAPIENT messages carry.
// Deliberately fictional (0,0). North is -z in the scene, east is +x.
export const GEO = { originLat: 0, originLon: 0 };

export const SITE = {
  radius: 100,           // a drone that gets this close hits the site
  targetAlt: 20,         // drones aim at this height (m)
  maxHealth: 100,
};

export const BUILD = { minDist: 150, maxDist: 2500, spacing: 60, sellRefund: 0.7 };

export const START_CREDITS = 600;

// SAPIENT fusion / C2 behaviour (seconds of simulated time, metres)
export const FUSION = {
  statusInterval: 5,     // StatusReport period for every node
  taskInterval: 1,       // how often the fusion node re-evaluates tasking
  fusedInterval: 1,      // fused DetectionReport period to the C2 GUI
  trackTimeout: 3,       // a track with no sensor update for this long is dropped
  warnZone: 2500,        // WARNING alert when a track comes this close to the site
  critZone: 800,         // CRITICAL alert inside this
  rejectBackoff: 3,      // after a rejected task, don't retry that effector for this long
  retaskAdvantage: 300,  // switch target only if the new one is this much closer to the site
};

// The site's own close-in sensing. It is a SAPIENT node too, so everything flows through the same messages.
export const PERIMETER = {
  id: 'perimeter', name: 'Perimeter sensor', short: 'PRM', role: 'sensor', color: 0xff5252,
  range: 150, senses: 'perimeter', mount: 3,
  sapient: { nodeType: 'NODE_TYPE_PROXIMITY_SENSOR', subType: ['Perimeter'], scan: 'SCAN_TYPE_FIXED', interval: 1, noise: { az: 1, el: 2, range: 5 } },
  ref: { analogues: ['Site perimeter security sensors'], confidence: 'assumption' },
};

export const FUSION_DEF = {
  id: 'fusion', name: 'Site Fusion Node', short: 'FUSION', role: 'fusion', color: 0xffffff,
  sapient: { nodeType: 'NODE_TYPE_FUSION_NODE', subType: ['C-UAS fusion'] },
};

export const STRUCTURES = {
  radar: {
    name: 'Radar', short: 'RDR', key: '1', cost: 100, color: 0x4fc3f7, role: 'sensor', published: 2000, mount: 6,
    lowAlt: 40, lowRange: 500, // targets below lowAlt (m) are only seen inside lowRange (m): ground clutter (game rule)
    desc: 'Surveillance radar. Range, bearing and velocity. Low flyers hide in ground clutter until close.',
    sapient: {
      nodeType: 'NODE_TYPE_RADAR', subType: ['Surveillance', 'C-UAS'], scan: 'SCAN_TYPE_SCANNING', interval: 1,
      noise: { az: 0.6, el: 1.2, range: 8 }, velocity: true,
      status: { type: 'STATUS_TYPE_CLUTTER', value: 'Targets below 40 m masked beyond 500 m' },
    },
    ref: {
      class: 'Counter-UAS surveillance radar, micro-UAS class',
      analogues: ['Robin Radar IRIS', 'Blighter A800', 'Echodyne EchoGuard'],
      published: 'IRIS: medium-range band 2–7 km, long-range mode 5–12 km. A800: >2 km claimed for micro-UAS, datasheet up to 7 km for winged drones. EchoGuard: ~1 km (Phantom 4), ~1.4 km (Matrice 600).',
      basis: 'Game range is the ~2 km vendors quote for small quadcopters. The longer figures are for larger targets or special modes.',
      confidence: 'Vendor claims, not independently tested',
      sources: [
        { label: 'EverythingRF: EchoGuard', url: 'https://everythingrf.com/products/radar-systems/echodyne-corp/1069-2160-echoguard' },
        { label: 'EDR Magazine: IRIS long-range module', url: 'https://www.edrmagazine.eu/?p=46182' },
        { label: 'Unmanned Airspace: Blighter A800', url: 'https://www.unmannedairspace.info/?p=24347' },
      ],
    },
  },
  rf: {
    name: 'RF detector', short: 'RF', key: '2', cost: 80, color: 0xffd54f, role: 'sensor', published: 3500, mount: 5, senses: 'rf',
    desc: 'Passive RF sensor. Direction finding only (no range). Cannot see RF-silent drones.',
    sapient: {
      nodeType: 'NODE_TYPE_PASSIVE_RF', subType: ['Direction finding', 'C-UAS'], scan: 'SCAN_TYPE_FIXED', interval: 1,
      noise: { az: 3 }, signal: true,
    },
    ref: {
      class: 'Passive RF detection / direction-finding sensor',
      analogues: ['Dedrone RF-360 / RF-160', 'Hensoldt Elysion RF DF'],
      published: 'Up to 5 km listed for Dedrone passive RF sensors; a general C-UAS reference gives about 2–5 km for passive RF direction finding. A patent filing claims 1.5 km.',
      basis: 'Game range 3.5 km is the middle of the quoted 2–5 km band. Drones with no radio emission (fibre-optic FPV, autonomous fixed-wing here) give it nothing to detect.',
      confidence: 'Vendor listings and a trade reference',
      sources: [
        { label: 'Aviations UK: Dedrone RF vs Hensoldt', url: 'https://aviationsouk.com/compare-products/dedrone-dedronesensors-rf-rf-160-rf-360-vs-hensoldt-elysion-c-uas-current-c-uas-family-formerly-xpeller/' },
        { label: 'RF Essentials: counter-drone systems', url: 'https://rfessentials.com/resources/rf-glossary/counter-drone-system/' },
      ],
    },
  },
  camera: {
    name: 'EO/IR camera', short: 'EO', key: '3', cost: 60, color: 0x81c784, role: 'sensor', published: 1500, mount: 4,
    desc: 'Electro-optical / infrared camera. Bearing and elevation with strong classification, no range.',
    sapient: {
      nodeType: 'NODE_TYPE_CAMERA', subType: ['EO/IR', 'C-UAS'], scan: 'SCAN_TYPE_STEERABLE', interval: 0.5,
      noise: { az: 0.05, el: 0.05 },
    },
    ref: {
      class: 'EO/IR classification camera',
      analogues: ['Multi-sensor C-UAS EO/IR turrets (e.g. as fitted to Hensoldt Elysion)'],
      published: 'No verified public detection or classification range found.',
      basis: 'Game range of 1.5 km is a placeholder.',
      confidence: 'ASSUMPTION: tune this yourself',
      sources: [],
    },
  },
  turret: {
    name: '35 mm gun', short: 'GUN', key: '4', cost: 150, color: 0xffb74d, role: 'effector', published: 4000, muzzleY: 1.6,
    damage: 12, cooldown: 0.3, accuracy: 0.85, shotCost: 0.25,
    desc: 'Air-defence cannon with programmable airburst rounds. Long reach, accuracy falls off with range and against agile drones.',
    sapient: { nodeType: 'NODE_TYPE_KINETIC', subType: ['Gun', 'Airburst'], scan: 'SCAN_TYPE_STEERABLE' },
    ref: {
      class: '35 mm programmable-airburst air-defence gun',
      analogues: ['Rheinmetall Skynex / Oerlikon Skyranger (35 mm AHEAD)', 'Gepard (same calibre)'],
      published: 'Effective combat range up to ~4,000 m (round itself rated ~4,500 m), nominal 1,000 rounds/min, 252 ready rounds. Each AHEAD round carries 152 tungsten sub-projectiles.',
      basis: 'Game range is the 4 km effective figure. Damage, cooldown and per-shot cost are game balance; accuracy falling with range is a game rule.',
      confidence: 'Manufacturer figure as reported by trade press',
      sources: [
        { label: 'Armada International: Skynex', url: 'https://www.armadainternational.com/2024/01/skynex-counter-drone-solution-deploys/' },
        { label: 'Rheinmetall: 35 mm AHEAD', url: 'https://www.rheinmetall.com/de/media/news-watch/news/2024/05/2024-05-28-35mm-ahead-fuer-europaeischen-kunden' },
      ],
    },
  },
  jammer: {
    name: 'RF jammer', short: 'JAM', key: '5', cost: 120, color: 0xba68c8, role: 'effector', published: 1000,
    slow: 0.5, killTime: 5, // jammed drones slow down; after killTime seconds of full jamming they lose link and crash
    desc: 'Directional RF jammer. Switched on only while tracks are in range. Autonomous/fibre drones ignore it.',
    sapient: { nodeType: 'NODE_TYPE_JAMMER', subType: ['RF', 'GNSS'], scan: 'SCAN_TYPE_FIXED', modes: ['Standby', 'Jam'] },
    ref: {
      class: 'Handheld / fixed RF and GNSS jammer',
      analogues: ['DroneShield DroneGun Tactical', 'DroneGun MkIII (shorter range)'],
      published: 'DroneGun Tactical: up to ~1 km effective (older or promotional figures say 2 km). MkIII is rated ~500 m.',
      basis: 'Game range is the 1 km figure. Typical jamming bands are 2.4 GHz, 5.8 GHz and GNSS. Crash-after-N-seconds is a game rule.',
      confidence: 'Vendor claims; figures conflict across sources',
      sources: [
        { label: 'DroneDJ: DroneGun Tactical', url: 'https://dronedj.com/2021/06/23/dronegun-tactical-jammer-provides-powerful-but-flexible-anti-uav-neutralization/' },
        { label: 'Athlon Outdoors: DroneGun Tactical', url: 'https://athlonoutdoors.com/article/dronegun-tactical-anti-drone-gun/' },
      ],
    },
  },
  interceptor: {
    name: 'Interceptor', short: 'MSL', key: '6', cost: 220, color: 0xef5350, role: 'effector', published: 10000, muzzleY: 2.2,
    damage: 45, splash: 40, fuze: 30, cooldown: 4, missileSpeed: 150, shotCost: 30,
    desc: 'Guided counter-drone interceptor with a proximity fuze. Very long reach; each shot is expensive.',
    sapient: { nodeType: 'NODE_TYPE_KINETIC', subType: ['Interceptor', 'Guided'], scan: 'SCAN_TYPE_STEERABLE' },
    ref: {
      class: 'Guided counter-UAS interceptor missile',
      analogues: ['Raytheon Coyote Block 2'],
      published: 'Range 10–15 km reported; speed figures conflict (about 100–160 m/s). No official unit cost found.',
      basis: 'Game range 10 km is the low end of the reported band; speed is 150 m/s. Splash radius, fuze and the per-shot credit cost are assumptions.',
      confidence: 'Secondary reporting; no manufacturer numbers',
      sources: [
        { label: 'Norsk Luftvern: Coyote Block 2', url: 'https://norskluftvern.com/2025/03/31/coyote-block-2-counter-drone-system-us/' },
        { label: 'TWZ: rocket-powered Coyote', url: 'https://www.twz.com/land/new-coyote-anti-drone-interceptor-swaps-jet-engine-for-rocket-power' },
      ],
    },
  },
  laser: {
    name: 'Laser', short: 'LSR', key: '7', cost: 300, color: 0xfff176, role: 'effector', published: 1000, muzzleY: 2.6,
    dps: 28, shotCost: 0,
    desc: 'High-energy laser. Near-zero cost per shot, but needs dwell time, so evasive targets take longer to burn.',
    sapient: { nodeType: 'NODE_TYPE_LDEW', subType: ['Laser'], scan: 'SCAN_TYPE_STEERABLE' },
    ref: {
      class: 'High-energy laser directed-energy weapon',
      analogues: ['UK DragonFire'],
      published: 'Range is classified. The MoD gives a precision claim of hitting a £1 coin from 1 km, operating cost under £10 per shot, and downing drones at up to ~400 mph in trials.',
      basis: 'Game range of 1 km follows the precision claim; it is not a stated max range. Beam damage rate is an assumption. Shot cost is zero to reflect the low per-shot cost.',
      confidence: 'ASSUMPTION for range and power; cost from the MoD',
      sources: [
        { label: 'GOV.UK: DragonFire', url: 'https://www.gov.uk/government/news/advanced-future-military-laser-achieves-uk-first' },
        { label: "Tom's Hardware: DragonFire trials", url: 'https://www.tomshardware.com/tech-industry/uk-dragonfire-laser-downs-high-speed-drones' },
      ],
    },
  },
};
for (const [id, def] of Object.entries(STRUCTURES)) def.id = id;

// game range = published range x WORLD.rangeScale. Call again after changing the scale.
export function applyRangeScale() {
  for (const def of Object.values(STRUCTURES)) def.range = Math.round(def.published * WORLD.rangeScale);
}
applyRangeScale();

export const DRONES = {
  // alt: spawn altitude range (m). jamResist: 0 = fully jammable, 1 = immune.
  // evade: 1 = no manoeuvrability, lower = harder to hit. It scales gun hit chance, missile fuze radius
  // and laser dwell. adapt: how strongly this type gets better at evading/resisting each wave (see ADAPT).
  // rfEmitter: has an active radio link an RF detector can hear. airframe is what a camera classifies it as.
  spotter: {
    name: 'Spotter', role: 'spotter', hp: 50, speed: 30, damage: 0, reward: 50, scale: 1.1, evade: 0.9,
    color: 0xce93d8, alt: [400, 500], jamResist: 0.75, adapt: 0.5, rfEmitter: true, airframe: 'Multirotor',
    loiterDist: 2500, loiterTime: 60, // orbit radius (m) and seconds on station before it leaves
    spotBonus: 0.5,                   // each spotter on station adds this to strike damage
  },
  heavy: {
    // fibre-optic FPV: low, slow, no radio emission, immune to jamming, no manoeuvrability
    name: 'FO FPV', hp: 20, speed: 14, damage: 12, reward: 45, scale: 2.0, evade: 1.0, rfEmitter: false, airframe: 'Multirotor',
    color: 0xa1887f, alt: [10, 25], jamResist: 1, adapt: 0, // never gets better at evading
  },
  fpv: {
    name: 'FPV', hp: 20, speed: 30, damage: 12, reward: 12, scale: 0.7, evade: 0.6, rfEmitter: true, airframe: 'Multirotor',
    color: 0xff8a65, alt: [30, 90], jamResist: 0, adapt: 1,
  },
  wing: {
    name: 'Fixed-wing', hp: 60, speed: 45, damage: 30, reward: 35, scale: 1.3, evade: 0.8, rfEmitter: false, airframe: 'Fixed wing',
    color: 0xe57373, alt: [150, 300], jamResist: 0.5, adapt: 0.7,
  },
};
for (const [id, def] of Object.entries(DRONES)) def.id = id;

// The enemy learns: each wave after the first, drones spawn better at evading and resisting jamming.
// evade = max(evadeFloor, base * (1 - evadePerWave * adapt * (wave - 1)))
// jamResist = max(base, min(jamResistCap, base + jamResistPerWave * adapt * (wave - 1)))
export const ADAPT = { evadePerWave: 0.07, evadeFloor: 0.25, jamResistPerWave: 0.05, jamResistCap: 0.95 };

// Returns [{ t, type, bearing }] sorted by spawn time (seconds into the wave).
export function makeWave(n) {
  const out = [];
  const groups = Math.min(1 + Math.floor(n / 3), 3);
  const bearings = Array.from({ length: groups }, () => Math.random() * Math.PI * 2);
  const add = (type, count, start, span) => {
    for (let i = 0; i < count; i++) {
      out.push({ t: start + (span * i) / Math.max(count, 1), type, bearing: bearings[i % groups] });
    }
  };
  add('fpv', 3 + n * 2, 0, 15);
  if (n >= 2) add('wing', Math.ceil((n - 1) / 2), 4, 14);
  if (n >= 3) add('heavy', Math.floor((n - 1) / 2), 2, 10);
  if (n >= 3) add('spotter', n >= 8 ? 2 : 1, 0, 1);
  return out.sort((a, b) => a.t - b.t);
}

export const waveBonus = (n) => 80 + n * 15;
