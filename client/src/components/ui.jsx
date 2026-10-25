/**
 * Primitive UI components including buttons, panels, tags, and keyboard badges.
 */

const cx = (...classes) => classes.filter(Boolean).join(' ');

export function Panel({ className, children, ...props }) {
  return (
    <section className={cx('rounded-[22px] bg-ink-850', className)} {...props}>
      {children}
    </section>
  );
}

export function Segmented({ options, value, onChange, className, size = 'md', label }) {
  return (
    <div role="tablist" aria-label={label} className={cx('flex rounded-xl bg-ink-950 p-1 text-[12px] font-semibold', className)}>
      {options.map(({ value: v, label: optionLabel, icon: Icon }) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            className={cx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 transition-colors',
              size === 'sm' ? 'py-1.5' : 'py-2',
              active ? 'bg-ink-700 text-white' : 'text-white/45 hover:text-white/80',
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}

export function RoundButton({ label, children, className, active, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'hairline grid size-12 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-35',
        active ? 'bg-white text-ink-950' : 'bg-ink-700 text-white hover:bg-ink-600',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function GlassButton({ children, className, active, ...props }) {
  return (
    <button
      type="button"
      className={cx(
        'glass hairline flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition disabled:opacity-40 sm:h-10 sm:px-4',
        active && 'ring-1 ring-white/50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }) {
  return <kbd className="num rounded-md bg-ink-950 px-1.5 py-0.5 text-[11px] text-white/70 ring-1 ring-white/10">{children}</kbd>;
}

export { cx };
