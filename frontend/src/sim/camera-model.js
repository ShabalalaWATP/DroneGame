// What a camera's optics decide. Pixels across a drone go with its reach over its range: a drone covers 4 pixels at the edge of
// the camera's reach, where it is detected. At 8 it is recognised, the first point at which the airframe can be named, and at 13
// identified, named with more confidence. The thresholds are assumptions, and 4 is the rule every catalogue camera range uses.
// A zoom camera searches at its wide view and zooms to its narrow track view on a cue, which reaches further by their ratio.

export const DETECT_PX = 4, RECOGNISE_PX = 8, IDENTIFY_PX = 13;
export const pixelsOn = (reach, range) => (DETECT_PX * reach) / Math.max(range, 1);

// How sure a camera is of the airframe at this many pixels: 0 means it cannot name it.
export const airframeConfidence = (px) => (px >= IDENTIFY_PX ? 0.95 : px >= RECOGNISE_PX ? 0.85 : 0);

// Channels and their price against both: a visible camera is far cheaper than a thermal core. Assumptions.
export const CHANNELS = {
  visible: { label: 'Visible', price: 0.5 },
  thermal: { label: 'Thermal', price: 0.8 },
  both: { label: 'Visible and thermal', price: 1 },
};
// Sensor widths on offer. Range goes with pixels across for the same view.
export const PIXELS = {
  sd: { label: '640 pixels across', px: 640 },
  hd: { label: '1280 pixels across', px: 1280 },
  fhd: { label: '1920 pixels across', px: 1920 },
};

export const hasZoom = (def) => def.trackFov < def.fov;
export const zoomMax = (def) => (hasZoom(def) ? def.fov / def.trackFov : 1);
