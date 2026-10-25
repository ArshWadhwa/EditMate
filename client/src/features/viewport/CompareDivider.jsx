/**
 * Draggable before/after comparison split view divider.
 */

import { ChevronsLeftRight } from 'lucide-react';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function CompareDivider({ split, zoom, onChange }) {
  const updateFromPointer = (e) => {
    const frame = e.currentTarget.parentElement.getBoundingClientRect();
    onChange(clamp01((e.clientX - frame.left) / frame.width));
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromPointer(e);
  };

  const onPointerMove = (e) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) updateFromPointer(e);
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') onChange(clamp01(split - step));
    else if (e.key === 'ArrowRight') onChange(clamp01(split + step));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Before and after divider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(split * 100)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      onDoubleClick={(e) => e.stopPropagation()}
      className="group absolute inset-y-0 -ml-4 w-8 cursor-ew-resize touch-none focus-visible:outline-none"
      style={{ left: `${split * 100}%` }}
    >
      <span className="absolute inset-y-0 left-1/2 bg-white/90" style={{ width: `${1 / zoom}px` }} />
      <span
        className="glass hairline absolute top-1/2 left-1/2 grid size-10 place-items-center rounded-full shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-sky"
        style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
      >
        <ChevronsLeftRight className="size-4" />
      </span>
      <span
        className="label absolute bottom-4 right-full mr-3 !text-white/85 [text-shadow:0_1px_6px_rgb(0_0_0/0.7)]"
        style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'right bottom' }}
      >
        Before
      </span>
      <span
        className="label absolute bottom-4 left-full ml-3 !text-white/85 [text-shadow:0_1px_6px_rgb(0_0_0/0.7)]"
        style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'left bottom' }}
      >
        After
      </span>
    </div>
  );
}
