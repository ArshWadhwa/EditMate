import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageUp, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { ToastProvider } from './components/Toaster.jsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.jsx';
import { Panel, cx } from './components/ui.jsx';
import { EditorProvider, useEditor } from './state/EditorProvider.jsx';
import { PresetsProvider } from './features/presets/PresetsProvider.jsx';
import { InspirationProvider } from './features/inspire/InspirationProvider.jsx';
import { CropProvider, useCrop } from './features/crop/CropProvider.jsx';
import { Rail } from './features/rail/Rail.jsx';
import { MobileNav, MobileTopBar, activeMobileTab } from './features/rail/MobileChrome.jsx';
import { InspireDock } from './features/inspire/InspireDock.jsx';
import { PresetsDock } from './features/presets/PresetsDock.jsx';
import { Viewport } from './features/viewport/Viewport.jsx';
import { AdjustPanel } from './features/adjust/AdjustPanel.jsx';
import { CropPanel } from './features/crop/CropPanel.jsx';
import { BackgroundPanel } from './features/background/BackgroundPanel.jsx';
import { LayersPanel } from './features/layers/LayersPanel.jsx';
import { useLayerActions } from './features/layers/useLayerActions.js';
import { Dock } from './features/controls/Dock.jsx';
import { StraightenDial } from './features/controls/StraightenDial.jsx';
import { useFocusNavigation } from './features/controls/ControlPad.jsx';
import { SavePresetDialog } from './features/presets/SavePresetDialog.jsx';
import { ACCEPT_ATTR, firstImageFile } from './lib/image.js';
import { useHotkeys } from 'react-hotkeys-hook';
import { DESKTOP_QUERY, useMediaQuery } from './lib/useMediaQuery.js';

export default function App() {
  return (
    <ToastProvider>
      <EditorProvider>
        <PresetsProvider>
          <InspirationProvider>
            <CropProvider>
              <Editor />
            </CropProvider>
          </InspirationProvider>
        </PresetsProvider>
      </EditorProvider>
    </ToastProvider>
  );
}

function Editor() {
  const editor = useEditor();
  const { image, ui, setUi, openFile } = editor;
  const crop = useCrop();
  const focus = useFocusNavigation();
  const layerActions = useLayerActions();
  const fileInput = useRef(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [presetDraft, setPresetDraft] = useState(null);
  const [dragging, setDragging] = useState(false);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const dragDepth = useRef(0);

  const chooseFile = useCallback(() => fileInput.current?.click(), []);
  const savePreset = useCallback((draft = {}) => setPresetDraft(draft), []);

  const run = (fn) => {
    fn();
    return true;
  };

  // Global shortcuts
  useHotkeys('mod+o', (e) => { e.preventDefault(); chooseFile(); });
  useHotkeys('mod+z', (e) => { e.preventDefault(); if (image) editor.undo(); });
  useHotkeys('mod+shift+z, mod+y', (e) => { e.preventDefault(); if (image) editor.redo(); });
  useHotkeys('mod+e', (e) => { e.preventDefault(); if (image) editor.exportImage(); });
  useHotkeys('mod+d', (e) => { e.preventDefault(); if (image && layerActions.selected) layerActions.duplicate(layerActions.selected.id); });
  useHotkeys('shift+/', () => setShortcutsOpen(true));

  // Tool shortcuts
  useHotkeys('c', () => image && setUi((u) => ({ compare: !u.compare })));
  useHotkeys('g', () => image && setUi((u) => ({ grid: !u.grid })));
  useHotkeys('r', () => image && setUi((u) => ({ tool: u.tool === 'crop' ? 'adjust' : 'crop' })));
  useHotkeys('a', () => image && setUi({ tool: 'adjust' }));
  useHotkeys('b', () => image && setUi({ tool: 'background' }));
  useHotkeys('l', () => image && setUi({ tool: 'layers' }));
  useHotkeys('t', () => image && layerActions.addText());

  // Show original (hold backslash)
  useHotkeys('backslash', () => image && setUi({ showOriginal: true }), { keydown: true });
  useHotkeys('backslash', () => image && setUi({ showOriginal: false }), { keyup: true });

  // Layer keys
  useHotkeys('backspace, delete', () => {
    if (image && layerActions.selected && ui.tool !== 'crop') layerActions.remove(layerActions.selected.id);
  });
  useHotkeys('escape', () => {
    if (ui.tool === 'crop') crop.cancelCrop();
    else if (layerActions.selected) layerActions.select(null);
  });

  // Slider navigation
  useHotkeys('up', (e) => { if (image && ui.tool === 'adjust') { e.preventDefault(); focus.move(-1); } });
  useHotkeys('down', (e) => { if (image && ui.tool === 'adjust') { e.preventDefault(); focus.move(1); } });
  useHotkeys('left', (e) => { if (image && ui.tool === 'adjust') { e.preventDefault(); focus.nudge(e.shiftKey ? -10 : -1); } });
  useHotkeys('right', (e) => { if (image && ui.tool === 'adjust') { e.preventDefault(); focus.nudge(e.shiftKey ? 10 : 1); } });

  // Safety net: any drop or cancelled drag anywhere ends the overlay, even if a child handled it.
  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0;
      setDragging(false);
    };
    window.addEventListener('drop', reset, true);
    window.addEventListener('dragend', reset, true);
    return () => {
      window.removeEventListener('drop', reset, true);
      window.removeEventListener('dragend', reset, true);
    };
  }, []);

  const dropHandlers = {
    onDragEnter: (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = firstImageFile(e.dataTransfer.files);
      if (file) openFile(file);
    },
  };

  return (
    <div className="h-full" {...dropHandlers}>
      {desktop ? (
        <DesktopLayout onOpenFile={chooseFile} onShowShortcuts={() => setShortcutsOpen(true)} onSavePreset={savePreset} />
      ) : (
        <MobileLayout onOpenFile={chooseFile} onSavePreset={savePreset} />
      )}

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const file = firstImageFile(e.target.files);
          if (file) openFile(file);
          e.target.value = '';
        }}
      />

      <div
        aria-hidden={!dragging}
        className={cx(
          'pointer-events-none fixed inset-3 z-40 grid place-items-center rounded-[30px] border-2 border-dashed border-accent bg-ink-950/80 backdrop-blur-sm transition-opacity',
          dragging ? 'opacity-100' : 'opacity-0',
        )}
      >
        <p className="flex items-center gap-3 text-[18px] font-bold">
          <ImageUp className="size-6 text-accent" />
          Drop to open {image ? 'a new photo' : 'your photo'}
        </p>
      </div>

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SavePresetDialog draft={presetDraft} onClose={() => setPresetDraft(null)} />
    </div>
  );
}

