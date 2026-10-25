/**
 * HUD overlay displaying photo metadata, zoom levels, and quick actions.
 */

import { useState, useRef } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, LocateFixed } from 'lucide-react';
import { useEditor, useFrame } from '../../state/EditorProvider.jsx';
import { outputSize } from '../../engine/geometry.js';
import { formatLabel } from '../../lib/image.js';
import { megapixels, signedFixed } from '../../lib/format.js';
import { cx } from '../../components/ui.jsx';
import { Histogram, clipping } from './Histogram.jsx';

const CHANNELS = [
  { key: 'r', label: 'R', dot: 'bg-red-400' },
  { key: 'g', label: 'G', dot: 'bg-green-400' },
  { key: 'b', label: 'B', dot: 'bg-blue-400' },
  { key: 'l', label: 'L', dot: 'bg-white' },
];

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

export function HudStrip({ zoom, onZoom, onPan, onResetPan, displayScale }) {
  const { image, geometry, ui, setUi, isPristine } = useEditor();
  const { histogram, stats, sourceStats } = useFrame();
  const [channels, setChannels] = useState(['l']);

  const size = outputSize(image.width, image.height, geometry);
  const ev = stats && sourceStats ? Math.log2(Math.max(stats.brightness, 1e-3) / Math.max(sourceStats.brightness, 1e-3)) : 0;
  const clip = clipping(histogram);

  const toggleChannel = (key) =>
    setChannels((list) => (list.includes(key) ? (list.length > 1 ? list.filter((c) => c !== key) : list) : [...list, key]));

  const holdOriginal = (showOriginal) => () => setUi({ showOriginal });

  return (
    <aside className="glass pointer-events-auto absolute inset-y-0 left-0 hidden w-[208px] flex-col border-r border-white/5 p-3.5 lg:flex overflow-y-auto overflow-x-hidden [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
      {/* Header: Mode & Format */}
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          disabled={isPristine}
          onPointerDown={holdOriginal(true)}
          onPointerUp={holdOriginal(false)}
          onPointerLeave={holdOriginal(false)}
          title={'Hold to see the original (\\)'}
          className={cx(
            'rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wider transition-colors disabled:cursor-default',
            ui.showOriginal ? 'border-accent text-accent' : 'border-white/40 text-white/80',
          )}
        >
          {ui.showOriginal || isPristine ? 'ORIGINAL' : 'EDITED'}
        </button>
        <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/60">{formatLabel(image.type)}</span>
      </div>

      {/* Dimensions & Megapixels */}
      <p className="mt-2.5 shrink-0 text-[11px] font-semibold">
        <span className="num text-accent">
          {size.width} × {size.height}
        </span>{' '}
        <span className="text-white/40">· {megapixels(size.width, size.height)}</span>
      </p>

      {/* Zoom controls */}
      <div className="mt-3.5 shrink-0">
        <div className="flex items-center justify-between">
          <p className="label">Zoom</p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onZoom(1)}
              title="Reset to Fit (100%)"
              className={cx(
                'rounded border px-1.5 py-0.5 text-[9px] font-bold transition-colors',
                zoom === 1 ? 'border-white/50 text-white bg-white/10' : 'border-white/20 text-white/50 hover:text-white',
              )}
            >
              FIT
            </button>
            <span className="num w-11 text-right text-[11px] font-medium text-white/70">{Math.round(zoom * 100)}%</span>
          </div>
        </div>
        <div className="mt-1 flex items-center">
          <input
            type="range"
            className="range w-full"
            aria-label="Zoom"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => onZoom(Number(e.target.value))}
            style={{ '--fill-from': '0%', '--fill-to': `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }}
          />
        </div>
      </div>

      {/* Pan View Directional Controls */}
      <div className="mt-3.5 shrink-0">
        <div className="flex items-center justify-between">
          <p className="label">Pan View</p>
          <span className="text-[10px] text-white/40">WASD / Drag</span>
        </div>
        <div className="mt-2 flex flex-col items-center">
          <ArrowButton
            icon={ChevronUp}
            onClick={() => onPan?.(0, 60)}
            title="Move view up (W)"
            label="Move view up"
          />
          <div className="my-1 flex items-center gap-1.5">
            <ArrowButton
              icon={ChevronLeft}
              onClick={() => onPan?.(60, 0)}
              title="Move view left (A)"
              label="Move view left"
            />
            <button
              type="button"
              onClick={() => onResetPan?.()}
              title="Center view (Home)"
              aria-label="Center view"
              className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/10 text-white/60 hover:border-white/30 hover:bg-white/20 hover:text-white active:bg-sky/30 transition-colors shadow-sm"
            >
              <LocateFixed className="size-4" />
            </button>
            <ArrowButton
              icon={ChevronRight}
              onClick={() => onPan?.(-60, 0)}
              title="Move view right (D)"
              label="Move view right"
            />
          </div>
          <ArrowButton
            icon={ChevronDown}
            onClick={() => onPan?.(0, -60)}
            title="Move view down (S)"
            label="Move view down"
          />
        </div>
      </div>

      {/* Channels (Compact 4-column row) */}
      <div className="mt-3 shrink-0">
        <p className="label mb-1.5">Channels</p>
        <div className="grid grid-cols-4 gap-1">
          {CHANNELS.map(({ key, label, dot }) => {
            const on = channels.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleChannel(key)}
                className={cx(
                  'flex items-center justify-center gap-1 rounded-md py-1 text-[11px] font-bold transition-colors',
                  on ? 'bg-white/25 ring-1 ring-white/40 text-white' : 'bg-white/10 text-white/50 hover:text-white',
                )}
              >
                <span className={cx('size-1.5 rounded-full', dot)} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Histogram Graph (Directly under channels, compact spacing) */}
      <div className="mt-3.5 shrink-0">
        <div className="relative h-[104px] rounded border border-white/20 bg-black/30 backdrop-blur-sm">
          <span className="num absolute -top-2 left-2 px-1 text-[11px] font-medium text-white/85 [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">
            EV {signedFixed(ev, 2)}
          </span>
          <Histogram histogram={histogram} channels={channels} className="absolute inset-x-1 bottom-1 h-[82px] w-[calc(100%-8px)]" />
        </div>
        <div className="num mt-1 flex justify-between text-[10px] text-white/40">
          <span title="Pixels clipped to black">▼ {(clip.shadows * 100).toFixed(1)}%</span>
          <span title="Pixels clipped to white">▲ {(clip.highlights * 100).toFixed(1)}%</span>
        </div>
      </div>
    </aside>
  );
}

function ArrowButton({ icon: Icon, onClick, title, label }) {
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);

  const stop = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };

  const start = (e) => {
    if (e.button !== 0) return;
    onClick();
    stop();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onClick();
      }, 50);
    }, 220);
  };

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      title={title}
      aria-label={label || title}
      className="grid size-9 place-items-center rounded-lg border border-white/10 bg-white/10 text-white/75 hover:border-white/30 hover:bg-white/20 hover:text-white active:bg-sky/30 transition-colors select-none shadow-sm"
    >
      <Icon className="size-4.5" />
    </button>
  );
}

export { MIN_ZOOM, MAX_ZOOM };
