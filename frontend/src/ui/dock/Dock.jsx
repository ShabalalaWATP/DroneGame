// The SAPIENT panel. Every tab stays mounted, so filters and selections survive switching, but only the visible one refreshes.

import { useState } from 'react';
import { MessagesTab } from './MessagesTab.jsx';
import { NodesTab } from './NodesTab.jsx';
import { PlanTab } from './PlanTab.jsx';
import { NetworkTab } from './NetworkTab.jsx';
import { SpectrumTab } from './SpectrumTab.jsx';
import { LearnTab } from './LearnTab.jsx';
import { CostTab } from './CostTab.jsx';
import { SourcesTab } from './SourcesTab.jsx';

const TABS = [
  ['messages', 'Messages', MessagesTab], ['nodes', 'Nodes', NodesTab], ['plan', 'Plan', PlanTab], ['network', 'Network', NetworkTab],
  ['spectrum', 'Spectrum', SpectrumTab], ['learn', 'Learn', LearnTab], ['cost', 'Cost', CostTab, 'cost'], ['systems', 'Sources', SourcesTab, 'systems'],
];

export function Dock({ open, onClose }) {
  const [tab, setTab] = useState('messages');
  const [max, setMax] = useState(false);
  return (
    <div id="dock" className={`panel${open ? '' : ' hidden'}${max ? ' max' : ''}`}>
      <div className="dock-head">
        <div className="tabs">
          {TABS.map(([id, label]) => <button key={id} data-tab={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        <div>
          <button id="dock-max" title="Make the panel bigger or smaller" onClick={() => setMax((m) => !m)}>⤢</button>
          <button id="dock-close" title="Close" onClick={onClose}>×</button>
        </div>
      </div>
      {TABS.map(([id, , Tab, paneId]) => (
        <div key={id} id={paneId} className={`tabpane${tab === id ? '' : ' hidden'}`} data-pane={id}>
          <Tab active={open && tab === id} />
        </div>
      ))}
    </div>
  );
}