/** ≥1024 px: side rail, viewport + tool panel on top, dock + dial below. */
function DesktopLayout({ onOpenFile, onShowShortcuts, onSavePreset }) {
  const { image, ui } = useEditor();
  return (
    <div className="h-full p-3 xl:p-4">
      <div className="hairline mx-auto flex h-full max-w-[1680px] gap-3 rounded-[30px] bg-ink-900 p-3">
        <Rail onOpenFile={onOpenFile} onShowShortcuts={onShowShortcuts} />
        <main className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_320px] grid-rows-[minmax(0,1fr)_236px] gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Viewport onOpenFile={onOpenFile} />
          {!image ? <IdlePanel /> : <ToolPanel tool={ui.tool} onSavePreset={() => onSavePreset()} />}
          <Dock onSavePreset={onSavePreset} />
          <StraightenDial />
        </main>
      </div>
    </div>
  );
}

/**
 * <1024 px: an app-style layout that fits the screen without page scrolling.
 * Top bar, the photo filling the free space, a scrollable sheet for the active tool, tab bar.
 */
function MobileLayout({ onOpenFile, onSavePreset }) {
  const { image, ui } = useEditor();
  const tab = activeMobileTab(ui);

  return (
    <div className="flex h-[100dvh] flex-col bg-ink-900">
      <MobileTopBar onOpenFile={onOpenFile} />
      <div className="min-h-0 flex-1 px-2">
        <Viewport onOpenFile={onOpenFile} />
      </div>
      {image && (
        <>
          <section
            aria-label="Tool options"
            className="scrollbar-none h-[42dvh] max-h-[460px] shrink-0 overflow-y-auto overscroll-contain px-2 pt-2 pb-2 md:h-[40dvh] [@media(max-height:640px)]:h-[36dvh]"
          >
            <MobileSheet tab={tab} onSavePreset={onSavePreset} />
          </section>
          <MobileNav />
        </>
      )}
    </div>
  );
}

function MobileSheet({ tab, onSavePreset }) {
  // Panels are cards; stretch them to the sheet so short ones don't float.
  const fill = 'flex min-h-full flex-col [&>section]:flex-1';
  if (tab === 'crop') {
    return (
      <div className="flex min-h-full flex-col gap-2 md:flex-row">
        <div className="flex flex-1 flex-col [&>section]:flex-1">
          <CropPanel />
        </div>
        <div className="shrink-0 md:w-[260px] [&>section]:h-[230px] md:[&>section]:h-full">
          <StraightenDial />
        </div>
      </div>
    );
  }
  if (tab === 'inspire' || tab === 'presets') {
    return (
      <div className={fill}>
        <Panel className={cx('flex flex-col gap-4 p-4', tab === 'inspire' && 'md:flex-row md:flex-wrap')}>
          {tab === 'inspire' ? <InspireDock onSavePreset={onSavePreset} /> : <PresetsDock onSavePreset={onSavePreset} />}
        </Panel>
      </div>
    );
  }
  return (
    <div className={fill}>
      <ToolPanel tool={tab === 'adjust' ? 'adjust' : tab} onSavePreset={() => onSavePreset()} />
    </div>
  );
}

function ToolPanel({ tool, onSavePreset }) {
  if (tool === 'crop') return <CropPanel />;
  if (tool === 'background') return <BackgroundPanel />;
  if (tool === 'layers') return <LayersPanel />;
  return <AdjustPanel onSavePreset={onSavePreset} />;
}

function IdlePanel() {
  const steps = [
    { Icon: ImageUp, title: 'Open a photo', body: 'JPEG, PNG, WebP or AVIF, up to 50 MP.' },
    { Icon: SlidersHorizontal, title: 'Edit with instant feedback', body: 'Light, colour, crop and effects, all non-destructive.' },
    { Icon: Sparkles, title: 'Borrow a look', body: 'Drop an inspiration image to get a recipe for your photo.' },
  ];
  return (
    <Panel className="flex flex-col p-5">
      <h2 className="text-[19px] font-bold tracking-tight">EditMate</h2>
      <p className="mt-1 text-[12px] text-white/45">Recreate the look of any photo you love.</p>
      <ol className="mt-6 space-y-5">
        {steps.map(({ Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="hairline grid size-9 shrink-0 place-items-center rounded-full bg-ink-700">
              <Icon className="size-4 text-white/80" />
            </span>
            <div>
              <p className="text-[13px] font-bold">{title}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-white/45">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-auto flex items-center gap-2 pt-6 text-[11px] text-white/35">
        <ShieldCheck className="size-3.5 text-ok" />
        Your photos are processed locally and never uploaded.
      </p>
    </Panel>
  );
}
