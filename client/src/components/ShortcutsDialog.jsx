import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export const MOD_LABEL = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
import { Kbd } from './ui.jsx';

const SHORTCUTS = [
  ['Open a photo', [MOD_LABEL, 'O']],
  ['Export full resolution', [MOD_LABEL, 'E']],
  ['Undo', [MOD_LABEL, 'Z']],
  ['Redo', [MOD_LABEL, '⇧', 'Z']],
  ['Hold to see the original', ['\\']],
  ['Before / after compare', ['C']],
  ['Rule-of-thirds grid', ['G']],
  ['Crop & rotate', ['R']],
  ['Adjust', ['A']],
  ['Background', ['B']],
  ['Layers', ['L']],
  ['Add text', ['T']],
  ['Delete / duplicate layer', ['⌫', MOD_LABEL + 'D']],
  ['Nudge layer (⇧ for ×10)', ['←', '→', '↑', '↓']],
  ['Previous / next adjustment', ['↑', '↓']],
  ['Nudge adjustment (⇧ for ×10)', ['←', '→']],
  ['Reset a slider', ['double-click']],
  ['Zoom / pan the photo', ['scroll', 'drag']],
  ['Apply / cancel crop', ['↵', 'Esc']],
  ['Swap crop orientation', ['X']],
  ['Nudge crop box (⇧ for ×10)', ['←', '→', '↑', '↓']],
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
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-[22px] bg-ink-850 p-6 text-white shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">Keyboard shortcuts</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/5 hover:text-white">
          <X className="size-4" />
        </button>
      </div>
      <dl className="mt-5 divide-y divide-white/5">
        {SHORTCUTS.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-[13px] text-white/70">{label}</dt>
            <dd className="flex shrink-0 gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
