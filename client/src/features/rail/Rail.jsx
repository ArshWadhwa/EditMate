import { Bookmark, Crop, Eraser, ImageUp, Keyboard, Layers, Redo2, SlidersHorizontal, Sparkles, Undo2 } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { usePresets } from '../presets/PresetsProvider.jsx';
import { API_STATUS_COPY } from '../../lib/useApiStatus.js';
import { cx } from '../../components/ui.jsx';

/** `active` marks the current tool; `selected` marks the open dock tab (quieter). */
function RailButton({ label, shortcut, active, selected, children, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active || selected}
      className={cx(
        'grid size-11 place-items-center rounded-full transition-colors disabled:opacity-30',
        active ? 'bg-white text-ink-950' : selected ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Rail({ onOpenFile, onShowShortcuts }) {
  const { image, ui, setUi, undo, redo, canUndo, canRedo } = useEditor();
  const { status } = usePresets();
  const api = API_STATUS_COPY[status];
  const noImage = !image;

  return (
    <nav
      aria-label="Tools"
      className="flex shrink-0 items-center gap-2 rounded-[22px] bg-ink-850 p-2 lg:w-[68px] lg:flex-col lg:py-4"
    >
      <div className="hairline grid h-9 w-11 shrink-0 place-items-center rounded-lg bg-ink-950 text-[13px] font-extrabold tracking-tight">
        EM
      </div>

      <div className="flex gap-2 lg:mt-8 lg:flex-col lg:gap-3">
        <RailButton label="Open photo" shortcut="⌘O" onClick={onOpenFile}>
          <ImageUp className="size-[18px]" />
        </RailButton>
        <RailButton label="Adjust" shortcut="A" disabled={noImage} active={!noImage && ui.tool === 'adjust'} onClick={() => setUi({ tool: 'adjust' })}>
          <SlidersHorizontal className="size-[18px]" />
        </RailButton>
        <RailButton label="Crop & rotate" shortcut="R" disabled={noImage} active={!noImage && ui.tool === 'crop'} onClick={() => setUi({ tool: 'crop' })}>
          <Crop className="size-[18px]" />
        </RailButton>
        <RailButton label="Background" shortcut="B" disabled={noImage} active={!noImage && ui.tool === 'background'} onClick={() => setUi({ tool: 'background' })}>
          <Eraser className="size-[18px]" />
        </RailButton>
        <RailButton label="Layers: text, shapes, photos" shortcut="L" disabled={noImage} active={!noImage && ui.tool === 'layers'} onClick={() => setUi({ tool: 'layers' })}>
          <Layers className="size-[18px]" />
        </RailButton>
        <RailButton label="Inspire" disabled={noImage} selected={!noImage && ui.dock === 'inspire'} onClick={() => setUi({ tool: 'adjust', dock: 'inspire' })}>
          <Sparkles className="size-[18px]" />
        </RailButton>
        <RailButton label="Presets" disabled={noImage} selected={!noImage && ui.dock === 'presets'} onClick={() => setUi({ tool: 'adjust', dock: 'presets' })}>
          <Bookmark className="size-[18px]" />
        </RailButton>
      </div>

      <div className="mx-1 h-8 w-px bg-white/10 lg:mx-0 lg:my-5 lg:h-px lg:w-8" />

      <div className="flex gap-2 lg:flex-col lg:gap-3">
        <RailButton label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
          <Undo2 className="size-[18px]" />
        </RailButton>
        <RailButton label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo}>
          <Redo2 className="size-[18px]" />
        </RailButton>
        <RailButton label="Keyboard shortcuts" shortcut="?" onClick={onShowShortcuts}>
          <Keyboard className="size-[18px]" />
        </RailButton>
      </div>

      <div className="ml-auto flex items-center gap-2 px-2 lg:mt-auto lg:ml-0 lg:flex-col lg:px-0" title={api.label} role="status">
        <span className={cx('size-2 rounded-full', api.tone)} />
        <span className="label !text-[8px]">API</span>
        <span className="sr-only">{api.label}</span>
      </div>
    </nav>
  );
}
