import { useRef, useState } from 'react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { layerBox } from '../../engine/layers.js';
import { CORNERS, SIDES, hitTest, resizeBox, rotationTowards } from '../../engine/layerMath.js';
import { cx } from '../../components/ui.jsx';
import { COARSE_POINTER_QUERY, useMediaQuery } from '../../lib/useMediaQuery.js';
import { useLayerActions } from './useLayerActions.js';

/** Snap the centre to the canvas middle within this fraction of the output. */
const SNAP = 0.012;
const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', e: 'ew-resize', w: 'ew-resize' };

/**
 * Interactive layer editing on top of the photo. Lives inside the zoomed frame, so it works in
 * frame coordinates; handles are counter-scaled by 1/zoom to keep a constant on-screen size.
 * Clicks that miss every layer fall through to the stage (for panning).
 */
export function LayerOverlay({ zoom }) {
  const { base, setUi } = useEditor();
  const { layers, selected, select, previewUpdate, commit } = useLayerActions();
  const rootRef = useRef(null);
  const drag = useRef(null);
  const [guides, setGuides] = useState({ x: false, y: false });
  const [hovering, setHovering] = useState(false);
  // Fingers need bigger targets than a mouse: larger handles and a more forgiving hit area.
  const touch = useMediaQuery(COARSE_POINTER_QUERY);
  const hitSlop = touch ? 16 : 6;
  const handleScale = touch ? 1.7 : 1;

  if (!base) return null;
  const W = base.width;
  const H = base.height;
  const boxes = layers.map((l) => (l.hidden ? null : layerBox(l, W, H)));

  /** Pointer position in output pixels. */
  const toOutput = (e) => {
    const rect = rootRef.current.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H, scale: rect.width / W };
  };

  const begin = (e, mode, layer, box) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, layer, box, start: toOutput(e) };
  };

  const onRootPointerDown = (e) => {
    if (e.button !== 0) return;
    const p = toOutput(e);
    const index = hitTest(boxes, p.x, p.y, hitSlop / p.scale);
    if (index < 0) {
      if (selected) select(null);
      return; // let the stage pan
    }
    const layer = layers[index];
    select(layer.id);
    begin(e, 'move', layer, boxes[index]);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) {
      const p = toOutput(e);
      setHovering(hitTest(boxes, p.x, p.y, hitSlop / p.scale) >= 0);
      return;
    }
    const p = toOutput(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const { layer, box } = d;

    if (d.mode === 'move') {
      let x = layer.x + dx / W;
      let y = layer.y + dy / H;
      const snapX = Math.abs(x - 0.5) < SNAP;
      const snapY = Math.abs(y - 0.5) < SNAP;
      if (snapX) x = 0.5;
      if (snapY) y = 0.5;
      setGuides({ x: snapX, y: snapY });
      previewUpdate(layer.id, { x, y });
      return;
    }

    if (d.mode === 'rotate') {
      previewUpdate(layer.id, { rotation: rotationTowards(box, p.x, p.y, { step: e.shiftKey }) });
      return;
    }

    // Resize. Text scales uniformly from corners; side handles change its wrap width.
    // Images keep their aspect unless Shift is held; shapes are free unless Shift is held.
    const handle = d.mode;
    const isCorner = handle in CORNERS;
    const keepAspect = layer.type === 'text' ? isCorner : layer.type === 'image' ? !e.shiftKey : e.shiftKey && isCorner;
    const { box: next, scale } = resizeBox(box, handle, dx, dy, { keepAspect, minSize: 12 / p.scale });
    const patch = { x: next.cx / W, y: next.cy / H, w: next.w / W };
    if (layer.type === 'text') {
      if (isCorner) patch.size = layer.size * scale;
    } else {
      patch.h = next.h / H;
    }
    previewUpdate(layer.id, patch);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setGuides({ x: false, y: false });
    commit();
  };

  const onDoubleClick = (e) => {
    const p = toOutput(e);
    const index = hitTest(boxes, p.x, p.y, hitSlop / p.scale);
    if (index < 0) return;
    e.stopPropagation(); // don't zoom the stage
    const layer = layers[index];
    select(layer.id);
    setUi({ tool: 'layers' });
    if (layer.type === 'text') requestAnimationFrame(() => document.getElementById('layer-text')?.select());
  };

  const selectedIndex = selected ? layers.indexOf(selected) : -1;
  const box = selectedIndex >= 0 ? boxes[selectedIndex] : null;
  const inv = 1 / zoom;
  const h = inv * handleScale;
  const handles = selected ? [...Object.keys(CORNERS), ...(selected.type === 'image' ? [] : Object.keys(SIDES))] : [];

  return (
    <div
      ref={rootRef}
      className={cx('absolute inset-0', hovering && 'cursor-move')}
      onPointerDown={onRootPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {guides.x && <span className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-rec" style={{ borderLeftWidth: inv }} />}
      {guides.y && <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-rec" style={{ borderTopWidth: inv }} />}

      {box && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: `${(box.cx / W) * 100}%`,
            top: `${(box.cy / H) * 100}%`,
            width: `${(box.w / W) * 100}%`,
            height: `${(box.h / H) * 100}%`,
            transform: `translate(-50%, -50%) rotate(${box.rotation}deg)`,
            boxShadow: `0 0 0 ${inv}px var(--color-sky)`,
          }}
        >
          {/* rotate knob */}
          <span className="absolute bottom-full left-1/2 bg-sky" style={{ width: inv, height: 22 * h, transform: 'translateX(-50%)' }} />
          <span
            className="pointer-events-auto absolute left-1/2 cursor-grab rounded-full border-2 border-sky bg-white active:cursor-grabbing"
            style={{ width: 14 * h, height: 14 * h, bottom: `calc(100% + ${22 * h}px)`, transform: 'translate(-50%, 50%)', borderWidth: 2 * inv }}
            onPointerDown={(e) => begin(e, 'rotate', selected, box)}
            title="Rotate (Shift snaps to 15°)"
          />

          {handles.map((handle) => {
            const [sx, sy] = CORNERS[handle] ?? SIDES[handle];
            return (
              <span
                key={handle}
                onPointerDown={(e) => begin(e, handle, selected, box)}
                className="pointer-events-auto absolute rounded-[3px] border-sky bg-white shadow"
                style={{
                  width: (handle in SIDES ? 8 : 12) * h,
                  height: (handle in SIDES ? 20 : 12) * h,
                  borderWidth: 1.5 * inv,
                  left: `${50 + sx * 50}%`,
                  top: `${50 + sy * 50}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: CURSORS[handle],
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
