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
  radius: 150,           // a drone that gets this close hits the site (the power station is about 300 m across)
  targetAlt: 20,         // drones aim at this height above the ground (m)
  maxHealth: 100,
};

export const BUILD = { minDist: 250, maxDist: 2500, spacing: 60, sellRefund: 1, lockAfterStart: true };

// Procedural terrain. The terrain seed is separate from the scenario seed, so you can change the attack
// without changing the ground (or the other way round). Heights are metres above the station base.
export const TERRAIN = {
  cell: 20,              // resolution of the height/obstacle grid (m)
  relief: 130,           // hill height far from the station (m)
  flatRadius: 500,       // the station platform is flat inside this radius (m)
  blendRadius: 1600,     // terrain reaches full relief at this distance (m)
  forestThreshold: 0.56, // higher = less forest
  canopyMin: 12, canopyMax: 20, // tree height range (m)
  clearRadius: 450,      // no trees within this of the station (m)
  hamlets: 3,            // small clusters of buildings
  treeStep: 40,          // one drawn tree per this many metres of forest
  rfCanopyLength: 300,   // RF detection range falls by 1/e for each this many metres of canopy it passes through
  opticalCanopyTol: 40,  // radar/EO/guns are blocked by more than this many metres of canopy on the path
  endClear: 50,          // trees within this distance of a sensor or weapon are assumed cleared
  pylonSpacing: 260, pylonHeight: 42, // power lines run out from the switchyard
  visualScale: 2,        // trees, pylons and houses are drawn this much larger than true size so you can see them
};

// One fixed budget for the whole run. Buying systems and every shot fired both draw on it; there are no rewards
// for kills or surviving waves. Laydown can only change before the first wave starts, so runs are comparable.
export const ECONOMY = { budget: 15000000 };

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

