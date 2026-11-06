// Simulated people and how well each level of protection shelters them. Every number here is a labelled assumption chosen to teach
// the idea, not casualty data, and each can be changed in the Sources tab.
//
// pCasualty: chance a person at the point of the blast becomes a casualty. reachScale: how far the blast reaches them, as a
// fraction of the drone's casualtyRadius. The chance falls off with distance (see sim/people.js).
export const PEOPLE = {
  open: { name: 'Unarmoured', short: 'open', pCasualty: 0.9, reachScale: 1, color: 0xffb74d, desc: 'In the open, with no protection.' },
  building: { name: 'In a building', short: 'bldg', pCasualty: 0.35, reachScale: 0.6, color: 0x90caf9, desc: 'Inside an ordinary building. Click on a building to place them.' },
  bunker: { name: 'In a bunker', short: 'bunker', pCasualty: 0.03, reachScale: 0.2, color: 0xa5d6a7, desc: 'In a hardened shelter, drawn as a low concrete block.' },
};

export const PEOPLE_LIMITS = { groups: 50, perGroup: 500 };
