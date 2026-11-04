import { WORLD } from './world.js';

// Costs are in US dollars. `cost` is what a system costs to buy and deploy; `shotCost` is charged every time a
// consumable (interceptor drone, missile, laser shot) is used. The whole run draws on one fixed budget (ECONOMY).
// Each system's `ref.cost` says where its numbers come from. Prices marked ASSUMPTION had no verified public figure.
export const STRUCTURES = {
  radar: {
    name: 'Radar', short: 'RDR', key: '1', cost: 900000, shotCost: 0, color: 0x2962ff, role: 'sensor', kind: 'radar', published: 2000, mount: 6, falseAlarm: 0.1, // chance of a false alarm per scan
    health: 30, signature: 1.0, emits: [{ label: 'X-band radar (assumed 9.2\u20139.5 GHz)', f: [[9.2, 9.5]] }], // radar band: assumption
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
    name: 'Compact radar', short: 'RDC', key: '2', cost: 45000, shotCost: 0, color: 0x82b1ff, role: 'sensor', kind: 'radar', published: 1000, mount: 4, falseAlarm: 0.15,
    health: 30, signature: 0.8, emits: [{ label: 'K-band radar 24.45\u201324.65 GHz', f: [[24.45, 24.65]] }], // published for EchoGuard (US)
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
    name: 'RF detector', short: 'RF', key: '3', cost: 40000, shotCost: 0, color: 0x00e676, role: 'sensor', kind: 'rf', published: 3500, mount: 5, senses: 'rf', falseAlarm: 0.05,
    health: 30, signature: 0.05, emits: [], listens: [[0.07, 6]], // passive
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
    name: 'EO/IR camera', short: 'EO', key: '4', cost: 100000, shotCost: 0, color: 0xb0bec5, role: 'sensor', kind: 'camera', published: 1000, mount: 4, falseAlarm: 0.03,
    health: 30, signature: 0.05, emits: [], // passive
    // A narrow field of view (degrees, total) that has to be pointed. Idle, it sweeps; the fusion node cues it to
    // radar tracks with a look_at task and it dwells there before moving on. Slew and sweep rates are in deg/s.
    fov: 10, slewRate: 90, searchRate: 12, dwell: 3,
    desc: 'Electro-optical / infrared camera. Narrow view that must be cued by another sensor. Bearing and elevation with strong classification, no range.',
    sapient: {
      nodeType: 'NODE_TYPE_CAMERA', subType: ['EO/IR', 'C-UAS'], scan: 'SCAN_TYPE_STEERABLE', interval: 0.5,
      noise: { az: 0.05, el: 0.05 }, modes: ['Search', 'Track'],
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
    name: 'RF jammer', short: 'JAM', key: '5', cost: 60000, shotCost: 0, color: 0x7c4dff, role: 'effector', published: 1000, fire: 'jam',
    health: 30, signature: 1.5, emits: [], bands: ['control24', 'video58'], // which bands it jams (changeable per jammer); loud while jamming
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
    name: 'Interceptor drones', short: 'INT', key: '6', cost: 100000, shotCost: 5000, color: 0x00e5ff, role: 'effector', published: 5000, muzzleY: 1.6, fire: 'guided',
    health: 30, signature: 0.2, emits: [],
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
    name: 'Missile', short: 'MSL', key: '7', cost: 1000000, shotCost: 200000, color: 0xff4081, role: 'effector', published: 10000, muzzleY: 2.2, fire: 'guided',
    health: 30, signature: 0.2, emits: [],
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
    name: 'Laser', short: 'LSR', key: '8', cost: 2000000, shotCost: 13, color: 0xffffff, role: 'effector', published: 1000, muzzleY: 2.6, fire: 'beam',
    health: 30, signature: 0.3, emits: [],
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
