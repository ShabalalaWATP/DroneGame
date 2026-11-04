// The sensors you can buy. Radar, RF detector and camera each come in three sizes, with the medium one first.
// Costs are in US dollars, and each system's `ref` says where its numbers come from. Prices marked ASSUMPTION had no verified public figure.
// `mount` is how high a sensor sits on its mast (m), an assumption: below the 12-20 m tree tops, trees hide most low flyers.
export const SENSORS = {
  radar: {
    size: 'M', name: 'Medium radar', short: 'RDR', cost: 900000, shotCost: 0, color: 0x2962ff, role: 'sensor', kind: 'radar', published: 2000, mount: 25, falseAlarm: 0.1, // chance of a false alarm per scan
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
    size: 'S', name: 'Small radar', short: 'RDS', cost: 45000, shotCost: 0, color: 0x82b1ff, role: 'sensor', kind: 'radar', published: 1000, mount: 15, falseAlarm: 0.15,
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
  radar_l: {
    size: 'L', name: 'Large radar', short: 'RDL', model: 'radar_s', modelScale: 1.5, cost: 2500000, shotCost: 0, color: 0x0d47a1, role: 'sensor', kind: 'radar', published: 4300, mount: 30, falseAlarm: 0.1,
    health: 30, signature: 1.5, emits: [{ label: 'X-band radar 9.2\u201310 GHz', f: [[9.2, 10]] }],
    lowAlt: 30, lowRange: 800,
    desc: 'Long-range multi-beam radar. It sees furthest and is the most accurate, but it is the most expensive and the easiest for the enemy to find.',
    sapient: {
      nodeType: 'NODE_TYPE_RADAR', subType: ['Air defence', 'C-UAS'], scan: 'SCAN_TYPE_SCANNING', interval: 1,
      noise: { az: 0.3, el: 0.6, range: 5 }, velocity: true,
      status: { type: 'STATUS_TYPE_CLUTTER', value: 'Targets below 30 m masked beyond 800 m' },
    },
    ref: {
      class: 'Long-range air-defence and C-UAS radar',
      analogues: ['Hensoldt Spexer 2000 3D MkIII'],
      published: 'X-band pulse Doppler, 9.2\u201310 GHz, with a 40 km instrumented range. About 9 km is reported against a 0.2 m\u00B2 drone.',
      basis: 'Game range is that 9 km scaled to the 0.01 m\u00B2 reference drone by the radar range equation, which brings a 0.2 m\u00B2 FW Strike back to 9 km. Accuracy and clutter are assumptions. The real radar looks through a 120\u00B0 panel: this one still sees all round until stage A4.',
      confidence: 'Secondary reporting; no manufacturer figure for small drones',
      sources: [
        { label: 'Hensoldt: Spexer 2000 3D MkIII', url: 'https://www.hensoldt.net/products/spexer-2000-3d-mkiii-land-ground-based-air-defence' },
        { label: 'Armed Conflicts: Spexer detection range', url: 'https://origin.armedconflicts.com/-t289922' },
      ],
      cost: { capex: 'No public unit price found. Game price $2,500,000 is a placeholder.', confidence: 'ASSUMPTION: tune this yourself', sources: [] },
    },
  },
  rf: {
    size: 'M', name: 'Medium RF detector', short: 'RF', cost: 40000, shotCost: 0, color: 0x00e676, role: 'sensor', kind: 'rf', published: 3500, mount: 5, senses: 'rf', falseAlarm: 0.05,
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
  rf_s: {
    size: 'S', name: 'Small RF detector', short: 'RFS', model: 'rf', modelScale: 0.7, cost: 10000, shotCost: 0, color: 0x69f0ae, role: 'sensor', kind: 'rf', published: 1000, mount: 5, senses: 'rf', falseAlarm: 0.08,
    health: 30, signature: 0.05, emits: [], listens: [[2.4, 2.4835], [5.15, 5.925]], // without its optional wideband antenna
    desc: 'Wearable passive RF detector. Cheap and short range, and its bearing is only a rough sector, so it warns of a drone more than it locates one.',
    sapient: {
      nodeType: 'NODE_TYPE_PASSIVE_RF', subType: ['Direction finding', 'C-UAS'], scan: 'SCAN_TYPE_FIXED', interval: 1,
      noise: { az: 30 }, signal: true,
    },
    ref: {
      class: 'Wearable passive RF drone detector',
      analogues: ['MyDefence Wingman 103/105'],
      published: 'Listings give up to 6 km, \u00B130\u00B0 direction finding, and 2.4, 5.2 and 5.8 GHz without an antenna, or 200 MHz\u20136 GHz with one.',
      basis: 'Game range 1 km is an ASSUMPTION for a small FPV on a wearable antenna, well under the "up to" listing. The bearing error is the listed figure.',
      confidence: 'Comparison listings; range is an assumption',
      sources: [
        { label: 'Aviations UK: Wingman vs Dedrone RF', url: 'https://aviationsouk.com/compare-products/dedrone-dedronesensors-rf-rf-160-rf-360-vs-mydefence-wingman-103-105-drone-detector/' },
        { label: 'EverythingRF: Wingman 103', url: 'https://www.everythingrf.com/products/cuas-counter-unmanned-aerial-system/mydefence/1075-2458-wingman-103' },
      ],
      cost: { capex: 'No public price found. Game price $10,000 is a placeholder.', confidence: 'ASSUMPTION: tune this yourself', sources: [] },
    },
  },
  rf_l: {
    size: 'L', name: 'Large RF detector', short: 'RFL', model: 'rf', modelScale: 1.4, cost: 400000, shotCost: 0, color: 0x00a152, role: 'sensor', kind: 'rf', published: 8000, mount: 10, senses: 'rf', falseAlarm: 0.03,
    health: 30, signature: 0.05, emits: [], listens: [[0.02, 8]],
    desc: 'Fixed wideband RF detection system. It hears furthest and gives the best bearing, at a much higher price. It still cannot hear RF-silent drones.',
    sapient: {
      nodeType: 'NODE_TYPE_PASSIVE_RF', subType: ['Direction finding', 'C-UAS'], scan: 'SCAN_TYPE_FIXED', interval: 1,
      noise: { az: 2 }, signal: true,
    },
    ref: {
      class: 'Fixed wideband RF detection and direction-finding system',
      analogues: ['Aaronia AARTOS'],
      published: 'The X2 is quoted at about 5 km as standard and the X9 at 14 km, with much larger claims elsewhere. Coverage is quoted as 20 MHz\u20138 GHz, or selectively 400 MHz\u20136 GHz.',
      basis: 'Game range 8 km is an ASSUMPTION between the 5 and 14 km listings, because vendor claims conflict. No bearing accuracy is published, so 2\u00B0 is also an assumption.',
      confidence: 'Vendor listings conflict; range and bearing are assumptions',
      sources: [
        { label: 'EDR Magazine: Aaronia AARTOS', url: 'https://www.edrmagazine.eu/landeuro-2025-aaronia-aartos-a-uav-detection-and-neutralisation-system-from-germany' },
        { label: 'Aviations UK: AARTOS DDS', url: 'https://aviationsouk.com/products/aaronia-aartos-dds-drone-detection-system/' },
      ],
      cost: { capex: 'No reliable public price found. Game price $400,000 is a placeholder.', confidence: 'ASSUMPTION: tune this yourself', sources: [] },
    },
  },
  camera: {
    size: 'M', name: 'Medium EO/IR camera', short: 'EO', cost: 100000, shotCost: 0, color: 0xb0bec5, role: 'sensor', kind: 'camera', published: 1000, mount: 15, falseAlarm: 0.03,
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
  camera_s: {
    size: 'S', name: 'Small EO/IR camera', short: 'EOS', model: 'camera', modelScale: 0.7, cost: 25000, shotCost: 0, color: 0xcfd8dc, role: 'sensor', kind: 'camera', published: 260, mount: 15, falseAlarm: 0.03,
    health: 30, signature: 0.05, emits: [],
    fov: 12, slewRate: 90, searchRate: 12, dwell: 3,
    desc: 'Small thermal camera. Cheap and passive, with a short reach. Must be cued by another sensor. Bearing and elevation with strong classification, no range.',
    sapient: {
      nodeType: 'NODE_TYPE_CAMERA', subType: ['LWIR', 'C-UAS'], scan: 'SCAN_TYPE_STEERABLE', interval: 0.5,
      noise: { az: 0.1, el: 0.1 }, modes: ['Search', 'Track'],
    },
    ref: {
      class: 'Thermal camera core',
      analogues: ['Teledyne FLIR Boson 640, 36 mm lens'],
      published: 'LWIR, 640 x 512 at 12 \u00B5m pitch. The 36 mm lens gives a 12\u00B0 horizontal view. No drone detection range is published.',
      basis: 'Game range 260 m is where a 0.35 m drone covers 4 pixels on this lens. The 4 pixel threshold and the accuracy are assumptions.',
      confidence: 'Lens and sensor from the vendor; range is calculated',
      sources: [{ label: 'Teledyne FLIR: Boson', url: 'https://www.oem.flir.com/products/boson/' }],
      cost: { capex: 'A core alone costs far less than a mounted, weatherproof sensor. Game price $25,000 is a placeholder.', confidence: 'ASSUMPTION: tune this yourself', sources: [] },
    },
  },
  camera_l: {
    size: 'L', name: 'Large EO/IR camera', short: 'EOL', model: 'camera', modelScale: 1.4, cost: 500000, shotCost: 0, color: 0x78909c, role: 'sensor', kind: 'camera', published: 1600, mount: 25, falseAlarm: 0.02,
    health: 30, signature: 0.05, emits: [],
    fov: 2, slewRate: 90, searchRate: 12, dwell: 3,
    desc: 'Cooled long-zoom thermal turret. It reaches further and identifies at a distance, but its view is very narrow, so it needs a good cue.',
    sapient: {
      nodeType: 'NODE_TYPE_CAMERA', subType: ['MWIR', 'C-UAS'], scan: 'SCAN_TYPE_STEERABLE', interval: 0.5,
      noise: { az: 0.02, el: 0.02 }, modes: ['Search', 'Track'],
    },
    ref: {
      class: 'Cooled MWIR long-range camera',
      analogues: ['MWIR camera with Ophir SupIR 80\u20131200 mm f/5.5'],
      published: 'For 15 \u00B5m 640 x 512 cameras, with a 7.1\u00B0 to 0.5\u00B0 horizontal view. Ophir quotes more than 26 km, but that is for vehicles, not drones.',
      basis: 'One fixed zoom until stage A5: at a 2\u00B0 view (about 280 mm) a 0.35 m drone covers 4 pixels at 1.6 km. At full zoom that becomes about 7 km in a 0.5\u00B0 view. The 4 pixel threshold and the accuracy are assumptions.',
      confidence: 'Lens from the vendor; range is calculated',
      sources: [{ label: 'Ophir: MWIR f/5.5 zoom lenses', url: 'https://www.ophiropt.com/g/long-range-mwir-vga-imaging-lenses' }],
      cost: { capex: 'No public price found. Game price $500,000 is a placeholder.', confidence: 'ASSUMPTION: tune this yourself', sources: [] },
    },
  },
};
