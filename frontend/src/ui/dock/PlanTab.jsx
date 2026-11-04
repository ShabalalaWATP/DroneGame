import { useEffect, useRef } from 'react';
import { DRONES } from '../../sim/config/index.js';
import { view } from '../../render/view.js';
import { useAnimation, useGame, useTick } from '../hooks.js';
import { createPlanCanvas } from './plan-canvas.js';

export function PlanTab({ active }) {
  useTick(active);
  const game = useGame();
  const { sim } = game;
  const canvas = useRef(null), plan = useRef(null);
  const coverageOn = view.coverageOn; // kept in the view settings, so the wizard can show the drone type it is talking about
  const threat = view.coverageThreat ?? Object.keys(DRONES)[0];
  useEffect(() => {
    plan.current = createPlanCanvas(canvas.current, sim);
    return () => plan.current.dispose();
  }, [sim]);
  useAnimation(active, () => plan.current.draw(coverageOn ? threat : null), 200);
  return (
    <>
      <div className="plan-tools">
        <label><input type="checkbox" id="cov-on" checked={coverageOn} onChange={(e) => game.setViewOption('coverageOn', e.target.checked)} /> Sensor coverage for</label>
        <select id="cov-threat" value={threat} onChange={(e) => game.setViewOption('coverageThreat', e.target.value)}>
          {Object.values(DRONES).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.rfEmitter ? 'RF emitter' : 'RF-silent'}, {Math.round((d.alt[0] + d.alt[1]) / 2)} m)</option>)}
        </select>
        <span className="muted" id="cov-legend">{coverageOn && 'red: unseen · green: 1 sensor · blue: 2 · white: 3+'}</span>
      </div>
      <canvas id="plan" ref={canvas} />
      <div className="plan-note">North up, scroll to zoom. Circles are each node's range, lines are links to the fusion node (bright when a message has just been sent), red lines are active engagement tasks, crosses are fused tracks drawn where the fusion node believes they are (gold = confirmed, orange = coasting, grey = tentative; circle = position error), faint lines are bearings no track has claimed, wedges show where cameras are pointing, grey dots are drones nobody has (truth overlay).</div>
    </>
  );
}
