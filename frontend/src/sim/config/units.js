// Deployment packs: a military unit and the real systems, vehicles and people assigned to it, kept on the player's profile.
// The ids match Echelon and UnitVehicle in backend/app/account_schemas.py, whose tests read this file.

export const ECHELONS = {
  fireteam: { name: 'Fire team', desc: 'Four soldiers, often with one handheld system.' },
  section: { name: 'Section', desc: 'Eight to ten soldiers: a small counter-drone detachment.' },
  platoon: { name: 'Platoon', desc: 'Around thirty soldiers in three sections.' },
  troop: { name: 'Troop', desc: 'An artillery or air defence platoon, usually with its own sensors and launchers.' },
  company: { name: 'Company', desc: 'Around a hundred soldiers in three platoons.' },
  squadron: { name: 'Squadron', desc: 'A company-sized cavalry, signals or air defence unit.' },
  battery: { name: 'Battery', desc: 'An artillery or air defence company with its radars and launchers.' },
  battalion: { name: 'Battalion', desc: 'Several companies or batteries under one headquarters.' },
};

// shortcut: the patrol work defines the same three vehicles as PATROL_VEHICLES in config/patrol.js; use those once it lands on main.
export const UNIT_VEHICLES = {
  patria: { name: 'Patria 6x6', desc: 'Armoured six-wheeler, 7.5 by 2.9 m. Carries the heaviest systems that ride with a unit.' },
  hilux: { name: 'Toyota Hilux', desc: 'Double-cab pickup, 5.3 by 1.9 m, with its system on the load bed.' },
  mule: { name: 'Mule UGV', desc: 'A tracked uncrewed carrier in the Milrem THeMIS class. Carries light systems.' },
};

export const UNIT_LIMITS = { lines: 40, count: 50, peopleGroups: 20 }; // MAX_UNIT_LINES, MAX_UNIT_COUNT and the people limit in account_schemas.py
