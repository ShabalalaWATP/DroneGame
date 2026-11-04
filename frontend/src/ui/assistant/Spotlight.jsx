// A ring around the control the wizard is talking about. It never blocks a click.
// It draws straight into the page, because the wizard's blurred panel would otherwise become what its position is measured from.

import { createPortal } from 'react-dom';
import { useTick } from '../hooks.js';

export function Spotlight({ selector }) {
  useTick();
  const r = document.querySelector(selector)?.getBoundingClientRect();
  if (!r || !r.width) return null; // missing, or in a panel that is not showing
  return createPortal(<div id="wizard-spot" aria-hidden="true" style={{ left: r.left - 4, top: r.top - 4, width: r.width + 8, height: r.height + 8 }} />, document.body);
}
