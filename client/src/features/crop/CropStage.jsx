import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { renderGeometry } from '../../engine/geometry.js';
import { applyAdjustments } from '../../engine/pipeline.js';
import { HANDLES, constrainRect, moveRect, resizeRect } from '../../engine/cropMath.js';
import { cx } from '../../components/ui.jsx';
import { useCrop } from './CropProvider.jsx';

/** Longest side of the image shown behind the crop box. */
const DISPLAY_MAX = 1400;
const PADDING = 36;
/** Smallest crop, in on-screen pixels. */
const MIN_SCREEN_SIZE = 40;

const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The whole rotated image (uncropped, unflipped) with the current adjustments, as a canvas. */
function useCropBackdrop() {
  const { image, geometry, adjustments } = useEditor();
  const canvas = useMemo(() => {
    const out = renderGeometry(image.bitmap, { ...geometry, flipH: false, crop: { x: 0, y: 0, width: 1, height: 1 } }, DISPLAY_MAX);
    const ctx = out.getContext('2d', { willReadFrequently: true });
    const pixels = ctx.getImageData(0, 0, out.width, out.height);
    applyAdjustments(pixels.data, pixels.data, out.width, out.height, adjustments);
    ctx.putImageData(pixels, 0, 0);
    return out;
    // Only rotation affects the backdrop's geometry; crop and flip are shown by the overlay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, geometry.quarterTurns, geometry.straighten, adjustments]);
  return canvas;
}

function Backdrop({ canvas }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    el.width = canvas.width;
    el.height = canvas.height;
    el.getContext('2d').drawImage(canvas, 0, 0);
  }, [canvas]);
  return <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden="true" />;
}

export function CropStage() {
  const { frame, rect, setRect, aspect, applyCrop, cancelCrop } = useCrop();
  const backdrop = useCropBackdrop();
  const stageRef = useRef(null);
  const stage = useElementSize(stageRef);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  // Fit the rotated bounding box inside the stage.
  const scale = frame ? Math.max(0.01, Math.min((stage.width - PADDING * 2) / frame.W, (stage.height - PADDING * 2) / frame.H)) : 1;
  const box = frame ? { width: frame.W * scale, height: frame.H * scale } : { width: 0, height: 0 };
  const minSize = MIN_SCREEN_SIZE / scale;

  const startDrag = (mode) => (e) => {
    if (e.button !== 0 || !rect) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: rect };
    setDragging(true);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    const next = d.mode === 'move' ? moveRect(d.start, dx, dy) : resizeRect(d.start, d.mode, dx, dy, aspect, minSize);
    setRect((current) => constrainRect(frame, current, next));
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const onKeyDown = (e) => {
    const step = (e.shiftKey ? 0.1 : 0.01) * Math.max(frame.W, frame.H);
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    e.stopPropagation();
    setRect((current) => constrainRect(frame, current, moveRect(current, ...move)));
  };

  const view = rect && { left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale };

  return (
    <div ref={stageRef} className="absolute inset-0 touch-none select-none" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {frame && view && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" style={box}>
          <Backdrop canvas={backdrop} />

          <div
            role="group"
            tabIndex={0}
            aria-label={`Crop area, ${Math.round(rect.width)} by ${Math.round(rect.height)} pixels. Drag or use arrow keys to move.`}
            onPointerDown={startDrag('move')}
            onKeyDown={onKeyDown}
            className="absolute cursor-move outline-none focus-visible:ring-2 focus-visible:ring-sky"
            style={{ ...view, boxShadow: '0 0 0 9999px rgb(7 7 8 / 0.68)' }}
          >
            <span className="pointer-events-none absolute inset-0 ring-1 ring-white/90" />
            <ThirdsGrid visible={dragging} />

            {HANDLES.map((handle) => (
              <Handle key={handle} handle={handle} onPointerDown={startDrag(handle)} />
            ))}

            <span
              className={cx(
                'num glass hairline pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-[11px] whitespace-nowrap transition-opacity',
                dragging ? 'opacity-100' : 'opacity-0',
              )}
            >
              {Math.round(rect.width)} × {Math.round(rect.height)}
            </span>
          </div>
        </div>
      )}

      <p className="glass hairline pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 rounded-lg px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap text-white/70 lg:block">
        Drag the box or its handles · arrows to nudge · ↵ to apply
      </p>
      {/* Phones: the panel's Apply button is below the fold, so keep the decision on the photo. */}
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 lg:hidden">
        <button type="button" onClick={cancelCrop} className="glass hairline h-10 rounded-xl px-4 text-[13px] font-bold">
          Cancel
        </button>
        <span className="truncate text-[11px] font-semibold text-white/60">Drag the box or its corners</span>
        <button type="button" onClick={applyCrop} className="h-10 rounded-xl bg-white px-4 text-[13px] font-extrabold text-ink-950">
          Apply
        </button>
      </div>
    </div>
  );
}

function ThirdsGrid({ visible }) {
  return (
    <span className={cx('pointer-events-none absolute inset-0 transition-opacity', visible ? 'opacity-100' : 'opacity-40')} aria-hidden="true">
      {[1, 2].map((i) => (
        <span key={`v${i}`} className="absolute inset-y-0 w-px bg-white/40" style={{ left: `${(i * 100) / 3}%` }} />
      ))}
      {[1, 2].map((i) => (
        <span key={`h${i}`} className="absolute inset-x-0 h-px bg-white/40" style={{ top: `${(i * 100) / 3}%` }} />
      ))}
    </span>
  );
}

/** Corners are L-shaped brackets, edges short bars; each has a generous invisible hit area. */
function Handle({ handle, onPointerDown }) {
  const corner = handle.length === 2;
  const pos = {
    top: handle.includes('n') ? 0 : handle.includes('s') ? '100%' : '50%',
    left: handle.includes('w') ? 0 : handle.includes('e') ? '100%' : '50%',
  };

  return (
    <span
      onPointerDown={onPointerDown}
      className="absolute z-10 size-7 -translate-x-1/2 -translate-y-1/2"
      style={{ ...pos, cursor: CURSORS[handle] }}
      aria-hidden="true"
    >
      {corner ? (
        <span
          className="absolute size-4 border-white"
          style={{
            borderTopWidth: handle.includes('n') ? 3 : 0,
            borderBottomWidth: handle.includes('s') ? 3 : 0,
            borderLeftWidth: handle.includes('w') ? 3 : 0,
            borderRightWidth: handle.includes('e') ? 3 : 0,
            top: handle.includes('n') ? 'calc(50% - 1.5px)' : undefined,
            bottom: handle.includes('s') ? 'calc(50% - 1.5px)' : undefined,
            left: handle.includes('w') ? 'calc(50% - 1.5px)' : undefined,
            right: handle.includes('e') ? 'calc(50% - 1.5px)' : undefined,
          }}
        />
      ) : (
        <span
          className={cx('absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white', handle === 'n' || handle === 's' ? 'h-[3px] w-5' : 'h-5 w-[3px]')}
        />
      )}
    </span>
  );
}
