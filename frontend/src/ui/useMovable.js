// Lets a panel be dragged out of the way: spread `handle` on what you drag it by, and `style` and data-movable on the panel.
// A double-click, or the window changing size, sends it back home.

import { useEffect, useRef, useState } from 'react';

const MARGIN = 12;

// Where a panel goes, kept fully on screen. It is anchored to the nearer edge, so a longer panel grows into the free space.
export function placed(x, y, box, w, h) {
  const left = Math.max(0, Math.min(x, w - box.width));
  const top = Math.max(0, Math.min(y, h - box.height));
  const bottom = h - top - box.height;
  return top < bottom
    ? { left, top, bottom: 'auto', maxHeight: h - top - MARGIN, transform: 'none' }
    : { left, top: 'auto', bottom, maxHeight: h - bottom - MARGIN, transform: 'none' };
}

export function useMovable() {
  const [style, setStyle] = useState(null);
  const drag = useRef(null), moved = useRef(false);
  useEffect(() => {
    const home = () => setStyle(null);
    addEventListener('resize', home);
    return () => removeEventListener('resize', home);
  }, []);
  const handle = {
    onPointerDown(e) {
      const button = e.target.closest('button');
      if (e.button !== 0 || (button && button !== e.currentTarget)) return; // buttons inside the handle still click
      const box = e.currentTarget.closest('[data-movable]').getBoundingClientRect();
      drag.current = { x: e.clientX, y: e.clientY, left: box.left, top: box.top, box };
      moved.current = false;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e) {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!moved.current && Math.hypot(dx, dy) < 4) return; // a click, not a drag
      moved.current = true;
      setStyle(placed(d.left + dx, d.top + dy, d.box, innerWidth, innerHeight));
    },
    onPointerUp() { drag.current = null; },
    onDoubleClick(e) { if (!e.target.closest('button')) setStyle(null); },
  };
  return { style, handle, wasDragged: () => moved.current };
}
