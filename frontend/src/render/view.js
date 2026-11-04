// View settings shared between the 3D scene and the dock.
export const view = {
  truth: true, // truth overlay: show every drone where it really is (grey if no sensor has it)
  labels: true, // name tags on every system and drone
  rings: true, // range rings on every system
  trackHi: false, // colour tracks by classification instead of drawing them faint and grey
  replayT: null, // simulated time being reviewed while rewinding, or null when live
};
