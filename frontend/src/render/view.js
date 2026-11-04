// View settings shared between the 3D scene and the dock.
export const view = {
  truth: true, // truth overlay: show every drone where it really is (grey if no sensor has it)
  labels: true, // name tags on every system and drone
  rings: true, // range rings on every system
  trackHi: false, // colour tracks by classification instead of drawing them faint and grey
  baseMap: 'os', // a real world's picture: 'os', 'satellite', 'relief' or 'live'
  mapRoads: false, // roads and names on the map: with satellite, this is the hybrid view
  mapGrid: true, // the national grid on the map
  planView: false, // the camera looks straight down
  me: null, // the player's own position, once asked for: { x, z } in scene units
  replayT: null, // simulated time being reviewed while rewinding, or null when live
  selected: null, // the system the Unit panel is showing
  osm: false, // demo: OpenStreetMap tiles as the picture on the ground
  zone: null, // the area to defend, a planning aid outside the simulation: { points: [[x, z]...], closed }
  spot: null, // a spot the wizard is suggesting: { x, z }
  wizard: 'closed', // 'open', 'collapsed' or 'closed'
  coverageOn: false, // the plan map shows sensor coverage
  coverageThreat: null, // for this drone type, or the first one
};
