// The wizard's optional people step: place groups of simulated people, so a rehearsal shows what an attack would do to them.

import { useEffect } from 'react';
import { useGame } from '../hooks.js';
import { PeopleChoice } from '../PeoplePicker.jsx';

export function PeopleStep({ next }) {
  const game = useGame();
  const placed = game.sim.people.reduce((sum, g) => sum + g.count, 0);
  useEffect(() => { // place while the step is open, and stop when it closes (setTool toggles)
    if (game.getTool() !== 'people') game.setTool('people');
    return () => { if (game.getTool() === 'people') game.setTool('people'); };
  }, [game]);
  return (
    <>
      <p>Add the people you want to protect: staff in the open, in buildings or in a bunker. A group in a building must be placed on one.</p>
      <div id="wz-people"><PeopleChoice /></div>
      <div className="wz-actions">
        <button className={placed ? 'wz-go' : 'wz-narrow'} onClick={next}>{placed ? 'Next' : 'Skip this step'}</button>
      </div>
    </>
  );
}
