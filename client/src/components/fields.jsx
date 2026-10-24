import { cx } from './ui.jsx';

/** Labelled range slider used by layer and background properties. */
export function RangeField({ label, value, min, max, step = 1, format = (v) => v, onChange, onCommit }) {
  const pos = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[12px] font-semibold text-white/70">
        {label}
        <span className="num text-white/45">{format(value)}</span>
      </span>
      <input
        type="range"
        className="range mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        style={{ '--fill-from': '0%', '--fill-to': `${pos}%` }}
      />
    </label>
  );
}

const SWATCHES = ['#ffffff', '#111113', '#f4d35e', '#e5484d', '#5ac8fa', '#34d399', '#f4f1ea', '#a78bfa'];

/**
 * Swatches plus a native colour picker. `value` may be null when `allowNone` is set.
 * The picker streams values while dragging: pass `onLive` + `onCommit` to make that one undo step.
 */
export function ColorField({ label, value, onChange, onLive, onCommit, allowNone = false }) {
  return (
    <div>
      <p className="text-[12px] font-semibold text-white/70">{label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {allowNone && (
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="None"
            aria-pressed={value === null}
            className={cx('relative size-6 rounded-full bg-ink-950 ring-1 ring-white/20', value === null && 'ring-2 ring-sky')}
          >
            <span className="absolute inset-x-1 top-1/2 h-px -rotate-45 bg-rec" />
          </button>
        )}
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            aria-pressed={value === c}
            className={cx('size-6 rounded-full ring-1 ring-white/15', value === c && 'ring-2 ring-sky ring-offset-2 ring-offset-ink-850')}
            style={{ background: c }}
          />
        ))}
        <label className="relative size-6 cursor-pointer overflow-hidden rounded-full ring-1 ring-white/20" title="Custom colour">
          <span className="absolute inset-0 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" />
          <input
            type="color"
            value={value ?? '#ffffff'}
            onChange={(e) => (onLive ?? onChange)(e.target.value)}
            onBlur={onCommit}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label}: custom colour`}
          />
        </label>
      </div>
    </div>
  );
}

export function ToggleRow({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-ink-950 p-1">
      {options.map(({ value: v, label: optionLabel, icon: Icon, title }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={title ?? optionLabel}
          onClick={() => onChange(v)}
          className={cx(
            'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold transition-colors',
            value === v ? 'bg-ink-700 text-white' : 'text-white/45 hover:text-white/80',
          )}
        >
          {Icon && <Icon className="size-3.5" />}
          {optionLabel}
        </button>
      ))}
    </div>
  );
}
