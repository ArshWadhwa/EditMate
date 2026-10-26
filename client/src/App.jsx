/**
 * Root application component managing responsive layout, global shortcuts, and file drop.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImageUp, Lock, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Unlock } from 'lucide-react';
import { ToastProvider } from './components/Toaster.jsx';
import { ShortcutsDialog } from './components/ShortcutsDialog.jsx';
import { Panel, cx } from './components/ui.jsx';
import { EditorProvider, useEditor } from './state/EditorProvider.jsx';
import { PresetsProvider, usePresets } from './features/presets/PresetsProvider.jsx';
import { AllPresetsDialog } from './features/presets/AllPresetsDialog.jsx';
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
  const { allPresetsOpen, openAllPresets, closeAllPresets } = usePresets();
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

  useHotkeys('mod+o', (e) => { e.preventDefault(); chooseFile(); });
  useHotkeys('mod+z', (e) => { e.preventDefault(); if (image) editor.undo(); });
  useHotkeys('mod+shift+z, mod+y', (e) => { e.preventDefault(); if (image) editor.redo(); });
  useHotkeys('mod+e', (e) => { e.preventDefault(); if (image) editor.exportImage(); });
  useHotkeys('mod+d', (e) => { e.preventDefault(); if (image && layerActions.selected) layerActions.duplicate(layerActions.selected.id); });
  useHotkeys('shift+/', () => setShortcutsOpen(true));
  useHotkeys('p', () => openAllPresets());

  useHotkeys('c', () => image && setUi((u) => ({ compare: !u.compare })));
  useHotkeys('g', () => image && setUi((u) => ({ grid: !u.grid })));
  useHotkeys('r', () => image && setUi((u) => ({ tool: u.tool === 'crop' ? 'adjust' : 'crop' })));
  useHotkeys('b', () => image && setUi({ tool: 'background' }));
  useHotkeys('l', () => image && setUi({ tool: 'layers' }));
  useHotkeys('t', () => image && layerActions.addText());

  useHotkeys('backslash', () => image && setUi({ showOriginal: true }), { keydown: true });
  useHotkeys('backslash', () => image && setUi({ showOriginal: false }), { keyup: true });

  useHotkeys('backspace, delete', () => {
    if (image && layerActions.selected && ui.tool !== 'crop') layerActions.remove(layerActions.selected.id);
  });
  useHotkeys('escape', () => {
    if (ui.tool === 'crop') crop.cancelCrop();
    else if (layerActions.selected) layerActions.select(null);
  });

  useHotkeys('up', (e) => { if (image) { e.preventDefault(); focus.move(-1); } });
  useHotkeys('down', (e) => { if (image) { e.preventDefault(); focus.move(1); } });
  useHotkeys('left', (e) => { if (image) { e.preventDefault(); focus.nudge(e.shiftKey ? -5 : -1); focus.commit?.(); } });
  useHotkeys('right', (e) => { if (image) { e.preventDefault(); focus.nudge(e.shiftKey ? 5 : 1); focus.commit?.(); } });

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
      <AllPresetsDialog open={allPresetsOpen} onClose={closeAllPresets} onSavePreset={savePreset} />
    </div>
  );
}

function DesktopLayout({ onOpenFile, onShowShortcuts, onSavePreset }) {
  const { image, ui } = useEditor();
  return (
    <div className="h-full p-3 xl:p-4">
      <div className="hairline mx-auto flex h-full max-w-[1680px] gap-3 rounded-[30px] bg-ink-900 p-3">
        <Rail onOpenFile={onOpenFile} onShowShortcuts={onShowShortcuts} />
        <main className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_320px] grid-rows-[minmax(0,1fr)_236px] gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Viewport onOpenFile={onOpenFile} />
          {!image ? <IdlePanel /> : <ToolPanel tool={ui.tool} onSavePreset={() => onSavePreset()} />}
          {ui.tool === 'crop' ? (
            <>
              <Dock onSavePreset={onSavePreset} />
              <StraightenDial />
            </>
          ) : ui.tool === 'layers' ? (
            <>
              <Dock onSavePreset={onSavePreset} />
              <LayerStackDock />
            </>
          ) : (
            <div className="col-span-2 min-h-0 min-w-0 flex">
              <Dock className="size-full" onSavePreset={onSavePreset} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function LayerStackDock() {
  const { layers, selected, select, reorder, remove, update, addText, addShape } = useLayerActions();
  return (
    <Panel className="flex flex-col p-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="label">Layer Stack</p>
        <span className="num text-[11px] text-white/45">
          {layers.length} {layers.length === 1 ? 'layer' : 'layers'}
        </span>
      </div>
      <div className="scrollbar-thin mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {layers.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-white/35">
            <p className="text-[11px]">No layers yet</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={addText} className="hairline rounded-lg bg-ink-700 px-2 py-1 text-[10px] font-bold hover:bg-ink-600">
                + Text
              </button>
              <button type="button" onClick={() => addShape('rect')} className="hairline rounded-lg bg-ink-700 px-2 py-1 text-[10px] font-bold hover:bg-ink-600">
                + Shape
              </button>
            </div>
          </div>
        ) : (
          [...layers].reverse().map((layer) => {
            const isSelected = selected?.id === layer.id;
            const index = layers.indexOf(layer);
            return (
              <div
                key={layer.id}
                onClick={() => select(layer.id)}
                className={cx(
                  'group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] cursor-pointer transition',
                  isSelected ? 'bg-ink-700 text-white ring-1 ring-sky/50' : 'text-white/60 hover:bg-white/5 hover:text-white',
                )}
              >
                <span className="flex items-center gap-1.5 truncate font-semibold max-w-[120px]">
                  {layer.type === 'text' ? (layer.text.split('\n')[0] || 'Text') : layer.name}
                  {layer.locked && <Lock className="size-2.5 text-amber-400 shrink-0" title="Locked" />}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextLocked = !layer.locked;
                      update(layer.id, { locked: nextLocked });
                      if (nextLocked && selected?.id === layer.id) {
                        select(null);
                      }
                    }}
                    className={cx(
                      'grid size-5 place-items-center rounded hover:bg-white/10',
                      layer.locked ? 'text-amber-400 opacity-100' : 'text-white/60 hover:text-white',
                    )}
                    title={layer.locked ? 'Unlock layer' : 'Lock layer (non-selectable on canvas)'}
                  >
                    {layer.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => update(layer.id, { hidden: !layer.hidden })}
                    className="grid size-5 place-items-center rounded text-white/60 hover:bg-white/10 hover:text-white"
                    title={layer.hidden ? 'Show layer' : 'Hide layer'}
                  >
                    {layer.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </button>
                  <button
                    type="button"
                    disabled={index === layers.length - 1}
                    onClick={() => reorder(layer.id, 1)}
                    className="grid size-5 place-items-center rounded hover:bg-white/10 disabled:opacity-20"
                    title="Bring forward"
                  >
                    <ArrowUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => reorder(layer.id, -1)}
                    className="grid size-5 place-items-center rounded hover:bg-white/10 disabled:opacity-20"
                    title="Send backward"
                  >
                    <ArrowDown className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(layer.id)}
                    className="grid size-5 place-items-center rounded text-rec hover:bg-rec/20"
                    title="Delete layer"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}

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
