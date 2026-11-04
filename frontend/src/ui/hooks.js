// How React components reach the game.

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';

export const GameContext = createContext(null);
export const useGame = () => useContext(GameContext);

const noSubscribe = () => () => {};
const zero = () => 0;

// Re-render on the game's panel refresh. A component that is not visible passes false and stops refreshing.
export function useTick(active = true) {
  const game = useGame();
  return useSyncExternalStore(active ? game.subscribe : noSubscribe, active ? game.getTick : zero);
}

// Run a drawing function on animation frames while `active`, at most once every minMs.
export function useAnimation(active, draw, minMs = 0) {
  const latest = useRef(draw);
  latest.current = draw;
  useEffect(() => {
    if (!active) return undefined;
    let id = 0, last = -Infinity;
    const loop = (t) => {
      if (t - last >= minMs) { last = t; latest.current(t); }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active, minMs]);
}

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export const usd = (v) => '$' + Math.round(v).toLocaleString('en-US');
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Offer a file to the player to save.
export function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
