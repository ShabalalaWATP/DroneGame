// Keyboard shortcuts. Typing into a field never triggers them.

import { useEffect } from 'react';
import { TOOLBAR } from '../sim/config/index.js';
import { view } from '../render/view.js';
import { useGame } from './hooks.js';

export function useHotkeys() {
  const game = useGame();
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const replay = game.getReplay();
      const reviewing = replay && replay.active();
      if (e.key === 'ArrowLeft' && replay) { replay.stepBack(); e.preventDefault(); return; }
      if (e.key === 'ArrowRight' && replay) { replay.stepForward(); e.preventDefault(); return; }
      if (e.key === ' ') {
        e.preventDefault();
        if (reviewing) replay.togglePlay();
        else game.setSpeed(game.clock.speed === 0 ? game.clock.lastSpeed || 1 : 0);
        return;
      }
      if (e.key === 'Escape') { if (game.getTool()) game.setTool(game.getTool()); else game.select(null); return; }
      if (e.key === 'r' || e.key === 'R') { game.setViewOption('rings', !view.rings); return; }
      if (e.key === 't' || e.key === 'T') { game.setViewOption('truth', !view.truth); return; }
      if (e.key === 'l' || e.key === 'L') { game.setViewOption('labels', !view.labels); return; }
      if (e.key === 'x' || e.key === 'X') { game.setTool('sell'); return; }
      const group = TOOLBAR.find((g) => g.key === e.key);
      if (group) game.cycleTool(group);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [game]);
}
