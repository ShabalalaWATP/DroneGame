// Every drone as grouped options, for a select.

import { THREAT_GROUPS } from '../sim/config/index.js';

export const ThreatOptions = ({ text = (d) => d.name }) => THREAT_GROUPS.map((group) => (
  <optgroup key={group.name} label={group.name}>
    {group.drones.map((d) => <option key={d.id} value={d.id}>{text(d)}</option>)}
  </optgroup>
));