// Costs are in US dollars. `cost` is what a system costs to buy and deploy; `shotCost` is charged every time a
// consumable (interceptor drone, missile, laser shot) is used. The whole run draws on one fixed budget (ECONOMY).
// Each system's `ref.cost` says where its numbers come from. Prices marked ASSUMPTION had no verified public figure.
export const STRUCTURES = {
  radar: {
    name: 'Radar', short: 'RDR', key: '1', cost: 900000, shotCost: 0, color: 0x4fc3f7, role: 'sensor', kind: 'radar', published: 2000, mount: 6,
    lowAlt: 40, lowRange: 500, // targets below lowAlt (m) are only seen inside lowRange (m): ground clutter (game rule)
    desc: 'Medium-range surveillance radar. Range, bearing and velocity. Low flyers hide in ground clutter until close.',
    sapient: {
      nodeType: 'NODE_TYPE_RADAR', subType: ['Surveillance', 'C-UAS'], scan: 'SCAN_TYPE_SCANNING', interval: 1,
      noise: { az: 0.6, el: 1.2, range: 8 }, velocity: true,
      status: { type: 'STATUS_TYPE_CLUTTER', value: 'Targets below 40 m masked beyond 500 m' },
    },
    ref: {
      class: 'Counter-UAS surveillance radar, medium range',
      analogues: ['Robin Radar IRIS', 'Blighter A800'],
      published: 'IRIS: medium-range band 2–7 km, long-range mode 5–12 km. A800: >2 km claimed for micro-UAS, datasheet up to 7 km for winged drones.',
      basis: 'Game range is the ~2 km vendors quote for small quadcopters. The longer figures are for larger targets or special modes.',
      confidence: 'Vendor claims, not independently tested',
      sources: [
        { label: 'EDR Magazine: IRIS long-range module', url: 'https://www.edrmagazine.eu/?p=46182' },
        { label: 'Unmanned Airspace: Blighter A800', url: 'https://www.unmannedairspace.info/?p=24347' },
      ],
      cost: {
        capex: 'Robin Radar’s CEO put IRIS at under $1 million per unit (traditional air-defence radars: $20–50 million). Game price $900,000.',
        confidence: 'CEO statement, an upper bound',
        sources: [{ label: 'Defense News: Robin Radar', url: 'https://www.defensenews.com/global/europe/2025/09/24/dutch-radar-firm-robin-turns-bird-spotting-skills-into-drone-defense/' }],
      },
    },
  },
  radar_s: {
    name: 'Compact radar', short: 'RDC', key: '2', cost: 45000, shotCost: 0, color: 0x29b6f6, role: 'sensor', kind: 'radar', published: 1000, mount: 4,
    lowAlt: 30, lowRange: 300,
    desc: 'Small solid-state radar. Cheap and short range, so you can afford several, but it sees less.',
    sapient: {
      nodeType: 'NODE_TYPE_RADAR', subType: ['Compact', 'C-UAS'], scan: 'SCAN_TYPE_FIXED', interval: 1,
      noise: { az: 1.0, el: 2.0, range: 10 }, velocity: true,
      status: { type: 'STATUS_TYPE_CLUTTER', value: 'Targets below 30 m masked beyond 300 m' },
    },
    ref: {
      class: 'Compact 3D drone-detection radar',
      analogues: ['Echodyne EchoGuard'],
      published: 'About 1 km against a DJI Phantom 4 and 1.4 km against a Matrice 600 (vendor-listed).',
      basis: 'Game range is the 1 km Phantom 4 figure.',
      confidence: 'Vendor-listed figures',
      sources: [{ label: 'EverythingRF: EchoGuard', url: 'https://everythingrf.com/products/radar-systems/echodyne-corp/1069-2160-echoguard' }],
      cost: {
        capex: 'A 2025 government purchasing schedule reportedly lists EchoGuard at about $45,000; a 2019 article said “upwards of $50,000”. Game price $45,000.',
        confidence: 'Secondary sources; not an official quote',
        sources: [{ label: 'Aviations UK: comparison with price bands', url: 'https://aviationsouk.com/compare-products/droneshield-dronegun-tactical-vs-echodyne-echoshield/' }],
      },
    },
  },
  rf: {
    name: 'RF detector', short: 'RF', key: '3', cost: 40000, shotCost: 0, color: 0xffd54f, role: 'sensor', kind: 'rf', published: 3500, mount: 5, senses: 'rf',
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
      cost: {
        capex: 'No reliable public price found for Dedrone RF sensors. Game price $40,000 is a placeholder.',
        confidence: 'ASSUMPTION: tune this yourself',
        sources: [],
      },
    },
  },
  camera: {
    name: 'EO/IR camera', short: 'EO', key: '4', cost: 100000, shotCost: 0, color: 0x81c784, role: 'sensor', kind: 'camera', published: 1000, mount: 4,
    desc: 'Electro-optical / infrared camera. Bearing and elevation with strong classification, no range.',
    sapient: {
      nodeType: 'NODE_TYPE_CAMERA', subType: ['EO/IR', 'C-UAS'], scan: 'SCAN_TYPE_STEERABLE', interval: 0.5,
      noise: { az: 0.05, el: 0.05 },
    },
    ref: {
      class: 'EO/IR drone-detection camera',
      analogues: ['Multi-sensor C-UAS EO/IR turrets (e.g. as fitted to Hensoldt Elysion)'],
      published: 'An industry source says lower-cost imaging-only EO + long-wave IR detection systems reach under 1,000 m for drones. No manufacturer range found.',
      basis: 'Game range of 1 km follows that statement.',
      confidence: 'One industry statement; tune this yourself',
      sources: [{ label: 'Military Systems Tech: thermal sensor design (figures as surfaced by search; confirm)', url: 'https://www.militarysystems-tech.com/articles/thermal-infrared-sensor-design' }],
      cost: {
        capex: 'The same source puts these imaging-only detection systems at $50,000–$150,000. Game price $100,000, the midpoint.',
        confidence: 'One industry statement',
        sources: [{ label: 'Military Systems Tech: thermal sensor design (figures as surfaced by search; confirm)', url: 'https://www.militarysystems-tech.com/articles/thermal-infrared-sensor-design' }],
      },
    },
  },
  jammer: {
    name: 'RF jammer', short: 'JAM', key: '5', cost: 60000, shotCost: 0, color: 0xba68c8, role: 'effector', published: 1000,
    slow: 0.5, killTime: 5, // jammed drones slow down; after killTime seconds of full jamming they lose link and crash
    desc: 'RF jammer. Switched on only while tracks are in range. Autonomous/fibre drones ignore it. No cost per use.',
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
      cost: {
        capex: 'A comparison site lists DroneGun Tactical at $50,000–$80,000 (the MkIII at $30,000–$50,000); another analysis gives $30,000–$70,000. DroneShield publishes no price. Game price $60,000.',
        confidence: 'Secondary sources; figures conflict',
        sources: [
          { label: 'Aviations UK: DroneGun Tactical vs Dedrone RF', url: 'https://aviationsouk.com/compare-products/dedrone-dedronesensors-rf-rf-160-rf-360-vs-droneshield-dronegun-tactical/' },
          { label: 'ThePricer: cost to shoot down a drone', url: 'https://www.thepricer.org/how-much-does-it-cost-to-shoot-down-a-drone/' },
        ],
      },
    },
  },
  interceptor: {
    name: 'Interceptor drones', short: 'INT', key: '6', cost: 100000, shotCost: 5000, color: 0xef9a9a, role: 'effector', published: 5000, muzzleY: 1.6, fire: 'guided',
    engages: ['fpv', 'fo'], // too slow to catch the fixed-wing drones (game rule)
    damage: 60, splash: 10, fuze: 15, cooldown: 3, missileSpeed: 80,
    desc: 'Cheap ram-type interceptor drones. Each launch costs $5,000. Good against FPV and FO strikes; cannot catch the fixed-wing drones.',
    sapient: { nodeType: 'NODE_TYPE_KINETIC', subType: ['Interceptor drone', 'Guided'], scan: 'SCAN_TYPE_STEERABLE' },
    ref: {
      class: 'Low-cost kinetic interceptor drone',
      analogues: ['Wild Hornets Sting', 'SkyFall P1-SUN'],
      published: 'Sting: about $2,000–2,500 per unit (outliers up to $15,000), flies faster than 100 mph; Ukrainian kinetic interceptors generally $2,000–$5,000.',
      basis: 'Per-launch cost $5,000 (your figure, the top of the reported $2,000–5,000 band). Range 5 km and speed 80 m/s are assumptions.',
      confidence: 'Manufacturer and press figures; range and speed are assumptions',
      sources: [
        { label: 'Wikipedia: Sting (drone)', url: 'https://en.wikipedia.org/wiki/Sting_(drone)' },
        { label: 'DroneXL: $2,000 Sting vs $50,000 Shahed', url: 'https://dronexl.co/2026/05/21/ukraine-sting-drone-shahed/' },
      ],
      cost: {
        capex: 'Launcher and ground control station: no public price. Game price $100,000 is a placeholder. Each interceptor costs $5,000.',
        confidence: 'ASSUMPTION for the launcher; per-shot from you and the press',
        sources: [],
      },
    },
  },
  missile: {
    name: 'Missile', short: 'MSL', key: '7', cost: 1000000, shotCost: 200000, color: 0xef5350, role: 'effector', published: 10000, muzzleY: 2.2, fire: 'guided',
    engagePolicy: 'fixed-wing', // the fusion node keeps this for fixed-wing tracks (or anything that gets close), to save the expensive rounds
    damage: 70, splash: 40, fuze: 30, cooldown: 4, missileSpeed: 150,
    desc: 'High-end guided missile that can hit the fixed-wing drones. Each shot costs $200,000, so the fusion node saves it for fixed-wing tracks.',
    sapient: { nodeType: 'NODE_TYPE_KINETIC', subType: ['Missile', 'Guided'], scan: 'SCAN_TYPE_STEERABLE' },
    ref: {
      class: 'Guided counter-UAS interceptor missile',
      analogues: ['Raytheon Coyote Block 2'],
      published: 'Range 10–15 km reported; speed figures conflict (about 100–160 m/s).',
      basis: 'Game range 10 km is the low end of the reported band; speed is 150 m/s. Splash radius and fuze are assumptions.',
      confidence: 'Secondary reporting; no manufacturer numbers',
      sources: [
        { label: 'Norsk Luftvern: Coyote Block 2', url: 'https://norskluftvern.com/2025/03/31/coyote-block-2-counter-drone-system-us/' },
        { label: 'TWZ: rocket-powered Coyote', url: 'https://www.twz.com/land/new-coyote-anti-drone-interceptor-swaps-jet-engine-for-rocket-power' },
      ],
      cost: {
        capex: 'Per shot $200,000 (your figure). Reported Coyote prices are $100,000–$125,000 (an Army contract works out to about $125,000; Bloomberg cited about $120,000). Launcher price: no public figure; game price $1,000,000 is a placeholder.',
        confidence: 'Press estimates for the round; launcher is an ASSUMPTION',
        sources: [
          { label: 'TWZ: Coyote purchase plans', url: 'https://www.twz.com/drastic-increase-in-army-coyote-drone-interceptor-purchase-plans' },
          { label: 'Army Recognition: Coyote deal', url: 'https://armyrecognition.com/news/army-news/2026/u-s-army-to-secure-coyote-interceptors-in-first-long-term-deal-as-drone-swarms-surge' },
        ],
      },
    },
  },
  laser: {
    name: 'Laser', short: 'LSR', key: '8', cost: 2000000, shotCost: 13, color: 0xfff176, role: 'effector', published: 1000, muzzleY: 2.6,
    dps: 28,
    desc: 'High-energy laser. $2,000,000 to deploy and about $13 per shot, but it needs dwell time, so evasive targets take longer to burn.',
    sapient: { nodeType: 'NODE_TYPE_LDEW', subType: ['Laser'], scan: 'SCAN_TYPE_STEERABLE' },
    ref: {
      class: 'High-energy laser directed-energy weapon',
      analogues: ['UK DragonFire'],
      published: 'Range is classified. The MoD gives a precision claim of hitting a £1 coin from 1 km, operating cost under £10 per shot, and downing drones at up to ~400 mph in trials.',
      basis: 'Game range of 1 km follows the precision claim; it is not a stated max range. Beam damage rate is an assumption.',
      confidence: 'ASSUMPTION for range and power; per-shot cost from the MoD',
      sources: [
        { label: 'GOV.UK: DragonFire', url: 'https://www.gov.uk/government/news/advanced-future-military-laser-achieves-uk-first' },
        { label: "Tom's Hardware: DragonFire trials", url: 'https://www.tomshardware.com/tech-industry/uk-dragonfire-laser-downs-high-speed-drones' },
      ],
      cost: {
        capex: 'Game price $2,000,000 (your figure). No unit price is published; the UK development contract with MBDA is £316 million (about $414 million), which includes R&D. Per shot: about £10 ($13).',
        confidence: 'Your figure for the unit; per-shot from the MoD',
        sources: [
          { label: 'gCaptain: DragonFire contract', url: 'https://gcaptain.com/uk-fast-tracks-naval-laser-weapon-after-successful-high-speed-drone-trials' },
          { label: 'The Register: £10 per shot', url: 'https://www.theregister.com/2025/11/24/royal_navy_dragonfire_laser/' },
        ],
      },
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
  // model: 'quad' | 'fw'. alt: spawn altitude range above ground (m). minAgl: lowest it will fly above ground until
  // it is close to the site (m). Strikes follow the terrain. jamResist: 0 = fully jammable, 1 = immune.
  // evade: 1 = no manoeuvrability, lower = harder to hit. It scales missile fuze radius and laser dwell.
  // adapt: how strongly this type gets better at evading/resisting each wave (see ADAPT).
  // rfEmitter: has an active radio link an RF detector can hear. airframe is what a camera classifies it as.
  // cost: what one drone costs the attacker in dollars, with the evidence in costRef.
  spotter: {
    name: 'FW Spotter', role: 'spotter', model: 'fw', hp: 50, speed: 30, damage: 0, scale: 1.3, evade: 0.9,
    color: 0xce93d8, alt: [400, 500], jamResist: 0.75, adapt: 0.5, rfEmitter: true, airframe: 'Fixed wing',
    loiterDist: 2500, loiterTime: 60, // orbit radius (m) and seconds on station before it leaves
    spotBonus: 0.5,                   // each spotter on station adds this to strike damage
    bank: 0.35,                       // bank angle (radians) while orbiting
    cost: 100000,
    costRef: {
      note: 'Orlan-10 class reconnaissance drone: estimates $80,000–$120,000 per aircraft (the full system is about 18 million rubles). Game uses $100,000.',
      confidence: 'Wartime press estimates, not procurement prices',
      sources: [{ label: 'UNIAN: Orlan-10', url: 'https://www.unian.info/war/amp-2138624-russia-loses-another-uav-in-donbas-photos.html' }],
    },
  },
  fo: {
    // fibre-optic FPV: an FPV that is slower and less agile, flies low, emits no radio and cannot be jammed
    name: 'FO Strike', model: 'quad', hp: 20, speed: 18, damage: 12, scale: 0.7, evade: 0.8,
    rfEmitter: false, airframe: 'Multirotor', color: 0xa1887f, alt: [10, 25], minAgl: 8, jamResist: 1, adapt: 0, fibre: true,
    cost: 1000,
    costRef: {
      note: 'Ukrainian contracts in 2025 priced fibre-optic FPVs at about 30,000–60,000 UAH each (roughly $700–$1,500 at about 40–42 UAH/$; the dollar conversion is mine), depending on spool size. Game uses $1,000.',
      confidence: 'Contract reporting; currency converted by approximation',
      sources: [
        { label: 'Mezha: fibre-optic FPV contract prices', url: 'https://mezha.net/eng/news/5bb1a299_dot_allows_contract/' },
        { label: 'Gagadget: fibre-optic drone prices', url: 'https://gagadget.com/en/562965-the-latest-fibre-optic-drones-have-started-to-fall-in-price-due-to-increased-production-volumes/' },
      ],
    },
  },
  fpv: {
    name: 'FPV Strike', model: 'quad', hp: 20, speed: 30, damage: 12, scale: 0.7, evade: 0.6,
    rfEmitter: true, airframe: 'Multirotor', color: 0xff8a65, alt: [30, 90], minAgl: 15, jamResist: 0, adapt: 1,
    cost: 400,
    costRef: {
      note: 'Ukrainian FPV strike drones are reported at about $400 each (some makers claim under $400 before the warhead; forum estimates run $500–$1,500). Game uses $400.',
      confidence: 'Press and manufacturer figures',
      sources: [
        { label: 'Defence Blog: What Ukraine’s drones really cost', url: 'https://defence-blog.com/?p=83162' },
        { label: 'TechRadar: $400 FPV', url: 'https://www.techradar.com/pro/ukraine-claims-usd400-fpv-drone-destroyed-russias-usd19-million-apache-rival-attack-helicopter' },
      ],
    },
  },
  fw: {
    name: 'FW Strike', model: 'fw', hp: 60, speed: 45, damage: 30, scale: 1.3, evade: 0.8,
    rfEmitter: false, airframe: 'Fixed wing', color: 0xe57373, alt: [150, 300], minAgl: 30, jamResist: 0.5, adapt: 0.7,
    cost: 35000,
    costRef: {
      note: 'Shahed-136 / Geran-2 class: most estimates $20,000–$50,000 per drone (CSIS about $35,000; Forbes Ukraine uses $50,000); later Geran-2 variants closer to $80,000; export price in leaked documents $193,000. Game uses $35,000.',
      confidence: 'Analyst estimates; wide spread',
      sources: [
        { label: 'Phenomenal World: Shahed costs', url: 'https://phenomenalworld.org/?p=29408' },
        { label: 'ThePricer: Shahed cost', url: 'https://www.thepricer.org/how-much-does-a-shahed-drone-cost/' },
      ],
    },
  },
};
for (const [id, def] of Object.entries(DRONES)) def.id = id;

// The enemy learns: each wave after the first, drones spawn better at evading and resisting jamming.
// evade = max(evadeFloor, base * (1 - evadePerWave * adapt * (wave - 1)))
// jamResist = max(base, min(jamResistCap, base + jamResistPerWave * adapt * (wave - 1)))
export const ADAPT = { evadePerWave: 0.07, evadeFloor: 0.25, jamResistPerWave: 0.05, jamResistCap: 0.95 };

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
  add('fpv', 3 + n * 2, 0, 15);
  if (n >= 2) add('fw', Math.ceil((n - 1) / 2), 4, 14);
  if (n >= 3) add('fo', Math.floor((n - 1) / 2), 2, 10);
  if (n >= 3) add('spotter', n >= 8 ? 2 : 1, 0, 1);
  return out.sort((a, b) => a.t - b.t);
}
