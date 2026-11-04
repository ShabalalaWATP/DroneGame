// The effectors you can buy. The jammer comes in three sizes, with the medium one first.
// Costs are in US dollars. `cost` buys and deploys a system, and `shotCost` is charged every time a consumable (interceptor drone,
// missile, laser shot) is used. Each system's `ref` says where its numbers come from. Prices marked ASSUMPTION had no verified public figure.
export const EFFECTORS = {
  jammer: {
    size: 'M', name: 'Medium RF jammer', short: 'JAM', cost: 60000, shotCost: 0, color: 0x7c4dff, role: 'effector', kind: 'jammer', published: 1000, fire: 'jam',
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
  jammer_s: {
    size: 'S', name: 'Small RF jammer', short: 'JMS', model: 'jammer', modelScale: 0.7, cost: 40000, shotCost: 0, color: 0xb388ff, role: 'effector', kind: 'jammer', published: 500, fire: 'jam',
    health: 30, signature: 0.8, emits: [], bands: ['control24', 'video58'], slow: 0.5, killTime: 5,
    desc: 'Handheld RF jammer. Cheaper and quieter than the larger jammers, with half the reach. Autonomous/fibre drones ignore it. No cost per use.',
    sapient: { nodeType: 'NODE_TYPE_JAMMER', subType: ['RF', 'GNSS'], scan: 'SCAN_TYPE_FIXED', modes: ['Standby', 'Jam'] },
    ref: {
      class: 'Handheld RF jammer',
      analogues: ['DroneShield DroneGun MkIII'],
      published: 'Effective range up to 500 m. 433 and 915 MHz, 2.4 and 5.8 GHz, with GNSS as an option. An operator manual lists up to 1,000 m in rural conditions.',
      basis: 'Game range is the 500 m launch figure.',
      confidence: 'Vendor figures; the manual conflicts',
      sources: [
        { label: 'DroneShield: 2019 specification', url: 'https://www.asx.com.au/asxpdf/20190715/pdf/446lzqk0qszn9n.pdf' },
        { label: 'DroneShield: DroneGun Mk3', url: 'https://droneshield.com/c-uas-products/dronegun-mk3' },
      ],
      cost: {
        capex: 'A comparison site lists the MkIII at $30,000\u2013$50,000. DroneShield publishes no price. Game price $40,000.',
        confidence: 'Secondary source',
        sources: [{ label: 'Aviations UK: DroneGun Tactical vs Dedrone RF', url: 'https://aviationsouk.com/compare-products/dedrone-dedronesensors-rf-rf-160-rf-360-vs-droneshield-dronegun-tactical/' }],
      },
    },
  },
  jammer_l: {
    size: 'L', name: 'Large RF jammer', short: 'JML', model: 'jammer', modelScale: 1.4, cost: 350000, shotCost: 0, color: 0x4a148c, role: 'effector', kind: 'jammer', published: 1600, fire: 'jam',
    health: 30, signature: 2.5, emits: [], bands: ['control24', 'video58'], slow: 0.5, killTime: 5,
    desc: 'Fixed multi-band site jammer. It has the longest reach, but it is expensive and very loud while jamming. Autonomous/fibre drones ignore it. No cost per use.',
    sapient: { nodeType: 'NODE_TYPE_JAMMER', subType: ['RF', 'GNSS'], scan: 'SCAN_TYPE_FIXED', modes: ['Standby', 'Jam'] },
    ref: {
      class: 'Fixed site RF jammer',
      analogues: ['Stationary multi-band site jammers'],
      published: 'No comparable figure found. Vendors of stationary jammers claim up to 10 km, without saying against what.',
      basis: 'Game range is an ASSUMPTION: the 1 km jammer at 40 W per band, scaled by the square root of power to an assumed 100 W, gives 1.6 km.',
      confidence: 'ASSUMPTION: tune this yourself',
      sources: [{ label: 'EverythingRF: Aaronia jammers', url: 'https://www.everythingrf.com/news/details/14983-aaronia-offers-portable-stationary-and-fully-integrated-counter-drone-jammers-with-10-km-range' }],
      cost: { capex: 'No public price found. Game price $350,000 is a placeholder.', confidence: 'ASSUMPTION: tune this yourself', sources: [] },
    },
  },
  interceptor: {
    name: 'Interceptor drones', short: 'INT', cost: 100000, shotCost: 5000, color: 0x00e5ff, role: 'effector', kind: 'interceptor', published: 5000, muzzleY: 1.6, fire: 'guided',
    health: 30, signature: 0.2, emits: [],
    engages: ['fpv', 'fo'], // too slow to catch the fixed-wing drones (game rule)
    damage: 60, splash: 10, fuze: 15, cooldown: 3, missileSpeed: 80,
    desc: 'Cheap ram-type interceptor drones. Good against FPV and FO strikes; cannot catch the fixed-wing drones.',
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
    name: 'Missile', short: 'MSL', cost: 1000000, shotCost: 200000, color: 0xff4081, role: 'effector', kind: 'missile', published: 10000, muzzleY: 2.2, fire: 'guided',
    health: 30, signature: 0.2, emits: [],
    engagePolicy: 'fixed-wing', // the fusion node keeps this for fixed-wing tracks (or anything that gets close), to save the expensive rounds
    damage: 70, splash: 40, fuze: 30, cooldown: 4, missileSpeed: 150,
    desc: 'High-end guided missile that can hit the fixed-wing drones. Each round is expensive, so the fusion node saves it for fixed-wing tracks.',
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
    name: 'Laser', short: 'LSR', cost: 2000000, shotCost: 13, color: 0xffffff, role: 'effector', kind: 'laser', published: 1000, muzzleY: 2.6, fire: 'beam',
    health: 30, signature: 0.3, emits: [],
    dps: 28,
    desc: 'High-energy laser. Very cheap to fire, but it needs dwell time, so evasive targets take longer to burn.',
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
