// European systems outside the UK. Each is a further real system of a kind, marked `variantOf`, so the S, M and L choices stay as they are.
// Costs are in US dollars, converted at $1.15 to the euro, an assumption. Each system's `ref` says where its numbers come from.
export const EU_SYSTEMS = {
  rf_airfence: {
    product: 'Sensofusion Airfence 7', variantOf: 'rf_l', size: 'L', name: 'Airfence', short: 'AFN', model: 'rf', modelScale: 1.2, cost: 184000, shotCost: 0, color: 0x00897b, role: 'sensor', kind: 'rf', published: 10000, mount: 9, senses: 'rf', falseAlarm: 0.04,
    health: 30, signature: 0.05, emits: [], listens: [[0.07, 6]],
    library: 'commercial', sensitivity: -95, df: 'aoa',
    desc: 'Finnish passive RF detection system, in use since 2016. One sensor hears a drone up to 10 km away on a clear path and finds its bearing. The real one also finds the pilot, which the game does not model. It cannot hear a drone with no radio link.',
    sapient: {
      nodeType: 'NODE_TYPE_PASSIVE_RF', subType: ['Direction finding', 'C-UAS'], scan: 'SCAN_TYPE_FIXED', interval: 1,
      noise: { az: 3 }, signal: true,
    },
    ref: {
      class: 'Passive RF detection and direction-finding system',
      analogues: ['Sensofusion Airfence 7'],
      published: 'Passive RF detection up to 10 km for one sensor unit, extended by adding units, at 70 MHz to 6 GHz, with a direction-finding antenna. It locates the drone, its pilot and its home point, from a library of the major commercial drones updated over the air. It mounts on a building or a vehicle. Its Military Edition adds countermeasures, including high-power jamming.',
      basis: 'Game range is the 10 km listed, which needs a clear line of sight: on a 9 m mast, tree tops and hills will usually stop it sooner. No sensitivity, bearing accuracy or false alarm rate is published, so -95 dBm, 3° and its false alarms are ASSUMPTIONS, between the Dedrone and AARTOS entries. Finding the pilot is not modelled.',
      confidence: 'Maker’s listing',
      sources: [
        { label: 'Sensofusion: Airfence 7', url: 'https://sensofusion.com/airfence/' },
        { label: 'Sensofusion: Military Edition', url: 'https://sensofusion.com/military/' },
        { label: 'Wikipedia: Sensofusion', url: 'https://en.wikipedia.org/wiki/Sensofusion' },
      ],
      cost: { capex: 'Listed at €160,000 before tax, for one sensor, its direction-finding antenna and software. Game price $184,000 converts that at $1.15 to the euro, an assumption.', confidence: 'Maker’s list price', sources: [{ label: 'Sensofusion: Airfence 7', url: 'https://sensofusion.com/airfence/' }] },
    },
  },
  jammer_sf: {
    product: 'Sensofusion Portable Asymmetric Jammer', variantOf: 'jammer_l', size: 'L', name: 'Sensofusion jammer', short: 'SFJ', model: 'jammer', modelScale: 1.1, cost: 46000, shotCost: 0, color: 0x311b92, role: 'effector', kind: 'jammer', published: 4500, mount: 3, mobile: 'vehicle', fire: 'jam',
    health: 30, signature: 3, emits: [], bands: ['control900', 'control24', 'video58', 'gnss'], slow: 0.5, killTime: 5,
    desc: 'Finnish 800 W portable jammer on eight channels at once, listed with Airfence Military Edition. It reaches further than any other jammer here, for little money, but it is the loudest. Autonomous/fibre drones ignore it. No cost per use.',
    sapient: { nodeType: 'NODE_TYPE_JAMMER', subType: ['RF', 'GNSS'], scan: 'SCAN_TYPE_FIXED', modes: ['Standby', 'Jam'] },
    ref: {
      class: 'Portable high-power RF and GNSS jammer',
      analogues: ['Sensofusion Portable Asymmetric Jammer'],
      published: '800 W on eight simultaneous channels, adjustable over 300 to 6,000 MHz, covering the major drone ISM bands and GNSS L1, L2 and L5. Deliveries from early 2026. No range is published.',
      basis: 'Game range 4.5 km is an ASSESSMENT from its power. Aaronia lists its 40 W handheld jammer at 2 km; half that, inside the 30\u201360% of claims the fixed site jammer assumes, is 1 km at 40 W, level with the DroneGun Tactical. Jamming reach goes with the square root of power, as the game\u2019s power setting does, so 800 W reaches about 4.5 km. An omni antenna and its loudness are ASSUMPTIONS. Its 300\u20136,000 MHz and GNSS take in the game\u2019s four bands. At 800 W it needs a vehicle or generator, so it is taken as vehicle-mounted, 3 m up.',
      confidence: 'Maker’s power figure; range is an assessment',
      sources: [
        { label: 'Sensofusion: Military Edition', url: 'https://sensofusion.com/military/' },
        { label: 'EverythingRF: Aaronia jammers, 40 W handheld at 2 km', url: 'https://www.everythingrf.com/news/details/14983-aaronia-offers-portable-stationary-and-fully-integrated-counter-drone-jammers-with-10-km-range' },
      ],
      cost: { capex: 'Listed at €40,000. Game price $46,000 converts that at $1.15 to the euro, an assumption.', confidence: 'Maker’s list price', sources: [{ label: 'Sensofusion: Military Edition', url: 'https://sensofusion.com/military/' }] },
    },
  },
};
