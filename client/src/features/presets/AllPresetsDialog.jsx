/**
 * Popup modal window for browsing, searching, and applying all presets.
 */

import { useId, useMemo, useRef, useState, useEffect } from 'react';
import { Bookmark, BookmarkPlus, Check, ExternalLink, LoaderCircle, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { ADJUSTMENT_KEYS } from '@editmate/shared';
import { useEditor } from '../../state/EditorProvider.jsx';
import { readPixels } from '../../engine/geometry.js';
import { cx } from '../../components/ui.jsx';
import { useToast } from '../../components/Toaster.jsx';
import { usePresets } from './PresetsProvider.jsx';
import { PresetThumb } from './PresetsDock.jsx';

const sameAdjustments = (a, b) => ADJUSTMENT_KEYS.every((k) => a[k] === b[k]);

function GridPresetCard({ preset, source, active, onApply, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <div
      className={cx(
        'group relative flex flex-col overflow-hidden rounded-2xl bg-ink-800 text-left ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40',
        active ? 'ring-2 ring-accent shadow-lg shadow-accent/10' : 'ring-white/10 hover:ring-white/30',
      )}
    >
      <button
        type="button"
        onClick={() => onApply(preset)}
        aria-pressed={active}
        className="relative block w-full text-left focus:outline-none"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink-900">
          {source ? (
            <PresetThumb source={source} adjustments={preset.adjustments} />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-ink-700 to-ink-900 text-white/30">
              <Sparkles className="size-6 opacity-40" />
            </div>
          )}

          {/* Active indicator badge */}
          {active && (
            <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-ink-950 shadow-md">
              <Check className="size-3 stroke-[3]" />
              <span>Active</span>
            </div>
          )}

          {/* Type tag */}
          <div className="absolute bottom-2 left-2 rounded-md bg-ink-950/70 px-1.5 py-0.5 text-[10px] font-semibold text-white/70 backdrop-blur-sm">
            {preset.builtIn ? 'Built-in' : 'Custom'}
          </div>

          {/* Hover overlay hint */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1px] transition-opacity duration-150 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-[11px] font-bold text-ink-950 shadow-lg transition-transform group-hover:scale-105">
              <Check className="size-3.5" />
              {active ? 'Applied' : 'Apply preset'}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 p-3">
          <div className="flex items-center justify-between gap-1.5">
            <span className="truncate text-[13px] font-semibold text-white group-hover:text-accent transition-colors">
              {preset.name}
            </span>

            {/* Color swatches */}
            {preset.swatch?.length > 0 && (
              <span className="flex shrink-0 -space-x-1">
                {preset.swatch.slice(0, 3).map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className="size-3 rounded-full ring-1 ring-ink-800 shadow-sm"
                    style={{ background: c }}
                  />
                ))}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Delete button for custom presets */}
      {onDelete && !preset.builtIn && (
        <button
          type="button"
          onClick={() => (confirming ? onDelete(preset.id) : setConfirming(true))}
          aria-label={confirming ? `Confirm deleting ${preset.name}` : `Delete ${preset.name}`}
          className={cx(
            'absolute top-2 right-2 z-10 flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-bold transition-all backdrop-blur-md',
            confirming
              ? 'bg-rec/90 text-white shadow-lg opacity-100 ring-1 ring-rec'
              : 'bg-ink-950/70 text-white/60 opacity-0 group-hover:opacity-100 hover:bg-rec hover:text-white',
          )}
        >
          <Trash2 className="size-3.5" />
          {confirming && 'Delete?'}
        </button>
      )}
    </div>
  );
}

