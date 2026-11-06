// Real drones, from public sources, for the sandbox and for planning against. The waves still send the four generic types.
// Each one starts from its type (variantOf) and overrides only what is public, or what would be plainly wrong left as it is,
// such as a 10 m airframe with a small drone's radar cross-section. Figures not listed in `published` are assumptions, and the
// Sources tab says so. Speeds are cruise where public, otherwise the top speed, in m/s. See docs/SECURITY_NOTES.md: this is
// published flight performance and reported warhead mass only, and nothing about building or arming a drone belongs here.

// Damage to the site is a game rule. Blast grows with the cube root of the charge, scaled so the generic types keep their values:
// 2 kg gives the first-person-view drone's 12, and 30 kg gives the fixed-wing strike drone's 30.
export const blast = (warheadKg) => Math.round(9.5 * Math.cbrt(warheadKg));

const COMMERCIAL_LINKS = { control: 'control24', video: 'video58', gnss: true }; // 2.4 and 5.8 GHz in the maker's figures, plus satellite navigation
const COMMERCIAL = { links: COMMERCIAL_LINKS, protocol: 'commercial' }; // a maker's own link, which a commercial library knows
const NO_PRICE = 'No price found on any page opened, so the game uses the price of its type. Attack cost sums involving it are rough.';

