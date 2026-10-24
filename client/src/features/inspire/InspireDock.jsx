import { useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { getAdjustment } from '@editmate/shared';
import { useEditor, useFrame } from '../../state/EditorProvider.jsx';
import { ACCEPT_ATTR, firstImageFile } from '../../lib/image.js';
import { percent, signed } from '../../lib/format.js';
import { cx } from '../../components/ui.jsx';
import { useInspirationContext } from './InspirationProvider.jsx';
import { scaleRecipe } from './useInspiration.js';
import { significantSteps } from './recipeCopy.js';

function Readout({ label, value, hint, highlight }) {
  return (
    <div className="min-w-0">
      <p className="label truncate">{label}</p>
      <p className={cx('num mt-1.5 text-[15px]', highlight && 'text-accent')}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-white/35">{hint}</p>}
    </div>
  );
}

function ReferenceDrop({ onFile, disabled }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      // The zone handles its own drags; stopping propagation keeps the app-wide
      // "open a new photo" overlay from counting (or showing for) these events.
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDragLeave={(e) => {
        e.stopPropagation();
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const file = firstImageFile(e.dataTransfer.files);
        if (file) onFile(file);
      }}
      className={cx(
        'flex size-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center transition-colors disabled:opacity-40',
        over ? 'border-accent bg-accent/5' : 'border-white/15 hover:border-white/30 hover:bg-white/[0.02]',
      )}
    >
      <ImagePlus className="size-6 text-accent" />
      <span className="text-[13px] font-bold">Drop an inspiration photo</span>
      <span className="px-6 text-[11px] text-white/40">A look you love, from anywhere. It stays on your device.</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const file = firstImageFile(e.target.files);
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </button>
  );
}

function ReferenceCard({ reference, match, onReplace, onClear }) {
  const inputRef = useRef(null);
  return (
    <div className="hairline group relative size-full overflow-hidden rounded-2xl">
      <img src={reference.url} alt={`Inspiration: ${reference.name}`} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/30" />
      <span className="label absolute top-3 left-3 !text-white/85">Reference</span>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button type="button" onClick={() => inputRef.current?.click()} title="Replace reference" aria-label="Replace reference" className="glass grid size-7 place-items-center rounded-full">
          <RefreshCw className="size-3.5" />
        </button>
        <button type="button" onClick={onClear} title="Remove reference" aria-label="Remove reference" className="glass grid size-7 place-items-center rounded-full">
          <X className="size-3.5" />
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={(e) => {
          const file = firstImageFile(e.target.files);
          if (file) onReplace(file);
          e.target.value = '';
        }}
      />
      <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold">{reference.style}</p>
          <div className="mt-1.5 flex gap-1">
            {reference.palette.map((color) => (
              <span key={color} className="h-3 w-5 rounded-sm ring-1 ring-black/20" style={{ background: color }} title={color} />
            ))}
          </div>
        </div>
        {match !== null && <span className="num shrink-0 rounded-md bg-sky px-2 py-0.5 text-[11px] font-extrabold text-ink-950">{match}% match</span>}
      </div>
    </div>
  );
}

export function InspireDock({ onSavePreset }) {
  const { image, apply } = useEditor();
  const { stats } = useFrame();
  const { reference, recipe, analyzing, strength, setStrength, chooseReference, clearReference } = useInspirationContext();

  const scaled = recipe ? scaleRecipe(recipe.adjustments, strength) : null;
  const steps = scaled ? significantSteps(scaled) : [];
  const expectedMatch = recipe ? Math.round(recipe.matchBefore + (recipe.matchAfter - recipe.matchBefore) * strength) : null;

  return (
    <>
      <div className="h-[170px] w-full shrink-0 md:h-auto md:w-[240px] lg:w-[200px] xl:w-[260px] 2xl:w-[280px]">
        {reference ? (
          <ReferenceCard reference={reference} match={expectedMatch} onReplace={chooseReference} onClear={clearReference} />
        ) : (
          <ReferenceDrop onFile={chooseReference} disabled={!image || analyzing} />
        )}
      </div>

      <div className="grid min-w-0 flex-1 grid-cols-2 content-center gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {analyzing ? (
          <div className="col-span-full flex items-center gap-3 text-[13px] text-white/60">
            <LoaderCircle className="size-4 animate-spin text-accent" />
            Measuring the reference and fitting a recipe to your photo…
          </div>
        ) : reference && recipe ? (
          steps.length ? (
            steps.map(({ key, value, intent }) => (
              <Readout key={key} label={getAdjustment(key).label} value={signed(value)} hint={intent} highlight={Math.abs(value) >= 15} />
            ))
          ) : (
            <p className="col-span-full text-[13px] text-white/50">Your photo already matches this look. Nothing to change.</p>
          )
        ) : (
          <>
            <p className="label col-span-full -mb-1 !text-white/60">Measured · your photo</p>
            <Readout label="Brightness" value={stats ? percent(stats.brightness) : '—'} />
            <Readout label="Contrast" value={stats ? stats.contrast.toFixed(2) : '—'} />
            <Readout label="Saturation" value={stats ? percent(stats.saturation) : '—'} />
            <Readout label="Warmth" value={stats ? signed(Math.round(stats.warmth * 100)) : '—'} />
            <Readout label="Highlights" value={stats ? percent(stats.highlights) : '—'} hint="95th percentile" />
            <Readout label="Shadows" value={stats ? percent(stats.shadows) : '—'} hint="5th percentile" />
          </>
        )}
      </div>

      <div
        className={cx(
          'w-full shrink-0 flex-col justify-center gap-2 md:w-[170px] lg:w-[150px] xl:w-[170px]',
          // The how-it-works steps are optional; on small laptops give the readouts that room.
          recipe && !analyzing ? 'flex' : 'flex lg:hidden xl:flex',
        )}
      >
        {recipe && !analyzing ? (
          <>
            <div className="flex items-baseline justify-between">
              <p className="label">Strength</p>
              <p className="num text-[20px] font-medium">{percent(strength)}</p>
            </div>
            <input
              type="range"
              className="range"
              aria-label="Recipe strength"
              min={0}
              max={1}
              step={0.05}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              style={{ '--fill-from': '0%', '--fill-to': `${strength * 100}%` }}
            />
            <button
              type="button"
              onClick={() => apply({ adjustments: scaled })}
              className="mt-2 h-9 rounded-xl bg-white text-[12px] font-extrabold text-ink-950 transition hover:bg-white/90"
            >
              Apply recipe
            </button>
            <button
              type="button"
              onClick={() => onSavePreset({ adjustments: scaled, name: reference.style, swatch: reference.palette, source: 'inspiration' })}
              className="h-8 rounded-xl text-[12px] font-bold text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              Save as preset
            </button>
            <p className="text-[11px] leading-snug text-white/40">
              Match {recipe.matchBefore}% → {recipe.matchAfter}%. Suggested for <em>your</em> photo, not copied from the reference.
            </p>
          </>
        ) : (
          <ol className="space-y-2 text-[12px] leading-snug text-white/45">
            <li><span className="num mr-1.5 text-accent">1</span>Drop a photo whose look you love</li>
            <li><span className="num mr-1.5 text-accent">2</span>EditMate measures its light and colour</li>
            <li><span className="num mr-1.5 text-accent">3</span>Get a recipe tuned to your photo, then refine it</li>
          </ol>
        )}
      </div>
    </>
  );
}
