/**
 * Dial control for fine-angle photo straightening and rotation.
 */

import { useRef } from 'react';
import { FlipHorizontal2, RotateCcwSquare } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { outputSize } from '../../engine/geometry.js';
import { signedFixed } from '../../lib/format.js';
import { Panel, cx } from '../../components/ui.jsx';
import { useGeometryActions } from '../crop/CropProvider.jsx';

const LIMIT = 45;
const DIAL_RATIO = 2;

const round1 = (v) => Math.round(v * 10) / 10;
const clampAngle = (v) => Math.max(-LIMIT, Math.min(LIMIT, v));
const polar = (deg, r) => {
  const t = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(t), 100 + r * Math.sin(t)];
};

const TICKS = Array.from({ length: 120 }, (_, i) => {
  const a = i * 3;
  const major = a % 30 === 0;
  const [x1, y1] = polar(a, 92);
  const [x2, y2] = polar(a, major ? 80 : 86);
  return { key: a, x1, y1, x2, y2, major };
});

const LABELS = [
  [0, '0'],
  [90, '+45'],
  [180, '±'],
  [270, '−45'],
].map(([a, text]) => {
  const [x, y] = polar(a, 68);
  return { key: a, x, y: y + 3, text };
});

export function StraightenDial() {
  const { image, geometry } = useEditor();
  const { previewStraighten, commitStraighten, setStraighten, rotateLeft, flip } = useGeometryActions();
  const drag = useRef(null);
  const disabled = !image;
  const value = geometry.straighten;

  const pointerAngle = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return (Math.atan2(e.clientY - (rect.top + rect.height / 2), e.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI;
  };

  const onPointerDown = (e) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { start: pointerAngle(e), value };
  };

  const onPointerMove = (e) => {
    if (!drag.current) return;
    let delta = pointerAngle(e) - drag.current.start;
    delta = ((delta + 540) % 360) - 180;
    let next = round1(clampAngle(drag.current.value + delta / DIAL_RATIO));
    if (Math.abs(next) < 0.4) next = 0; 
    previewStraighten(next);
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    commitStraighten();
  };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 1 : 0.1;
    const keys = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
    if (e.key === 'Home') setStraighten(0);
    else if (keys[e.key] !== undefined) setStraighten(round1(clampAngle(value + keys[e.key])));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const size = image && outputSize(image.width, image.height, geometry);

  return (
    <Panel className="relative flex flex-col items-center overflow-hidden p-4">
      <span className={cx('num rounded-md px-2.5 py-0.5 text-[12px] font-extrabold text-ink-950', value ? 'bg-sky' : 'bg-white/70')}>
        {signedFixed(value)}°
      </span>

      <svg
        viewBox="0 0 200 200"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Straighten"
        aria-valuemin={-LIMIT}
        aria-valuemax={LIMIT}
        aria-valuenow={value}
        aria-valuetext={`${value} degrees`}
        aria-disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => !disabled && setStraighten(0)}
        className={cx('group mt-1 size-[160px] touch-none outline-none select-none', disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing')}
      >
        <circle cx="100" cy="100" r="96" fill="#111113" stroke="rgb(255 255 255 / 0.08)" strokeWidth="2" className="group-focus-visible:stroke-sky" />
        <g>
          {TICKS.map(({ key, x1, y1, x2, y2, major }) => (
            <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={`rgb(255 255 255 / ${major ? 0.7 : 0.25})`} strokeWidth={major ? 1.4 : 1} />
          ))}
          {LABELS.map(({ key, x, y, text }) => (
            <text key={key} x={x} y={y} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono" fill="rgb(255 255 255 / 0.55)">
              {text}
            </text>
          ))}
        </g>
        <circle cx="100" cy="100" r="40" fill="#1b1b1e" stroke="rgb(255 255 255 / 0.1)" />
        <g transform={`rotate(${value * DIAL_RATIO} 100 100)`}>
          <path d="M100 66 L108 104 L100 98 L92 104 Z" fill="white" />
          <line x1="100" y1="6" x2="100" y2="20" stroke="var(--color-rec)" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <text x="100" y="124" textAnchor="middle" fontSize="8" letterSpacing="1.5" fill="rgb(255 255 255 / 0.45)" fontWeight="700">
          STRAIGHTEN
        </text>
      </svg>

      <div className="absolute inset-x-4 bottom-3 flex items-center justify-between gap-2">
        <span className="num truncate text-[10px] text-white/45">{size ? `${size.width} × ${size.height}` : 'No photo'}</span>
        <div className="flex gap-1.5">
          <button type="button" disabled={disabled} onClick={rotateLeft} title="Rotate left 90°" aria-label="Rotate left 90°" className="grid size-7 place-items-center rounded-full bg-ink-700 hover:bg-ink-600 disabled:opacity-30">
            <RotateCcwSquare className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={flip}
            aria-pressed={geometry.flipH}
            title="Flip horizontally"
            aria-label="Flip horizontally"
            className={cx('grid size-7 place-items-center rounded-full disabled:opacity-30', geometry.flipH ? 'bg-white text-ink-950' : 'bg-ink-700 hover:bg-ink-600')}
          >
            <FlipHorizontal2 className="size-3.5" />
          </button>
        </div>
      </div>
    </Panel>
  );
}
