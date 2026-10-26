/**
 * Modal dialog displaying available keyboard shortcuts.
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export const MOD_LABEL = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
import { Kbd } from './ui.jsx';

const SHORTCUTS_LEFT = [
  ['Open a photo', [MOD_LABEL, 'O']],
  ['Export full resolution', [MOD_LABEL, 'E']],
  ['Undo', [MOD_LABEL, 'Z']],
  ['Redo', [MOD_LABEL, '⇧', 'Z']],
  ['Hold for original', ['\\']],
  ['Before / after compare', ['C']],
  ['Rule-of-thirds grid', ['G']],
  ['Crop & rotate tool', ['R']],
  ['Background tool', ['B']],
  ['Layers panel', ['L']],
  ['Presets library popup', ['P']],
];

const SHORTCUTS_RIGHT = [
  ['Add text layer', ['T']],
  ['Pan view (⇧ for fast)', ['W', 'A', 'S', 'D']],
  ['Bottom dial: cycle prop', ['↑', '↓']],
  ['Bottom dial: nudge (⇧ ×5)', ['←', '→']],
  ['Delete / duplicate layer', ['⌫', MOD_LABEL + 'D']],
  ['Reset a slider', ['double-click']],
  ['Zoom / pan image', ['scroll', 'right-drag']],
  ['Apply / cancel crop', ['↵', 'Esc']],
  ['Swap crop orientation', ['X']],
];

export function ShortcutsDialog({ open, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(760px,calc(100vw-32px))] rounded-[22px] bg-ink-850 p-5 sm:p-6 text-white shadow-2xl shadow-black/80 ring-1 ring-white/10 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h2 className="text-[16px] font-bold">Keyboard shortcuts</h2>
          <p className="text-[11px] text-white/45">Quick navigation, camera panning, and editing actions</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white transition"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3.5 grid grid-cols-1 md:grid-cols-2 gap-x-8">
        <div className="divide-y divide-white/5">
          {SHORTCUTS_LEFT.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-[12.5px] text-white/70">{label}</span>
              <span className="flex shrink-0 gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="divide-y divide-white/5">
          {SHORTCUTS_RIGHT.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-[12.5px] text-white/70">{label}</span>
              <span className="flex shrink-0 gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
