// A foot patrol and the vehicles that escort it. Every number here is a labelled assumption, not a real unit's figures, and each
// can be changed in the Sources tab. See docs/PATROL_MODE.md.
//
// walkSpeed: how fast the group walks its route (m/s). escortGap: how far ahead the sensor vehicle and behind the weapon vehicle
// keep, along the route (m). groupSize: how many people walk in the patrol.
export const PATROL = {
  foot: {
    name: 'Foot patrol', walkSpeed: 1.4, escortGap: 40, groupSize: 12, sensor: 'radar_a800', effector: 'missile_rr',
    desc: 'People walking a looped route, with a Blighter A800 radar driving ahead and a Rapid Ranger launcher behind. The patrol halts while the launcher is engaging.',
  },
};
