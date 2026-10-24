import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Columns2, Grid3x3 } from 'lucide-react';
import { useEditor, useFrame } from '../../state/EditorProvider.jsx';
import { outputSize } from '../../engine/geometry.js';
import { compose } from '../../engine/composite.js';
import { loadLayerFonts } from '../../engine/layers.js';
import { GlassButton, cx } from '../../components/ui.jsx';
import { HudStrip, MAX_ZOOM, MIN_ZOOM } from './HudStrip.jsx';
import { CompareDivider } from './CompareDivider.jsx';
import { EmptyState } from './EmptyState.jsx';
import { CropStage } from '../crop/CropStage.jsx';
import { LayerOverlay } from '../layers/LayerOverlay.jsx';
import { ExportMenu } from '../export/ExportMenu.jsx';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function Viewport({ onOpenFile }) {
  const { image, ui } = useEditor();

  return (
    <Panel>
      {!image ? <EmptyState onOpenFile={onOpenFile} /> : ui.tool === 'crop' ? <CropStage /> : <EditStage />}
    </Panel>
  );
}

function Panel({ children }) {
  return <section className="relative h-full min-h-0 overflow-hidden rounded-[22px] bg-ink-950">{children}</section>;
}

function EditStage() {
  const { image, base, geometry, background, layers, maskBase, assets, ui, setUi, output, editCount, isExported, isPristine } =
    useEditor();
  const { id: frameId } = useFrame();
  const beforeRef = useRef(null);
  const afterRef = useRef(null);
  const stageRef = useRef(null);
  const stage = useElementSize(stageRef);

  const [zoom, setZoomState] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  // Fit the frame inside the stage, leaving room for the HUD strip on wider screens.
  const ratio = base ? base.width / base.height : 1;
  const fitWidth = Math.min(stage.width, stage.height * ratio);
  const frame = { width: fitWidth, height: fitWidth / ratio };
  const natural = outputSize(image.width, image.height, geometry);
  const displayScale = (frame.width * zoom) / natural.width;

  const clampPan = (p, z) => ({
    x: clamp(p.x, -((z - 1) * frame.width) / 2, ((z - 1) * frame.width) / 2),
    y: clamp(p.y, -((z - 1) * frame.height) / 2, ((z - 1) * frame.height) / 2),
  });

  /** Zooms keeping the point under `focus` (relative to the stage centre) fixed. */
  const setZoom = (next, focus = { x: 0, y: 0 }) => {
    const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
    setPan((p) => {
      const local = { x: (focus.x - p.x) / zoom, y: (focus.y - p.y) / zoom };
      return clampPan({ x: focus.x - local.x * z, y: focus.y - local.y * z }, z);
    });
    setZoomState(z);
  };

  // Reset view when the image or crop changes.
  useEffect(() => {
    setZoomState(1);
    setPan({ x: 0, y: 0 });
  }, [base]);

  useEffect(() => {
    const canvas = beforeRef.current;
    if (!canvas || !base) return;
    canvas.width = base.width;
    canvas.height = base.height;
    canvas.getContext('2d').drawImage(base, 0, 0);
  }, [base]);

  // Re-paint once web fonts used by text layers have loaded (first paint may use a fallback).
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadLayerFonts(layers).then(() => !cancelled && setFontsReady((n) => n + 1));
    return () => {
      cancelled = true;
    };
  }, [layers]);

  // Adjusted photo → background replacement → layers. Cheap enough to redo on every drag.
  useEffect(() => {
    if (!afterRef.current || !output.width) return;
    compose(afterRef.current, { photo: output, mask: maskBase, background, layers, assets: assets.map });
  }, [output, frameId, maskBase, background, layers, assets.map, assets.version, fontsReady]);

  // Non-passive wheel listener so we can prevent page scroll while zooming.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const focus = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
      setZoom(zoom * Math.exp(-e.deltaY * 0.0022), focus);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Touch: two fingers pinch-zoom around their midpoint; one finger pans once zoomed in.
  // Pointers are tracked in the capture phase so a pinch still works over a selected layer.
  const pointers = useRef(new Map());
  const pinch = useRef(null);

  const fromStageCentre = (x, y) => {
    const rect = stageRef.current.getBoundingClientRect();
    return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: fromStageCentre((a.x + b.x) / 2, (a.y + b.y) / 2) };
  };

  const onPointerDownCapture = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { ...pinchState(), zoom };
      drag.current = null;
    }
  };
  const onPointerDown = (e) => {
    if (pinch.current || zoom === 1 || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, pan };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const { dist, mid } = pinchState();
      setZoom((pinch.current.zoom * dist) / Math.max(1, pinch.current.dist), mid);
      return;
    }
    if (!drag.current) return;
    const { x, y, pan: start } = drag.current;
    setPan(clampPan({ x: start.x + e.clientX - x, y: start.y + e.clientY - y }, zoom));
  };
  const endDrag = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
  };

  const showAfter = !ui.showOriginal;
  const afterClip = ui.compare ? `inset(0 0 0 ${ui.split * 100}%)` : 'none';
  // The original sits underneath; hide it unless comparing so transparent areas stay transparent.
  const showBefore = ui.showOriginal || ui.compare;
  const beforeClip = ui.compare && showAfter ? `inset(0 ${(1 - ui.split) * 100}% 0 0)` : 'none';
  const transparent = background.mode === 'transparent' && maskBase;

  return (
    <>
      <img src={image.url} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-3xl" />

      <div className="absolute inset-0 p-3 sm:p-4 lg:left-[208px] lg:p-6">
        <div
          ref={stageRef}
          className={cx('relative size-full touch-none overflow-hidden select-none [-webkit-touch-callout:none]', zoom > 1 && 'cursor-grab active:cursor-grabbing')}
          onPointerDownCapture={onPointerDownCapture}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setZoom(zoom > 1 ? 1 : 2)}
        >
          <div
            className={cx('absolute top-1/2 left-1/2 shadow-2xl shadow-black/60', transparent && 'bg-checker')}
            style={{
              width: frame.width,
              height: frame.height,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <canvas
              ref={beforeRef}
              className={cx('absolute inset-0 size-full', !showBefore && 'invisible')}
              style={{ clipPath: beforeClip }}
              aria-label="Original photo"
            />
            <canvas
              ref={afterRef}
              className={cx('absolute inset-0 size-full', !showAfter && 'invisible')}
              style={{ clipPath: afterClip }}
              aria-label="Edited photo"
            />
            {ui.grid && <ThirdsGrid />}
            {!ui.compare && showAfter && <LayerOverlay zoom={zoom} />}
            {ui.compare && showAfter && <CompareDivider split={ui.split} zoom={zoom} onChange={(split) => setUi({ split })} />}
          </div>
        </div>
      </div>

      <HudStrip zoom={zoom} onZoom={(z) => setZoom(z)} displayScale={displayScale} />

      <div className="absolute top-3 right-3 flex flex-col items-end gap-2 lg:top-5 lg:right-5">
        <div className="flex items-center gap-2">
          <GlassButton aria-pressed={ui.grid} active={ui.grid} onClick={() => setUi({ grid: !ui.grid })} title="Rule-of-thirds grid (G)">
            <Grid3x3 className="size-4" />
            <span className="hidden sm:inline">Grid</span>
          </GlassButton>
          <GlassButton
            aria-pressed={ui.compare}
            active={ui.compare}
            disabled={isPristine}
            onClick={() => setUi({ compare: !ui.compare })}
            title="Before / after (C)"
          >
            <Columns2 className="size-4" />
            <span className="hidden sm:inline">Compare</span>
          </GlassButton>
          <ExportMenu />
        </div>
        {editCount > 0 && (
          <div className="glass hairline hidden items-center gap-2.5 rounded-xl px-3 py-2 lg:flex">
            <span className={cx('size-1.5 rounded-full', isExported ? 'bg-ok' : 'animate-pulse bg-rec')} />
            <span className="num text-[11px] text-white/75">
              {editCount} {editCount === 1 ? 'edit' : 'edits'} · {isExported ? 'exported' : 'not exported'}
            </span>
          </div>
        )}
      </div>

      {ui.showOriginal && (
        <span className="glass hairline absolute bottom-5 left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[11px] font-bold tracking-wider lg:left-[calc(50%+104px)]">
          ORIGINAL
        </span>
      )}
    </>
  );
}

function ThirdsGrid() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {[1, 2].map((i) => (
        <span key={`v${i}`} className="absolute inset-y-0 w-px bg-white/25" style={{ left: `${(i * 100) / 3}%` }} />
      ))}
      {[1, 2].map((i) => (
        <span key={`h${i}`} className="absolute inset-x-0 h-px bg-white/25" style={{ top: `${(i * 100) / 3}%` }} />
      ))}
    </div>
  );
}
