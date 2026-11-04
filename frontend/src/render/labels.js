// Name tags: HTML labels pinned over points in the 3D scene.

import { Vector3 } from 'three';

export const hexCss = (c) => '#' + c.toString(16).padStart(6, '0');

export function createLabels(layer, camera) {
  const p = new Vector3();
  return {
    make(text, colour, cls) {
      const el = document.createElement('div');
      el.className = cls; el.textContent = text; el.style.borderColor = colour;
      layer.appendChild(el);
      return el;
    },
    place(el, x, y, z, show) {
      p.set(x, y, z).project(camera);
      if (!show || p.z >= 1) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.left = ((p.x + 1) / 2) * innerWidth + 'px';
      el.style.top = ((1 - p.y) / 2) * innerHeight + 'px';
    },
  };
}
