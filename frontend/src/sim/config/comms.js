// ---------- radio spectrum ----------
// Frequencies in GHz, as [low, high] ranges. Used by the Spectrum view, to work out which jammer bands overlap
// which links, and to say what each enemy drone depends on. GNSS and the ISM/ELRS control and video bands are
// widely published values; the radar X-band figure is an assumption (see the radar's ref).
export const SPECTRUM = {
  bands: {
    control900: { label: 'Control 868/915 MHz', f: [[0.860, 0.930]], note: 'Long-range control links (e.g. ELRS)' },
    control24: { label: 'Control 2.4 GHz', f: [[2.400, 2.4835]], note: 'Common FPV and hobby control link' },
    video58: { label: 'Video 5.8 GHz', f: [[5.650, 5.925]], note: 'Common FPV video downlink' },
    gnss: { label: 'GNSS L1/L2', f: [[1.215, 1.255], [1.559, 1.610]], note: 'GPS and similar navigation signals' },
  },
  detectorListens: [0.07, 6], // the RF detector sweeps 70 MHz to 6 GHz (trade reference)
};
export const overlaps = (a, b) => a.some(([a0, a1]) => b.some(([b0, b1]) => a0 < b1 && b0 < a1));

// ---------- communications ----------
// Every sensor and effector reaches the fusion node over its own terminal: Starlink or a cellular modem. Both ends of a
// path (the node's terminal and the fusion node's terminal) must be up. Capacity is bits per second, latency seconds.
// Starlink figures come from reviews and regulatory filings; cellular latency, capacity and tower range had no verified
// source and are assumptions. Message sizes are rough protobuf-sized estimates, plus overhead for IP and encryption.
export const COMMS = {
  bytes: { detection_report: 220, status_report: 140, registration: 900, registration_ack: 50, task: 180, task_ack: 60, alert: 160, alert_ack: 40, error: 100 },
  overhead: 60,           // bytes added to every message by the network layers
  queueLimit: 4,          // seconds a message may wait for a busy link before it is dropped
  internetLatency: 0.02,  // seconds added when the two ends use different networks
  towers: 3,              // cell towers placed on high ground around the station
  towerHeight: 40,        // m
  starlink: {
    name: 'Starlink', cost: 349, latency: 0.04, capacity: 12e6, loss: 0.005,
    minElevation: 25,     // degrees: the dish needs sky above this angle
    skyBlockLimit: 0.4,   // the link fails when more than this fraction of that sky is blocked
    signature: 0.3,       // how loud it is to an enemy looking for emitters (relative)
    band: [[14.0, 14.5], [10.7, 12.7]],
    note: 'Latency 20–60 ms typical (measured median about 26 ms), upload about 5–20 Mbps, 50–100 W, standard kit $349. Ku-band: user uplink 14.0–14.5 GHz, downlink 10.7–12.7 GHz. Needs a clear view of the sky.',
    confidence: 'Reviews and regulatory filings; resellers disagree on speeds',
    sources: [
      { label: 'Starlink review 2026 (measured speeds)', url: 'https://internetinspace.pages.dev/blog/starlink-review-2026' },
      { label: 'Japan MIC filing: Ku-band allocations', url: 'https://www.soumu.go.jp/main_content/000660088.pdf' },
    ],
  },
  cellular: {
    name: 'Cellular', cost: 600, latency: 0.045, capacity: 10e6, loss: 0.01,
    towerRange: 12000,    // m for a low band; higher bands reach less (rangeFactor)
    signature: 0.5,
    bands: {
      B8: { label: 'Band 8 (900 MHz)', f: [[0.880, 0.960]], rangeFactor: 1.0 },
      B3: { label: 'Band 3 (1800 MHz)', f: [[1.710, 1.880]], rangeFactor: 0.55 },
      n78: { label: 'n78 (3.5 GHz)', f: [[3.300, 3.800]], rangeFactor: 0.3 },
    },
    note: 'Industrial routers list at about $250–350 (4G) and $599 (5G). Latency, capacity and tower range had no verified source: assumptions. Lower bands reach further but sit near the 868/915 MHz control-link band.',
    confidence: 'ASSUMPTION for latency, capacity and range; price from retail listings',
    sources: [{ label: 'Teltonika router prices (retailer)', url: 'https://shop.multilink.us/teltonika/' }],
  },
};
