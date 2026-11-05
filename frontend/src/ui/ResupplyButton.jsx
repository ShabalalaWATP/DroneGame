// Buy back the rounds launchers have used. Only shown between waves, and only when something is short.

import { money } from '../sim/economy.js';
import { canResupply, resupplyNeed } from '../sim/magazine.js';
import { useGame } from './hooks.js';

export function ResupplyButton() {
  const { sim, commands } = useGame();
  const { state, structures } = sim;
  const { rounds, cost } = resupplyNeed(structures);
  if (!canResupply(state) || !rounds) return null;
  return (
    <button className="btn-resupply" title="Fill every launcher's magazine and storage. If the budget runs short, the emptiest are filled first" onClick={() => commands.resupply()}>
      Resupply {rounds} round{rounds === 1 ? '' : 's'} ({state.sandbox ? 'free' : money(cost)})
    </button>
  );
}
