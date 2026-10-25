/**
 * Main image canvas viewport supporting pan, zoom, and layer interaction.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  return <section className="relative h-full min-h-0 overflow-hidden rounded-[22px] bg-ink-950" onContextMenu={(e) => e.preventDefault()}>{children}</section>;
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
    if (transformRef.current?.centerView) {
      transformRef.current.centerView(z, 0);
    } else if (transformRef.current?.setTransform && stage.width && stage.height) {
      const x = (stage.width - frame.width * z) / 2;
      const y = (stage.height - frame.height * z) / 2;
      transformRef.current.setTransform(x, y, z, 0);
    }
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

  const clampCoords = useCallback(
    (x, y, scale) => {
      const sw = stage.width || 800;
      const sh = stage.height || 600;
      const fw = frame.width || sw;
      const fh = frame.height || sh;

      const pic0Left = (sw - fw) / 2;
      const pic0Right = (sw + fw) / 2;
      const pic0Top = (sh - fh) / 2;
      const pic0Bottom = (sh + fh) / 2;

      const minMargin = Math.max(40, Math.min(80, Math.min(fw, fh) * scale * 0.25));

      let minX = minMargin - pic0Right * scale;
      let maxX = sw - minMargin - pic0Left * scale;
      let minY = minMargin - pic0Bottom * scale;
      let maxY = sh - minMargin - pic0Top * scale;

      if (minX > maxX) {
        const mid = (minX + maxX) / 2;
        minX = mid;
        maxX = mid;
      }
      if (minY > maxY) {
        const mid = (minY + maxY) / 2;
        minY = mid;
        maxY = mid;
      }

      const clampedX = Math.max(minX, Math.min(maxX, x));
      const clampedY = Math.max(minY, Math.min(maxY, y));

      return { clampedX, clampedY };
    },
    [stage.width, stage.height, frame.width, frame.height],
  );

  const customTransform = useCallback(
    (x, y, scale) => {
      const { clampedX, clampedY } = clampCoords(x, y, scale);
      if (transformRef.current?.instance?.state) {
        transformRef.current.instance.state.positionX = clampedX;
        transformRef.current.instance.state.positionY = clampedY;
      }
      return `translate3d(${clampedX}px, ${clampedY}px, 0px) scale(${scale})`;
    },
    [clampCoords],
  );

  const onPanning = useCallback(
    (ref) => {
      const { scale, positionX, positionY } = ref.state;
      const { clampedX, clampedY } = clampCoords(positionX, positionY, scale);
      if (clampedX !== positionX || clampedY !== positionY) {
        if (ref.instance?.state) {
          ref.instance.state.positionX = clampedX;
          ref.instance.state.positionY = clampedY;
        }
        if (ref.instance?.startCoords) {
          ref.instance.startCoords.x += positionX - clampedX;
          ref.instance.startCoords.y += positionY - clampedY;
        }
      }
    },
    [clampCoords],
  );

  const panBy = useCallback(
    (dx, dy) => {
      if (!transformRef.current) return;
      const state = transformRef.current.instance?.state;
      const currentX = state?.positionX ?? 0;
      const currentY = state?.positionY ?? 0;
      const currentScale = state?.scale ?? zoom;

      const targetX = currentX + dx;
      const targetY = currentY + dy;
      const { clampedX, clampedY } = clampCoords(targetX, targetY, currentScale);

      if (transformRef.current.setTransform) {
        transformRef.current.setTransform(clampedX, clampedY, currentScale, 100);
      }
    },
    [clampCoords, zoom],
  );

  const resetPan = useCallback(() => {
    if (transformRef.current?.centerView) {
      transformRef.current.centerView(zoom, 180);
    } else if (transformRef.current?.setTransform && stage.width && stage.height) {
      const x = (stage.width - frame.width * zoom) / 2;
      const y = (stage.height - frame.height * zoom) / 2;
      transformRef.current.setTransform(x, y, zoom, 180);
    }
  }, [zoom, stage.width, stage.height, frame.width, frame.height]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const target = e.target;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        target?.closest?.('[contenteditable="true"]')
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const step = e.shiftKey ? 150 : 60;

      if (key === 'w') {
        panBy(0, step);
        e.preventDefault();
      } else if (key === 's') {
        panBy(0, -step);
        e.preventDefault();
      } else if (key === 'a') {
        panBy(step, 0);
        e.preventDefault();
      } else if (key === 'd') {
        panBy(-step, 0);
        e.preventDefault();
      } else if (e.key === 'Home') {
        resetPan();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [panBy, resetPan]);

  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;

    let isRightDragging = false;
    let startX = 0;
    let startY = 0;
    let startPosX = 0;
    let startPosY = 0;
    let currentScale = 1;

    const onMouseDown = (e) => {
      if (e.button === 2) {
        isRightDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const state = transformRef.current?.instance?.state;
        startPosX = state?.positionX ?? 0;
        startPosY = state?.positionY ?? 0;
        currentScale = state?.scale ?? 1;
        document.body.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onMouseMove = (e) => {
      if (!isRightDragging) return;
      if ((e.buttons & 2) === 0) {
        isRightDragging = false;
        document.body.style.cursor = '';
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const targetX = startPosX + dx;
      const targetY = startPosY + dy;
      const { clampedX, clampedY } = clampCoords(targetX, targetY, currentScale);

      if (transformRef.current?.setTransform) {
        transformRef.current.setTransform(clampedX, clampedY, currentScale, 0);
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseUp = (e) => {
      if (isRightDragging && (e.button === 2 || (e.buttons & 2) === 0)) {
        isRightDragging = false;
        document.body.style.cursor = '';
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    stageEl.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    stageEl.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      document.body.style.cursor = '';
      stageEl.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      stageEl.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, [clampCoords]);

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
          limitToBounds={false}
          smooth={false}
          doubleClick={{ mode: 'toggle', step: 1 }}
          wheel={{ step: 0.05 }}
          panning={{ allowLeftClickPan: false, allowRightClickPan: true }}
          customTransform={customTransform}
          onPanning={onPanning}
          onTransform={(ref, state) => setZoomState(state?.scale ?? ref.state.scale)}
          onZoom={(ref) => setZoomState(ref.state.scale)}
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
              {!ui.compare && showAfter && <LayerOverlay zoom={zoom} frame={frame} />}
              {ui.compare && showAfter && <CompareDivider split={ui.split} zoom={zoom} onChange={(split) => setUi({ split })} />}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      <HudStrip
        zoom={zoom}
        onZoom={(z) => setZoom(z)}
        onPan={panBy}
        onResetPan={resetPan}
        displayScale={displayScale}
      />

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
