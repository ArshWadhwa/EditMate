/**
 * Main image canvas viewport supporting pan, zoom, and layer interaction.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Columns2, Grid3x3 } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
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
  const transformRef = useRef(null);
  const stage = useElementSize(stageRef);

  const [zoom, setZoomState] = useState(1);

  const ratio = base ? base.width / base.height : 1;
  const fitWidth = Math.min(stage.width || 800, (stage.height || 600) * ratio);
  const frame = { width: fitWidth, height: fitWidth / ratio };
  const natural = outputSize(image.width, image.height, geometry);
  const displayScale = (frame.width * zoom) / natural.width;

  const setZoom = (next) => {
    const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
    transformRef.current?.setTransform(0, 0, z);
    setZoomState(z);
  };

  useEffect(() => {
    transformRef.current?.resetTransform();
    setZoomState(1);
  }, [base]);

  useEffect(() => {
    const canvas = beforeRef.current;
    if (!canvas || !base) return;
    canvas.width = base.width;
    canvas.height = base.height;
    canvas.getContext('2d').drawImage(base, 0, 0);
  }, [base]);

  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadLayerFonts(layers).then(() => !cancelled && setFontsReady((n) => n + 1));
    return () => {
      cancelled = true;
    };
  }, [layers]);

  useEffect(() => {
    if (!afterRef.current || !output.width) return;
    compose(afterRef.current, { photo: output, mask: maskBase, background, layers, assets: assets.map });
  }, [output, frameId, maskBase, background, layers, assets.map, assets.version, fontsReady]);

  const showAfter = !ui.showOriginal;
  const afterClip = ui.compare ? `inset(0 0 0 ${ui.split * 100}%)` : 'none';
  const showBefore = ui.showOriginal || ui.compare;
  const beforeClip = ui.compare && showAfter ? `inset(0 ${(1 - ui.split) * 100}% 0 0)` : 'none';
  const transparent = background.mode === 'transparent' && maskBase;

  return (
    <>
      <img src={image.url} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-35 blur-3xl" />

      <div className="absolute inset-0 p-3 sm:p-4 lg:left-[208px] lg:p-6" ref={stageRef}>
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={MIN_ZOOM}
          maxScale={MAX_ZOOM}
          centerOnInit
          doubleClick={{ mode: 'toggle', step: 1 }}
          wheel={{ step: 0.1 }}
          panning={{ excluded: ['fabric-overlay-container', 'canvas-container'] }}
          onTransformed={(_ref, state) => setZoomState(state.scale)}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full touch-none select-none overflow-hidden"
            contentClass="!w-full !h-full flex items-center justify-center relative"
          >
            <div
              className={cx('relative shadow-2xl shadow-black/60', transparent && 'bg-checker')}
              style={{
                width: frame.width,
                height: frame.height,
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
          </TransformComponent>
        </TransformWrapper>
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