export const REAL_DRONES = {
  // ---------- Russia ----------
  geran2: {
    variantOf: 'fw', origin: 'Russia', name: 'Geran-2 (fixed-wing strike)', label: 'Geran-2',
    speed: 50, alt: [600, 2000], size: 2.5, damage: blast(50), cost: 48800,
    usedBy: 'Russia. Widely documented against Ukraine.',
    published: 'Cruise about 180 km/h, top about 185 km/h. Reported at 600 to 2,000 m, ceiling about 4,000 m. Range 1,000 to 2,500 km. Wingspan 2.5 m, up to 240 kg. Warhead 40 to 90 kg (game uses 50). Piston engine. Satellite and inertial navigation; later versions add cellular and radio modems. Press figures, several uncited.',
    costRef: {
      note: 'RUSI: $30,000 to $80,000. CSIS works with $35,000 for Shahed-type drones. Leaked documents projected about $48,800 with near-full local production. Game uses $48,800.',
      confidence: 'Analyst estimates; wide spread',
      sources: [
        { label: 'CSIS: Shahed to Geran', url: 'https://www.csis.org/analysis/shahed-geran-how-russia-continues-reinvent-one-way-attack-drone' },
        { label: 'Wikipedia: HESA Shahed 136', url: 'https://en.wikipedia.org/wiki/HESA_Shahed_136' },
        { label: 'LB.ua: jet Shaheds', url: 'https://en.lb.ua/news/2025/08/01/36522_reactive_shaheds_when.html' },
        { label: 'Forces News: Shahed heights', url: 'https://www.forcesnews.com/russia/ukraine-urged-change-tactics-russias-shahed-drones-become-more-deadly' },
      ],
    },
  },
  lancet3: {
    variantOf: 'fw', origin: 'Russia', name: 'Lancet-3 (loitering munition)', label: 'Lancet-3',
    speed: 26, size: 1, rcs: 0.05, sound: 1, damage: blast(4), cost: 35000, seeksEmitters: true,
    links: { control: 'control900', gnss: true }, rfEmitter: true, protocol: 'tactical',
    usedBy: 'Russia.',
    published: 'Cruise 80 to 110 km/h (game uses 95). Ceiling about 5,000 m. Range about 40 km, about 40 minutes. 12 kg. Warhead 3 to 5 kg (game uses 4). Electric. 868 to 928 MHz reported for ZALA drones generally. Typical height and wingspan are not public, so height is its type’s and size is assumed. Press figures.',
    costRef: {
      note: 'About 3 million roubles, Samuel Bendett (CNAS) via Reuters, given as $35,000 to $37,000. Game uses $35,000.',
      confidence: 'Analyst estimate',
      sources: [
        { label: 'Army Recognition: Lancet-3', url: 'https://armyrecognition.com/military-products/army/unmanned-systems/unmanned-aerial-vehicles/lancet-3-loitering-munition-kamikaze-drone-russia-data-fact-sheet' },
        { label: 'Wikipedia: ZALA Lancet', url: 'https://en.wikipedia.org/wiki/ZALA_Lancet' },
      ],
    },
  },
  orlan10: {
    variantOf: 'spotter', origin: 'Russia', name: 'Orlan-10 (reconnaissance)', label: 'Orlan-10',
    speed: 33, size: 3.1, cost: 100000, links: { control: 'control900', gnss: true },
    usedBy: 'Russia.',
    published: 'Cruise 90 to 150 km/h (game uses 120). Ceiling 5,000 m. Wingspan 3.1 m, 15 to 18 kg. Control on 850 to 930 MHz, with satellite navigation. Piston engine. Typical height is not public, so it is its type’s. Ukrainian military intelligence and press figures.',
    costRef: {
      note: 'Reported at $87,000 to $120,000 by Army Recognition, with no named origin. Game uses $100,000.',
      confidence: 'Press report',
      sources: [
        { label: 'War & Sanctions (HUR): Orlan-10', url: 'https://war-sanctions.gur.gov.ua/en/uav/207' },
        { label: 'Army Recognition: Orlan-10', url: 'https://www.armyrecognition.com/archives/archives-land-defense/land-defense-2018/more-orlan-10-drones-for-russian-army-in-may' },
        { label: 'Wikipedia: Orlan-10', url: 'https://en.wikipedia.org/wiki/Orlan-10' },
      ],
    },
  },
  molniya2: {
    variantOf: 'fpv', origin: 'Russia', name: 'Molniya-2 (first-person-view fixed wing)', label: 'Molniya-2',
    model: 'fw', airframe: 'Fixed wing', speed: 29, alt: [350, 450], scale: 1, size: 1.5, rcs: 0.05, damage: blast(4.5), cost: 1600,
    usedBy: 'Russia. Its use is solid; the maker rests on Wikipedia alone.',
    published: 'Cruise 90 to 120 km/h (game uses 105). About 400 m up. Range 30 to 60 km. Wingspan about 1.5 m, about 10 kg. Warhead 3 to 6 kg (game uses 4.5). Electric. Flown over a first-person video radio link; which bands is not public, so they are its type’s. One analyst and press figures.',
    costRef: {
      note: '$1,600 from Russian media and industry, via United24; other reports say about $300. Game uses $1,600.',
      confidence: 'Press reports; wide spread',
      sources: [
        { label: 'Mezha: Molniya drones', url: 'https://oboronka.mezha.ua/en/udarni-droni-molniya-harateristiki-chim-nebezpechni-307515/' },
        { label: 'United24: Molniya family', url: 'https://united24media.com/war-in-ukraine/russia-expands-molniya-drone-family-with-new-lightning-13-variant-20008' },
        { label: 'Wikipedia: Molniya', url: 'https://en.wikipedia.org/wiki/Molniya_(drone)' },
      ],
    },
  },
  kvn: {
    variantOf: 'fo', origin: 'Russia', name: 'KVN (fibre-optic, Knyaz Vandal Novgorodsky)', label: 'KVN',
    speed: 28, damage: blast(4.5), cost: 17000,
    usedBy: 'Russia.',
    published: 'Top speed 100 to 140 km/h, inferred by the publisher rather than stated (game uses 100). Range 15 to 42 km, the longer figures being Russian developer claims. Warhead 3 to 6 kg (game uses 4.5). Fibre-optic control and video. Height and size are not public, so they are its type’s. Thin apart from range.',
    costRef: {
      note: '$17,000 is what Russian military bloggers say the ministry pays, via Kyiv Post.',
      confidence: 'Press report of blogger claims',
      sources: [
        { label: 'TASS: KVN', url: 'https://tass.com/defense/2110647' },
        { label: 'www1.ru: KVN range versions', url: 'https://www1.ru/en/news/2026/08/15/428247-optovolokonnyi-dron-kniaz-vandal-polucil-versii-s-dalnostiu-do-42-km-lineika-modifikacii-rassiriaetsia.html' },
        { label: 'Kyiv Post: KVN price', url: 'https://www.kyivpost.com/post/38831' },
      ],
    },
  },
  gerbera: {
    variantOf: 'fw', origin: 'Russia', name: 'Gerbera (decoy, some armed)', label: 'Gerbera',
    speed: 44, size: 2.5, damage: blast(6), cost: 10000, rfEmitter: true,
    usedBy: 'Russia.',
    published: 'Top speed about 160 km/h. Ceiling about 3,000 m. Range 300 to 600 km. Wingspan 2.5 m. Mostly a decoy; warheads of 2 to 10 kg reported (game uses 6). Small piston engine. Later versions relay through radio mesh modems. Cruise speed, height and mass are not public. Press figures.',
    costRef: {
      note: 'About $10,000 from Ukrainian officials via Reuters: an adversary’s estimate.',
      confidence: 'Official, adversary estimate',
      sources: [
        { label: 'Wikipedia: Gerbera', url: 'https://en.wikipedia.org/wiki/Gerbera_(drone)' },
        { label: 'ISIS: Russian decoy drones', url: 'https://isis-online.org/isis-reports/russian-decoy-drones-that-depend-on-western-parts-pose-a-great-challenge/' },
      ],
    },
  },

  // ---------- Iran ----------
  shahed136: {
    variantOf: 'fw', origin: 'Iran', name: 'Shahed-136 (fixed-wing strike)', label: 'Shahed-136',
    speed: 50, alt: [60, 4000], size: 2.5, damage: blast(35), cost: 35000,
    usedBy: 'Iran, and Russia as the Geran-2. Houthi use is reported by one Newsweek story.',
    published: 'Cruise about 180 km/h, top about 185 km/h. Flying heights of 60 to 4,000 m reported. Range 1,000 to 2,500 km. Wingspan 2.5 to 3 m, 200 kg. Warhead 20 to 50 kg (game uses 35). Piston engine. Satellite and inertial navigation. CSIS and press figures. The only radar cross-section found, 0.01 m², traces to a post on X, so it is not used.',
    costRef: {
      note: 'CSIS works with about $35,000, citing estimates from $20,000 to $80,000. An export quote of $193,000 came from leaked documents. Game uses $35,000.',
      confidence: 'Analyst estimates; wide spread',
      sources: [
        { label: 'CSIS Missile Threat: Shahed 131 and 136', url: 'https://missilethreat.csis.org/missile/shahed-131-and-136/' },
        { label: 'CSIS: cost of Russia’s drone strikes', url: 'https://www.csis.org/analysis/calculating-cost-effectiveness-russias-drone-strikes' },
        { label: 'Army Recognition: Shahed-136', url: 'https://armyrecognition.com/military-products/army/unmanned-systems/unmanned-aerial-vehicles/shahed-136-loitering-munition-kamikaze-suicide-drone-technical-data' },
      ],
    },
  },
  shahed131: {
    variantOf: 'fw', origin: 'Iran', name: 'Shahed-131 (fixed-wing strike)', label: 'Shahed-131',
    speed: 50, size: 2.2, damage: blast(15), cost: 20000,
    usedBy: 'Iran, and Russia as the Geran-1.',
    published: 'Cruise about 180 km/h. Range 700 to 1,000 km. Wingspan 2.2 m, 135 kg. Warhead 10 to 20 kg (game uses 15). Rotary engine. Satellite and inertial navigation. Top speed and height are not public, so height is its type’s. Ukrainian military intelligence and CSIS figures.',
    costRef: {
      note: '$20,000 is a figure for the Shahed series, not the 131 alone: Knights and Almeida, Washington Institute, via Wikipedia.',
      confidence: 'Analyst estimate for the series',
      sources: [
        { label: 'War & Sanctions (HUR): Shahed-131', url: 'https://war-sanctions.gur.gov.ua/en/uav/338' },
        { label: 'CSIS Missile Threat: Shahed 131 and 136', url: 'https://missilethreat.csis.org/missile/shahed-131-and-136/' },
        { label: 'Wikipedia: Shahed 131', url: 'https://en.wikipedia.org/wiki/Shahed_131' },
      ],
    },
  },
  mohajer6: {
    variantOf: 'spotter', origin: 'Iran', name: 'Mohajer-6 (reconnaissance and strike)', label: 'Mohajer-6',
    speed: 36, alt: [4876, 5486], size: 10, rcs: 1,
    usedBy: 'Iran and Russia, both solid. Venezuela limited and partly unconfirmed.',
    published: 'Cruise about 130 km/h, top about 200 km/h. Operates at 4,900 to 5,500 m, ceiling 5,400 to 7,600 m. 12 hours’ endurance. Wingspan 10 m, 600 to 670 kg. Payload 100 to 150 kg. Piston engine. It can carry weapons, but the game only models it spotting. Press figures.',
    costRef: {
      note: NO_PRICE,
      confidence: 'Not public',
      sources: [
        { label: 'TWZ: Mohajer-6', url: 'https://www.twz.com/news-features/iranian-mohajer-6-drones-now-operating-in-venezuela' },
        { label: 'Army Recognition: Mohajer-6', url: 'https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/first-armed-iranian-made-mohajer-6-uav-used-by-russia-in-ukraine-crashes-near-kursk' },
        { label: 'Wikipedia: Qods Mohajer-6', url: 'https://en.wikipedia.org/wiki/Qods_Mohajer-6' },
      ],
    },
  },
  ababil2: {
    variantOf: 'spotter', origin: 'Iran', name: 'Ababil-2 (reconnaissance)', label: 'Ababil-2',
    speed: 77, size: 3.25,
    usedBy: 'Iran. Hezbollah and the Libyan National Army rest on Wikipedia.',
    published: 'Cruise 250 to 305 km/h (game uses 278), top about 370 km/h. Ceiling 3,000 m. Range about 120 km. Wingspan 3.25 m, 83 kg. Piston engine. Mostly uncited Wikipedia figures, chosen over the Ababil-3, which has even less. Typical height is not public, so it is its type’s.',
    costRef: {
      note: NO_PRICE,
      confidence: 'Not public',
      sources: [
        { label: 'Wikipedia: HESA Ababil', url: 'https://en.wikipedia.org/wiki/HESA_Ababil' },
        { label: 'FAS: Hezbollah’s use of drones', url: 'https://fas.org/publication/hezbollah-use-drones-weapon-terrorism/' },
      ],
    },
  },

  // ---------- China ----------
  ch901: {
    variantOf: 'fw', origin: 'China', name: 'CH-901 (loitering munition)', label: 'CH-901',
    speed: 39, alt: [150, 450], size: 1, rcs: 0.05, sound: 1, damage: blast(3),
    usedBy: 'China. Fielding with the PLA is not confirmed.',
    published: 'Cruise 100 to 180 km/h (game uses 140). Sources conflict on height, between 150 and 450 m. Range 10 to 15 km, 40 to 120 minutes. 9 kg. Warhead about 3 kg. Wingspan is not public, so size is assumed. Press and analyst figures, which often disagree.',
    costRef: {
      note: NO_PRICE,
      confidence: 'Not public',
      sources: [
        { label: 'Bard CSD: Loitering Munitions', url: 'https://dronecenter.bard.edu/files/2017/02/CSD-Loitering-Munitions.pdf' },
        { label: 'Army Recognition: CH-901', url: 'https://www.armyrecognition.com/archives/archives-land-defense/land-defense-2018/china-defense-industry-presents-ch-901-suicide-drone-at-sofex-2018' },
        { label: 'Wikipedia: CASC CH-901', url: 'https://en.wikipedia.org/wiki/CASC_CH-901' },
      ],
    },
  },
  feilong300d: {
    variantOf: 'fw', origin: 'China', name: 'Feilong-300D (fixed-wing strike)', label: 'Feilong-300D',
    damage: blast(45), cost: 10000,
    usedBy: 'China, as a showcased export product. PLA use rests on one post on X. No export customer announced.',
    published: 'Range about 1,000 km. Warhead 40 to 50 kg (game uses 45). Piston engine. Inertial and satellite guidance. Speed, height and size are not public, so they are its type’s.',
    costRef: {
      note: '"As low as $10,000", from a Chinese industry journal: a marketing figure, not a sale price.',
      confidence: 'Marketing figure',
      sources: [
        { label: 'Army Recognition: FL-300D', url: 'https://armyrecognition.com/news/army-news/2026/chinas-10k-truck-launched-fl-300d-drone-to-overwhelm-air-defenses-with-mass-saturation-strikes' },
        { label: 'The Defense Post: Feilong-300D', url: 'https://thedefensepost.com/2025/11/07/china-feilong-300d-drone' },
        { label: 'Interesting Engineering: Feilong', url: 'https://interestingengineering.com/military/china-feilong-drone-long-range-strike' },
      ],
    },
  },
  sunflower200: {
    variantOf: 'fw', origin: 'China', name: 'Sunflower-200 (fixed-wing strike)', label: 'Sunflower-200',
    speed: 53, size: 2.5, damage: blast(40),
    usedBy: 'A showcased Chinese product. Not confirmed in PLA service, and no confirmed sale.',
    published: 'Cruise 160 to 220 km/h (game uses 190). Range 1,500 to 2,000 km. Wingspan 2.5 m, 175 kg. Warhead 40 kg. All the seller’s claims. Height is not public, so it is its type’s.',
    costRef: {
      note: NO_PRICE,
      confidence: 'Not public',
      sources: [
        { label: 'Defense Express: Sunflower-200', url: 'https://en.defence-ua.com/news/china_shows_a_shahed_136_copy_called_sunflower_200_and_its_serious_threat-7648.html' },
        { label: 'Army Recognition: Sunflower-200', url: 'https://www.armyrecognition.com/archives/archives-land-defense/land-defense-2023/china-could-provide-large-scale-sunflower-200-kamikaze-drones-to-russia' },
        { label: 'Asia Times: Sunflower', url: 'https://asiatimes.com/2023/09/killer-sunflower-chinas-kamikaze-drone-has-arrived/' },
      ],
    },
  },
  asn209: {
    variantOf: 'spotter', origin: 'China', name: 'ASN-209 (reconnaissance)', label: 'ASN-209',
    speed: 39, size: 7.5, rcs: 0.5,
    usedBy: 'China, Algeria, and Egypt under licence. Mostly from Wikipedia.',
    published: 'Cruise about 140 km/h, top about 180 km/h. Ceiling 5,000 m. Range 200 km, 10 hours. Wingspan 7.5 m, 320 kg. Payload 50 kg. Mostly Wikipedia citing a maker brochure. Typical height is not public, so it is its type’s.',
    costRef: {
      note: NO_PRICE,
      confidence: 'Not public',
      sources: [
        { label: 'Wikipedia: Aisheng ASN-209', url: 'https://en.wikipedia.org/wiki/Aisheng_ASN-209' },
        { label: 'StrategyPage: ASN-209', url: 'https://www.strategypage.com/htmw/htairfo/20120524.aspx' },
      ],
    },
  },
  skywalker: {
    variantOf: 'fo', origin: 'China', name: 'Skywalker (fibre-optic fixed wing, commercial)', label: 'Skywalker',
    model: 'fw', airframe: 'Fixed wing', speed: 53,
    usedBy: 'A commercial product from Wuhan with no military user reported. The PLA has been shown training with fibre-optic drones, but no named model has published figures, so this is the nearest documented Chinese example.',
    published: 'Top speed about 190 km/h. Range about 30 km on the fibre. The maker’s claims. Cruise speed, height, size and warhead are not public, so they are its type’s.',
    costRef: {
      note: NO_PRICE,
      confidence: 'Not public',
      sources: [
        { label: 'Militarnyi: Chinese fibre-optic drone', url: 'https://militarnyi.com/en/news/chinese-drone-maker-introduces-uav-controlled-by-fiber-optics/' },
        { label: 'Militarnyi: PLA fibre-optic training', url: 'https://militarnyi.com/en/news/china-s-military-is-training-with-fiber-optic-drones-and-homing-systems/' },
        { label: 'The Star: PLA low-cost drones', url: 'https://thestar.com.my/tech/tech-news/2025/04/29/chinas-military-rapidly-expands-use-of-low-cost-ai-powered-drones-in-phased-leap' },
      ],
    },
  },

  // ---------- commercial drones reported carrying munitions. Flight figures are the maker's, for the unmodified aircraft. ----------
  mavic3: {
    variantOf: 'fpv', origin: 'Commercial off the shelf', name: 'DJI Mavic 3 with a small munition', label: 'Mavic 3',
    speed: 15, size: 0.38, evade: 0.8, ...COMMERCIAL, damage: blast(0.5), cost: 2199,
    usedBy: 'Reported on the Russia-Ukraine battlefield. Which side flies which model is not confirmed.',
    published: 'Cruise about 54 km/h, top about 76 km/h. Up to 46 minutes. 0.38 m across, 0.9 kg. 2.4 and 5.8 GHz links, with satellite navigation. No source gives a munition mass: the game assumes 0.5 kg.',
    costRef: {
      note: 'Launch price of the standard model. NPR says around $2,000 or less.',
      confidence: 'Press report of a retail price',
      sources: [
        { label: 'DJI: Mavic 3', url: 'https://www.dji.com/ph/support/product/mavic-3' },
        { label: 'DroneDJ: Mavic 3 specs', url: 'https://dronedj.com/2021/11/04/dji-mavic-3-vs-mavic-2-pro-spec-sheet' },
        { label: 'CT Public (NPR): hobby drones in the war', url: 'https://www.ctpublic.org/2023-03-21/a-chinese-drone-for-hobbyists-plays-a-crucial-role-in-the-russia-ukraine-war' },
      ],
    },
  },
  matrice30t: {
    variantOf: 'fpv', origin: 'Commercial off the shelf', name: 'DJI Matrice 30T with a munition', label: 'Matrice 30T',
    speed: 23, size: 0.67, evade: 0.8, ...COMMERCIAL, damage: blast(1), cost: 6800,
    usedBy: 'Bought for Ukrainian forces. Munition use is not confirmed on any page opened.',
    published: 'Top speed about 83 km/h. Up to 41 minutes. 0.67 m across, 3.8 kg. 2.4 and 5.8 GHz links, with satellite navigation. No source gives a munition mass: the game assumes 1 kg.',
    costRef: {
      note: '265,000 UAH per drone in a Ukrainian defence contract, March 2024. About $6,800 at about 39 UAH/$; the dollar conversion is mine.',
      confidence: 'Contract reporting; currency converted by approximation',
      sources: [
        { label: 'DJI: Matrice 30 specs', url: 'https://enterprise.dji.com/matrice-30/specs' },
        { label: 'Borg Expert: Matrice 30T contract', url: 'https://borgexpert.com/ru/news/ahentstvo-oboronnykh-zakupok-zakazalo-samye-deshevye-drony-matrice-30t' },
      ],
    },
  },
  matrice300: {
    variantOf: 'fpv', origin: 'Commercial off the shelf', name: 'DJI Matrice 300 RTK with a munition', label: 'Matrice 300',
    speed: 17, size: 0.9, evade: 0.8, rcs: 0.02, ...COMMERCIAL, damage: blast(2), cost: 6800,
    usedBy: 'One 2022 report of Ukrainian forces carrying munitions on it, with no mass given.',
    published: 'Cruise about 61 km/h, top about 83 km/h. Up to 55 minutes. 0.9 m across, 6.3 kg. 2.4 and 5.8 GHz links, with satellite navigation. The game assumes a 2 kg munition.',
    costRef: {
      note: 'No price found on any page opened. The game borrows the Matrice 30T’s, so treat it as a rough stand-in.',
      confidence: 'Not public',
      sources: [
        { label: 'Drone Spec: Matrice 300', url: 'https://dronespec.dronedesk.io/dji-matrice-300' },
        { label: 'Clifton Cameras: Matrice 300 RTK specs', url: 'https://www.cliftoncameras.co.uk/uploads/specifications/DJI%20Matrice%20300%20RTK.pdf' },
        { label: 'DroneXL: Matrice 300 in Ukraine', url: 'https://dronexl.co/2022/07/10/dji-matrice-300-ukrainian-forces-mortars' },
      ],
    },
  },
  agrast30: {
    variantOf: 'fpv', origin: 'Commercial off the shelf', name: 'DJI Agras T30 as a heavy bomber', label: 'Agras T30',
    speed: 10, size: 2.1, evade: 0.95, rcs: 0.1, sound: 3, ...COMMERCIAL, damage: blast(20), cost: 23000,
    usedBy: 'A farm drone. Ukrainian use with added weapons is reported, naming the T30.',
    published: 'Top speed 36 km/h, working speed about 25 km/h. Up to about 20 minutes. 2.1 m across, 78 kg fully loaded. Crop load 30 kg. 2.4 and 5.8 GHz links. The 20 kg bomb load the game uses is reported for an unnamed farm hexacopter, not confirmed for this model.',
    costRef: {
      note: '$39,000 on a New Zealand retailer’s page, probably New Zealand dollars. About $23,000 at about 0.6; the conversion is mine.',
      confidence: 'Retail listing; currency uncertain',
      sources: [
        { label: 'DJI: Agras T30 specs', url: 'https://www.dji.com/t30/specs' },
        { label: 'Ferntech: Agras T30', url: 'https://www.ferntech.co.nz/dji-agras-t30' },
        { label: 'Army Recognition: armed farm drone', url: 'https://www.armyrecognition.com/focus-analysis-conflicts/army/conflicts-in-the-world/russia-ukraine-war-2022/ukrainian-farm-drone-now-armed-with-pkm-7-62-mm-machine-gun-and-bullspike-at-grenade-launcher' },
        { label: 'Kyiv Post: Baba Yaga', url: 'https://www.kyivpost.com/amp/post/31150' },
      ],
    },
  },
  evomax4t: {
    variantOf: 'fpv', origin: 'Commercial off the shelf', name: 'Autel EVO Max 4T with a small munition', label: 'EVO Max 4T',
    speed: 23, size: 0.46, evade: 0.8, ...COMMERCIAL, damage: blast(0.5), cost: 5400,
    usedBy: 'Bought for Ukrainian forces. A Russian link rests on one Bloomberg report, which Autel denies. Munition use is not confirmed on any page opened.',
    published: 'Top speed about 83 km/h, from a reseller. Up to 42 minutes. 0.46 m across, 1.6 kg. 2.4 and 5.8 GHz links among others, with satellite navigation. No source gives a munition mass: the game assumes 0.5 kg.',
    costRef: {
      note: '223,700 UAH per kit in a Ukrainian defence contract, April 2025. About $5,400 at about 41.5 UAH/$; the dollar conversion is mine.',
      confidence: 'Contract reporting; currency converted by approximation',
      sources: [
        { label: 'Autel: EVO Max 4T brochure', url: 'https://cdn.shopify.com/s/files/1/0047/0247/0190/files/EVOMax4TBrochure.pdf' },
        { label: 'Economic Pravda: procurement', url: 'https://epravda.com.ua/rus/oborona/kakie-drony-zakazalo-agentstvo-oboronnyh-zakupok-806296/' },
        { label: 'Euromaidan Press: Autel and Bloomberg', url: 'https://euromaidanpress.com/2025/07/08/china-helped-build-the-drones-now-hitting-ukraine-bloomberg-traces-the-parts/' },
      ],
    },
  },
  fpv7inch: {
    variantOf: 'fpv', origin: 'Commercial off the shelf', name: 'Typical 7-inch first-person-view quadcopter (not one product)', label: '7-inch quad',
    speed: 31, size: 0.33, damage: blast(1.75), cost: 700,
    usedBy: 'Both sides in Russia-Ukraine, and the hobby market worldwide. A category, not a product.',
    published: 'Top speed 80 to 140 km/h (game uses 110). Range 7 to 20 km. 6 to 25 minutes. About 0.33 m across, 0.65 to 2.5 kg. Carries 0.5 to 3 kg (game uses 1.75). Common links include 900 MHz and 2.4 GHz for control and 5.8 GHz for video. Hobby sources, so indicative only.',
    costRef: {
      note: 'About $400 in parts for a cheap build, up to about $1,000 for retail. Game uses $700.',
      confidence: 'Hobby and press figures',
      sources: [
        { label: 'Grepow: 7-inch first-person-view drones', url: 'https://www.grepow.com/blog/what-is-a-7-inch-fpv-drone.html' },
        { label: 'RobotShop: iFlight 7-inch', url: 'https://uk.robotshop.com/products/iflight-sh-cinelr-7-o4-6s-hd' },
        { label: 'Militarnyi: first-person-view drones', url: 'https://militarnyi.com/en/articles/fpv-drones-weapons-that-changed-the-modern-war' },
      ],
    },
  },
};