export function AllPresetsDialog({ open, onClose, onSavePreset }) {
  const dialogRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchId = useId();
  const toast = useToast();

  const { image, thumbnail, adjustments, apply, adjustmentsPristine: isPristine } = useEditor();
  const { builtIn, saved, loading, canSave, deletePreset } = usePresets();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'builtin' | 'saved'

  const source = useMemo(() => (thumbnail ? readPixels(thumbnail) : null), [thumbnail]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setSearch('');
      dialog.showModal();
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const onApply = (preset) => {
    apply({ adjustments: preset.adjustments });
    toast.success(`Applied “${preset.name}”`);
  };

  const isActive = (preset) => !isPristine && sameAdjustments(preset.adjustments, adjustments);

  // Filtered preset list
  const filteredPresets = useMemo(() => {
    let list = [];
    if (filter === 'all') {
      list = [...saved, ...builtIn];
    } else if (filter === 'builtin') {
      list = builtIn;
    } else if (filter === 'saved') {
      list = saved;
    }

    if (!search.trim()) return list;

    const q = search.trim().toLowerCase();
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [builtIn, saved, filter, search]);

  const totalCount = builtIn.length + saved.length;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto flex max-h-[88vh] w-[min(960px,calc(100vw-32px))] flex-col rounded-[24px] bg-ink-850 p-0 text-white shadow-2xl shadow-black/80 ring-1 ring-white/10 backdrop:bg-black/70 backdrop:backdrop-blur-md"
    >
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-white/10 p-5 sm:p-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-accent/15 text-accent">
              <Bookmark className="size-5" />
            </span>
            <div>
              <h2 className="text-[18px] font-bold tracking-tight">Presets Library</h2>
              <p className="text-[12px] text-white/50">
                {totalCount} preset{totalCount === 1 ? '' : 's'} available • Click any preset to apply it instantly
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onSavePreset && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSavePreset();
                }}
                disabled={!canSave || isPristine}
                title={!canSave ? 'Start the API to save' : isPristine ? 'Make an edit first' : 'Save current look as new preset'}
                className="hidden sm:flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-[12px] font-bold text-white transition hover:bg-white/10 disabled:opacity-40"
              >
                <BookmarkPlus className="size-4 text-accent" />
                <span>Save Current Look</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close presets library"
              className="grid size-9 place-items-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Controls: Search and Filter Tabs */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
            <input
              ref={searchInputRef}
              id={searchId}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search presets..."
              className="h-9 w-full rounded-xl bg-ink-950 pl-9 pr-8 text-[13px] text-white placeholder-white/30 ring-1 ring-white/10 transition focus:outline-none focus:ring-accent"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-ink-950 p-1 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cx(
                'rounded-lg px-3 py-1 text-[11px] font-semibold transition',
                filter === 'all' ? 'bg-white/15 text-white shadow-sm' : 'text-white/60 hover:text-white',
              )}
            >
              All ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter('builtin')}
              className={cx(
                'rounded-lg px-3 py-1 text-[11px] font-semibold transition',
                filter === 'builtin' ? 'bg-white/15 text-white shadow-sm' : 'text-white/60 hover:text-white',
              )}
            >
              Built-in ({builtIn.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('saved')}
              className={cx(
                'rounded-lg px-3 py-1 text-[11px] font-semibold transition',
                filter === 'saved' ? 'bg-white/15 text-white shadow-sm' : 'text-white/60 hover:text-white',
              )}
            >
              My Presets ({saved.length})
            </button>
          </div>
        </div>
      </header>

      {/* Preset Grid Content */}
      <div className="scrollbar-thin flex-1 overflow-y-auto p-5 sm:p-6 min-h-[300px]">
        {!image && (
          <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center text-[12px] text-white/50">
            💡 Open a photo in EditMate to preview each preset directly on your photo.
          </div>
        )}

        {filteredPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/5 text-white/30">
              <Search className="size-6" />
            </div>
            <h3 className="mt-3 text-[14px] font-bold text-white">No presets found</h3>
            <p className="mt-1 text-[12px] text-white/45">
              {search
                ? `No presets match “${search}”. Try clearing your search.`
                : filter === 'saved'
                  ? 'You haven’t saved any custom presets yet.'
                  : 'No presets available in this category.'}
            </p>
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="mt-4 rounded-xl bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold hover:bg-white/15"
              >
                Clear search
              </button>
            ) : filter === 'saved' && onSavePreset && canSave && !isPristine ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSavePreset();
                }}
                className="mt-4 flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-[12px] font-bold text-ink-950 hover:bg-white/90"
              >
                <BookmarkPlus className="size-4" />
                <span>Save current look now</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filteredPresets.map((preset) => (
              <GridPresetCard
                key={preset.id}
                preset={preset}
                source={source}
                active={isActive(preset)}
                onApply={onApply}
                onDelete={preset.builtIn ? null : deletePreset}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-white/10 px-6 py-3.5 bg-ink-900/40">
        <span className="text-[11px] text-white/40">
          Tip: Press <kbd className="rounded border border-white/15 bg-white/5 px-1 py-0.5 font-mono text-[10px]">Esc</kbd> to close
        </span>
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-lg bg-white/10 px-4 text-[12px] font-bold text-white transition hover:bg-white/15"
        >
          Done
        </button>
      </footer>
    </dialog>
  );
}
