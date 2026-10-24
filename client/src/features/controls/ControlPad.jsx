import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { ADJUSTMENTS, clampAdjustment, getAdjustment } from '@editmate/shared';
import { useEditor } from '../../state/EditorProvider.jsx';
import { signed } from '../../lib/format.js';
import { cx } from '../../components/ui.jsx';
import { useAutoActions } from '../adjust/AdjustPanel.jsx';

/** Calls `fn` immediately, then repeats with acceleration while held; `onEnd` runs on release. */
function useHoldRepeat() {
  const timer = useRef(null);
  const stop = () => clearTimeout(timer.current);
  useEffect(() => stop, []);

  return (fn, onEnd) => ({
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      let delay = 380;
      const tick = () => {
        fn();
        delay = Math.max(40, delay * 0.8);
        timer.current = setTimeout(tick, delay);
      };
      fn();
      timer.current = setTimeout(tick, delay);
    },
    onPointerUp: () => {
      stop();
      onEnd?.();
    },
    onPointerCancel: () => {
      stop();
      onEnd?.();
    },
  });
}

export function useFocusNavigation() {
  const { ui, setUi, adjustments, preview, commit } = useEditor();
  const latest = useRef(adjustments);
  latest.current = adjustments;

  const move = (direction) => {
    const index = ADJUSTMENTS.findIndex((a) => a.key === ui.focusedKey);
    const next = ADJUSTMENTS[(index + direction + ADJUSTMENTS.length) % ADJUSTMENTS.length];
    setUi({ focusedKey: next.key, group: next.group, tool: 'adjust' });
  };

  const nudge = (amount) => {
    const key = ui.focusedKey;
    preview({ adjustments: { [key]: clampAdjustment(key, latest.current[key] + amount) } });
  };

  return { move, nudge, commit, focused: getAdjustment(ui.focusedKey) };
}

export function ControlPad({ disabled }) {
  const { adjustments } = useEditor();
  const { move, nudge, commit, focused } = useFocusNavigation();
  const auto = useAutoActions();
  const hold = useHoldRepeat();
  const value = adjustments[focused.key];

  const arrow = 'absolute grid size-9 place-items-center rounded-full text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-30';

  return (
    <div className="flex w-[180px] shrink-0 flex-col items-center">
      <div className="flex gap-2">
        <button type="button" disabled={disabled} onClick={auto.autoWhiteBalance} title="Auto white balance" className="hairline h-10 w-14 rounded-full bg-ink-700 text-[11px] font-bold hover:bg-ink-600 disabled:opacity-30">
          AWB
        </button>
        <button type="button" disabled={disabled} onClick={auto.autoTone} title="Auto tone" className="hairline h-10 w-14 rounded-full bg-ink-700 text-[11px] font-bold hover:bg-ink-600 disabled:opacity-30">
          AUTO
        </button>
      </div>

      <div className="hairline relative mt-2.5 size-[150px] rounded-full bg-ink-700" role="group" aria-label={`Nudge ${focused.label}`}>
        <button type="button" disabled={disabled} aria-label="Previous adjustment" className={cx(arrow, 'top-1 left-1/2 -translate-x-1/2')} onClick={() => move(-1)}>
          <ChevronUp className="size-4" />
        </button>
        <button type="button" disabled={disabled} aria-label="Next adjustment" className={cx(arrow, 'bottom-1 left-1/2 -translate-x-1/2')} onClick={() => move(1)}>
          <ChevronDown className="size-4" />
        </button>
        <button type="button" disabled={disabled} aria-label={`Decrease ${focused.label}`} className={cx(arrow, 'top-1/2 left-1 -translate-y-1/2')} {...hold(() => nudge(-1), commit)}>
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" disabled={disabled} aria-label={`Increase ${focused.label}`} className={cx(arrow, 'top-1/2 right-1 -translate-y-1/2')} {...hold(() => nudge(1), commit)}>
          <ChevronRight className="size-4" />
        </button>

        {/* Label and value both live inside the centre disc so nothing is hidden behind it. */}
        <div className="absolute inset-[34px] flex flex-col items-center justify-center gap-0.5 rounded-full bg-ink-900 px-2 shadow-inner">
          <span className="max-w-full truncate text-[9px] font-semibold tracking-wide text-white/45">{focused.label}</span>
          <span className={cx('num text-[15px] leading-none font-medium', value ? 'text-accent' : 'text-white/60')} aria-live="polite">
            {signed(value)}
          </span>
        </div>
      </div>
    </div>
  );
}
