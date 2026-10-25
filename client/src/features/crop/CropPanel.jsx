/**
 * Panel for aspect ratio selection, rotation, and crop confirmation.
 */

import { Check, FlipHorizontal2, Maximize, RectangleHorizontal, RectangleVertical, RotateCcw, RotateCcwSquare, RotateCwSquare } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { isDefaultGeometry } from '../../engine/geometry.js';
import { signedFixed } from '../../lib/format.js';
import { Panel, RoundButton, cx } from '../../components/ui.jsx';
import { ASPECTS, useCrop, useGeometryActions } from './CropProvider.jsx';

function RatioInput({ label, value, onChange }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={100}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="num h-10 w-full min-w-0 rounded-xl bg-ink-950 px-3 text-center text-base ring-1 lg:text-[14px] ring-white/10 outline-none focus:ring-sky [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

export function CropPanel() {
  const { geometry, resetGeometry } = useEditor();
  const { rect, ratio, aspectKey, setAspect, portrait, togglePortrait, custom, setCustom, resetBox, applyCrop, cancelCrop } = useCrop();
  const { rotateLeft, rotateRight, flip } = useGeometryActions();

  const canSwap = ratio && ratio[0] !== ratio[1];
  const labelFor = ({ key, label }) => label ?? (aspectKey === key ? `${ratio[0]}:${ratio[1]}` : key);

  return (
    <Panel className="flex min-h-0 flex-col overflow-y-auto p-5 scrollbar-none">
      <h2 className="text-[19px] font-bold tracking-tight">Crop &amp; rotate</h2>
      <p className="num mt-1 text-[12px] text-white/45">
        {rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)} px` : '—'} · straighten {signedFixed(geometry.straighten)}°
      </p>

      <div className="mt-6 flex items-center justify-between">
        <p className="label">Aspect ratio</p>
        <button
          type="button"
          onClick={togglePortrait}
          disabled={!canSwap}
          aria-label={portrait ? 'Switch to landscape' : 'Switch to portrait'}
          title="Swap orientation (X)"
          className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-30"
        >
          {ratio && ratio[0] < ratio[1] ? <RectangleVertical className="size-3.5" /> : <RectangleHorizontal className="size-3.5" />}
          Swap
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {ASPECTS.map((aspect) => (
          <button
            key={aspect.key}
            type="button"
            aria-pressed={aspectKey === aspect.key}
            onClick={() => setAspect(aspect.key)}
            className={cx(
              'h-10 rounded-xl text-[12px] font-bold transition-colors',
              aspect.key === 'custom' && 'col-span-2',
              aspectKey === aspect.key ? 'bg-white text-ink-950' : 'bg-ink-700 text-white/70 hover:text-white',
            )}
          >
            {labelFor(aspect)}
          </button>
        ))}
      </div>

      {aspectKey === 'custom' && (
        <div className="mt-3 flex items-center gap-2">
          <RatioInput label="Ratio width" value={custom.w} onChange={(w) => setCustom({ w })} />
          <span className="num text-white/40">:</span>
          <RatioInput label="Ratio height" value={custom.h} onChange={(h) => setCustom({ h })} />
        </div>
      )}

      <p className="label mt-6">Orientation</p>
      <div className="mt-3 flex gap-3">
        <RoundButton label="Rotate left 90°" onClick={rotateLeft}>
          <RotateCcwSquare className="size-4" />
        </RoundButton>
        <RoundButton label="Rotate right 90°" onClick={rotateRight}>
          <RotateCwSquare className="size-4" />
        </RoundButton>
        <RoundButton label="Flip horizontally" active={geometry.flipH} onClick={flip}>
          <FlipHorizontal2 className="size-4" />
        </RoundButton>
        <RoundButton label="Maximise crop box" onClick={resetBox}>
          <Maximize className="size-4" />
        </RoundButton>
        <RoundButton label="Reset crop & rotation" disabled={isDefaultGeometry(geometry)} onClick={resetGeometry}>
          <RotateCcw className="size-4" />
        </RoundButton>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-white/40">
        Straighten with the dial. Flips apply after cropping, so the box shows the unflipped photo.
      </p>

      <div className="mt-auto flex gap-2 pt-6">
        <button type="button" onClick={cancelCrop} className="h-11 flex-1 rounded-xl bg-ink-700 text-[13px] font-bold hover:bg-ink-600">
          Cancel
        </button>
        <button
          type="button"
          onClick={applyCrop}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-extrabold text-ink-950 hover:bg-white/90"
        >
          <Check className="size-4" />
          Apply crop
        </button>
      </div>
    </Panel>
  );
}
