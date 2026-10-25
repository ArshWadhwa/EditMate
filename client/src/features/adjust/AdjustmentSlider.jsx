/**
 * Individual slider control for tuning a specific image adjustment parameter.
 */

import { memo } from 'react';
import { signed } from '../../lib/format.js';
import { cx } from '../../components/ui.jsx';

export const AdjustmentSlider = memo(function AdjustmentSlider({ adjustment, value, focused, onPreview, onCommit, onFocus, onReset }) {
  const { key, label, min, max } = adjustment;
  const pos = ((value - min) / (max - min)) * 100;
  const origin = min < 0 ? 50 : 0;
  const changed = value !== 0;
  const id = `adj-${key}`;

  return (
    <div className="relative" onDoubleClick={() => changed && onReset(key)}>
      {focused && <span className="absolute top-0 -left-5 h-full w-0.5 rounded-full bg-accent" aria-hidden="true" />}
      <div className="flex items-center justify-between">
        <label htmlFor={id} className={cx('text-[13px] font-semibold select-none', !changed && 'text-white/55')}>
          {label}
        </label>
        <output htmlFor={id} className={cx('num text-[13px] select-none', changed ? 'text-accent' : 'text-white/35')}>
          {signed(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="range mt-1.5"
        min={min}
        max={max}
        step={1}
        value={value}
        onFocus={() => onFocus(key)}
        onChange={(e) => onPreview(key, Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        style={{ '--fill-from': `${Math.min(origin, pos)}%`, '--fill-to': `${Math.max(origin, pos)}%` }}
      />
    </div>
  );
});
