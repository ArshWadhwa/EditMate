/**
 * HUD overlay displaying photo metadata, zoom levels, and quick actions.
 */

import { useState } from 'react';
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

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

export function HudStrip({ zoom, onZoom, displayScale }) {
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
    <aside className="glass pointer-events-auto absolute inset-y-0 left-0 hidden w-[208px] flex-col border-r border-white/5 p-5 lg:flex">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isPristine}
          onPointerDown={holdOriginal(true)}
          onPointerUp={holdOriginal(false)}
          onPointerLeave={holdOriginal(false)}
          title={'Hold to see the original (\\)'}
          className={cx(
            'rounded-md border px-2.5 py-1 text-[11px] font-bold tracking-wider transition-colors disabled:cursor-default',
            ui.showOriginal ? 'border-accent text-accent' : 'border-white/40',
          )}
        >
          {ui.showOriginal || isPristine ? 'ORIGINAL' : 'EDITED'}
        </button>
        <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/60">{formatLabel(image.type)}</span>
      </div>

      <p className="mt-4 text-[12px] font-semibold">
        <span className="num text-accent">
          {size.width} × {size.height}
        </span>{' '}
        <span className="text-white/50">· {megapixels(size.width, size.height)}</span>
      </p>

      <p className="label mt-7">Zoom</p>
      <div className="mt-2 flex items-center gap-3">
        <input
          type="range"
          className="range flex-1"
          aria-label="Zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
          style={{ '--fill-from': '0%', '--fill-to': `${((zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100}%` }}
        />
        <span className="num w-10 text-right text-[11px] text-white/60">{Math.round(displayScale * 100)}%</span>
      </div>
      <button
        type="button"
        onClick={() => onZoom(1)}
        className={cx('mt-2 w-fit rounded-md border px-2 py-0.5 text-[10px] font-bold', zoom === 1 ? 'border-white/40 text-white' : 'border-white/20 text-white/60 hover:text-white')}
      >
        FIT
      </button>

      <p className="label mt-7">Channels</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {CHANNELS.map(({ key, label, dot }) => {
          const on = channels.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => toggleChannel(key)}
              className={cx(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors',
                on ? 'bg-white/25 ring-1 ring-white/40' : 'bg-white/10 text-white/60 hover:text-white',
              )}
            >
              <span className={cx('size-1.5 rounded-full', dot)} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-auto">
        <div className="relative h-[120px] rounded-sm border border-white/25">
          <span className="num absolute -top-2 left-2 px-1 text-[12px] font-medium [text-shadow:0_1px_4px_rgb(0_0_0/0.6)]">
            EV {signedFixed(ev, 2)}
          </span>
          <Histogram histogram={histogram} channels={channels} className="absolute inset-x-1 bottom-1 h-[96px] w-[calc(100%-8px)]" />
        </div>
        <div className="num mt-2 flex justify-between text-[10px] text-white/40">
          <span title="Pixels clipped to black">▼ {(clip.shadows * 100).toFixed(1)}%</span>
          <span title="Pixels clipped to white">▲ {(clip.highlights * 100).toFixed(1)}%</span>
        </div>
      </div>
    </aside>
  );
}

export { MIN_ZOOM, MAX_ZOOM };
