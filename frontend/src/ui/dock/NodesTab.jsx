import { WORLD } from '../../sim/config/index.js';
import { bus } from '../../sim/sapient.js';
import { hex, useGame, useTick } from '../hooks.js';

export function NodesTab({ active }) {
  useTick(active);
  const { net } = useGame().sim;
  const m = WORLD.metresPerUnit;
  return (
    <table id="node-table">
      <thead><tr><th>Node</th><th>SAPIENT type</th><th>Mode</th><th>Task</th><th>Range</th><th>E, N (m)</th><th>Tx</th><th>Rx</th></tr></thead>
      <tbody>
        {[...net.nodes.values()].map((n) => (
          <tr key={n.nodeId}>
            <td><i style={{ background: hex(n.def.color) }} />{n.short}</td>
            <td>{n.def.sapient.nodeType.replace('NODE_TYPE_', '')}</td>
            <td>{n.mode}</td>
            <td>{n.task ? (n.task.drone.track ? n.task.drone.track.short : 'task') : ''}</td>
            <td>{n.def.range ? n.def.range + ' m' : ''}</td>
            <td>{Math.round(n.pos.x * m)}, {Math.round(-n.pos.z * m)}</td>
            <td>{bus.tx.get(n.nodeId) || 0}</td>
            <td>{bus.rx.get(n.nodeId) || 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
