import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, LoaderCircle, Trash2 } from 'lucide-react';
import { ADJUSTMENT_KEYS } from '@editmate/shared';
import { useEditor } from '../../state/EditorProvider.jsx';
import { applyAdjustments } from '../../engine/pipeline.js';
import { readPixels } from '../../engine/geometry.js';
import { cx } from '../../components/ui.jsx';
import { usePresets } from './PresetsProvider.jsx';

const sameAdjustments = (a, b) => ADJUSTMENT_KEYS.every((k) => a[k] === b[k]);

/** Renders the preset onto the user's own photo so every card is a real preview. */
const PresetThumb = memo(function PresetThumb({ source, adjustments }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !source) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const out = new ImageData(source.width, source.height);
    applyAdjustments(source.data, out.data, source.width, source.height, adjustments);
    canvas.getContext('2d').putImageData(out, 0, 0);
  }, [source, adjustments]);
  return <canvas ref={ref} className="size-full object-cover" aria-hidden="true" />;
});

function PresetCard({ preset, source, active, onApply, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <div className="group relative w-[124px] shrink-0">
      <button
        type="button"
        onClick={() => onApply(preset)}
        aria-pressed={active}
        className={cx(
          'block w-full overflow-hidden rounded-xl text-left ring-1 transition',
          active ? 'ring-2 ring-accent' : 'ring-white/10 hover:ring-white/40',
        )}
      >
        <div className="aspect-[4/3] bg-ink-800">
          <PresetThumb source={source} adjustments={preset.adjustments} />
        </div>
        <div className="flex items-center gap-1.5 bg-ink-800 px-2.5 py-2">
          <span className="truncate text-[12px] font-semibold">{preset.name}</span>
          {preset.swatch?.length > 0 && (
            <span className="ml-auto flex shrink-0 -space-x-1">
              {preset.swatch.slice(0, 3).map((c) => (
                <span key={c} className="size-2.5 rounded-full ring-1 ring-ink-800" style={{ background: c }} />
              ))}
            </span>
          )}
        </div>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={() => (confirming ? onDelete(preset.id) : setConfirming(true))}
          aria-label={confirming ? `Confirm deleting ${preset.name}` : `Delete ${preset.name}`}
          className={cx(
            'glass absolute top-1.5 right-1.5 flex h-6 items-center gap-1 rounded-full px-1.5 text-[10px] font-bold transition-opacity',
            confirming ? 'text-rec opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
          )}
        >
          <Trash2 className="size-3" />
          {confirming && 'Delete?'}
        </button>
      )}
    </div>
  );
}

export function PresetsDock({ onSavePreset }) {
  const { thumbnail, adjustments, apply, adjustmentsPristine: isPristine } = useEditor();
  const { builtIn, saved, loading, canSave, status, deletePreset } = usePresets();
  const source = useMemo(() => (thumbnail ? readPixels(thumbnail) : null), [thumbnail]);

  const onApply = (preset) => apply({ adjustments: preset.adjustments });
  const isActive = (preset) => !isPristine && sameAdjustments(preset.adjustments, adjustments);

  const saveHint = !canSave
    ? status === 'no-database'
      ? 'Set MONGODB_URI to save'
      : 'Start the API to save'
    : isPristine
      ? 'Make an edit first'
      : 'Save current look';

  return (
    <div className="scrollbar-none -my-1 flex min-w-0 flex-1 items-start gap-3 overflow-x-auto py-1">
      <button
        type="button"
        onClick={() => onSavePreset()}
        disabled={!canSave || isPristine}
        className="flex aspect-[124/127] w-[124px] shrink-0 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-3 text-center transition-colors hover:border-white/35 disabled:opacity-45 disabled:hover:border-white/15"
      >
        <BookmarkPlus className="size-5 text-accent" />
        <span className="text-[12px] font-bold">New preset</span>
        <span className="text-[10px] leading-tight text-white/40">{saveHint}</span>
      </button>

      {saved.map((preset) => (
        <PresetCard key={preset.id} preset={preset} source={source} active={isActive(preset)} onApply={onApply} onDelete={deletePreset} />
      ))}
      {loading && (
        <div className="grid h-[127px] w-[60px] shrink-0 place-items-center">
          <LoaderCircle className="size-4 animate-spin text-white/40" />
        </div>
      )}
      {saved.length > 0 && <span className="h-[127px] w-px shrink-0 bg-white/10" aria-hidden="true" />}
      {builtIn.map((preset) => (
        <PresetCard key={preset.id} preset={preset} source={source} active={isActive(preset)} onApply={onApply} />
      ))}
    </div>
  );
}
