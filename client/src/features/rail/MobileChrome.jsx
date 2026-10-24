import { Bookmark, Crop, Eraser, ImageUp, Layers, Redo2, SlidersHorizontal, Sparkles, Undo2 } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { usePresets } from '../presets/PresetsProvider.jsx';
import { API_STATUS_COPY } from '../../lib/useApiStatus.js';
import { cx } from '../../components/ui.jsx';

/**
 * Mobile tabs. Adjust, Inspire and Presets share the "adjust" tool and differ only in which
 * sheet is shown, matching the desktop dock tabs.
 */
export const MOBILE_TABS = [
  { key: 'adjust', label: 'Adjust', icon: SlidersHorizontal, ui: { tool: 'adjust', sheet: 'adjust' } },
  { key: 'crop', label: 'Crop', icon: Crop, ui: { tool: 'crop' } },
  { key: 'background', label: 'Cut out', icon: Eraser, ui: { tool: 'background' } },
  { key: 'layers', label: 'Layers', icon: Layers, ui: { tool: 'layers' } },
  { key: 'inspire', label: 'Inspire', icon: Sparkles, ui: { tool: 'adjust', sheet: 'inspire', dock: 'inspire' } },
  { key: 'presets', label: 'Presets', icon: Bookmark, ui: { tool: 'adjust', sheet: 'presets', dock: 'presets' } },
];

/** Which mobile tab the current UI state corresponds to. */
export const activeMobileTab = (ui) => (ui.tool === 'adjust' ? ui.sheet ?? 'adjust' : ui.tool);

function IconButton({ label, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}

export function MobileTopBar({ onOpenFile }) {
  const { image, undo, redo, canUndo, canRedo } = useEditor();
  const { status } = usePresets();
  const api = API_STATUS_COPY[status];

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-3 pt-[env(safe-area-inset-top)]">
      <div className="hairline grid h-8 w-10 shrink-0 place-items-center rounded-lg bg-ink-950 text-[12px] font-extrabold tracking-tight">EM</div>
      <div className="min-w-0 flex-1 px-2">
        <p className="truncate text-[13px] font-bold">{image ? image.name : 'EditMate'}</p>
        <p className="flex items-center gap-1.5 text-[10px] text-white/40" title={api.label}>
          <span className={cx('size-1.5 rounded-full', api.tone)} />
          {status === 'online' ? 'Presets sync on' : 'Edits stay on this device'}
        </p>
      </div>
      <IconButton label="Undo" onClick={undo} disabled={!canUndo}>
        <Undo2 className="size-[18px]" />
      </IconButton>
      <IconButton label="Redo" onClick={redo} disabled={!canRedo}>
        <Redo2 className="size-[18px]" />
      </IconButton>
      <IconButton label="Open photo" onClick={onOpenFile}>
        <ImageUp className="size-[18px]" />
      </IconButton>
    </header>
  );
}

export function MobileNav() {
  const { ui, setUi } = useEditor();
  const active = activeMobileTab(ui);

  return (
    <nav aria-label="Tools" className="grid shrink-0 grid-cols-6 border-t border-white/5 bg-ink-900 px-1 pt-1 pb-[max(env(safe-area-inset-bottom),6px)]">
      {MOBILE_TABS.map(({ key, label, icon: Icon, ui: patch }) => (
        <button
          key={key}
          type="button"
          aria-pressed={active === key}
          onClick={() => setUi(patch)}
          className={cx(
            'flex min-w-0 flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold transition-colors',
            active === key ? 'text-white' : 'text-white/40',
          )}
        >
          <span className={cx('grid h-7 w-12 place-items-center rounded-full transition-colors', active === key && 'bg-white text-ink-950')}>
            <Icon className="size-[18px]" />
          </span>
          <span className="max-w-full truncate">{label}</span>
        </button>
      ))}
    </nav>
  );
}
