// A number field that commits when the player finishes editing (the browser's change event, not every keystroke), and goes
// back to the last good value if what they typed is not a valid number.

import { useEffect, useRef } from 'react';

export function NumberInput({ value, min = 0, step, onCommit, ...rest }) {
  const ref = useRef(null);
  const good = useRef(value); // the figures it edits live outside React, so a commit may not change the value prop
  const latest = useRef({ min, onCommit });
  latest.current = { min, onCommit };
  useEffect(() => {
    good.current = value;
    if (document.activeElement !== ref.current) ref.current.value = value;
  }, [value]);
  useEffect(() => {
    const el = ref.current;
    const onChange = () => {
      const v = Number(el.value);
      if (el.value !== '' && Number.isFinite(v) && v >= latest.current.min) { good.current = v; latest.current.onCommit(v); } else el.value = good.current;
    };
    el.addEventListener('change', onChange);
    return () => el.removeEventListener('change', onChange);
  }, []);
  return <input ref={ref} type="number" defaultValue={value} step={step} min={min} {...rest} />;
}
