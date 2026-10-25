/**
 * Modal dialog for saving the current adjustments as a new preset.
 */

import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { extractPalette } from '../../engine/analysis.js';
import { applyAdjustments } from '../../engine/pipeline.js';
import { readPixels } from '../../engine/geometry.js';
import { useToast } from '../../components/Toaster.jsx';
import { usePresets } from './PresetsProvider.jsx';

function paletteOf(thumbnail, adjustments) {
  const { data, width, height } = readPixels(thumbnail);
  const out = new Uint8ClampedArray(data.length);
  applyAdjustments(data, out, width, height, adjustments);
  return extractPalette(out, 5);
}

export function SavePresetDialog({ draft, onClose }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const { adjustments, thumbnail, setUi } = useEditor();
  const { savePreset, saved } = usePresets();
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (draft && !dialog.open) {
      setName(draft.name ?? `My look ${saved.length + 1}`);
      setError('');
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.select());
    } else if (!draft && dialog.open) {
      dialog.close();
    }
  }, [draft, saved.length]);

  const submit = async (e) => {
    e.preventDefault();
    if (!draft || saving) return;
    const values = draft.adjustments ?? adjustments;
    setSaving(true);
    setError('');
    try {
      const preset = await savePreset({
        name: name.trim(),
        adjustments: values,
        swatch: draft.swatch ?? (thumbnail ? paletteOf(thumbnail, values) : []),
        source: draft.source ?? 'manual',
      });
      toast.success(`Saved “${preset.name}”`);
      setUi({ dock: 'presets' });
      onClose();
    } catch (err) {
      setError(err.details?.[0]?.message ?? err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && onClose()}
      className="m-auto w-[min(400px,calc(100vw-32px))] rounded-[22px] bg-ink-850 p-0 text-white shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={submit} className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-bold">Save preset</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-white/50 hover:bg-white/5 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-white/45">Reuse this look on any future photo.</p>

        <label htmlFor="preset-name" className="label mt-6 block">
          Name
        </label>
        <input
          ref={inputRef}
          id="preset-name"
          required
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'preset-error' : undefined}
          className="mt-2 h-11 w-full rounded-xl bg-ink-950 px-4 text-base font-semibold ring-1 lg:text-[14px] ring-white/10 outline-none placeholder:text-white/30 focus:ring-sky"
          placeholder="Golden coast"
        />
        {error && (
          <p id="preset-error" role="alert" className="mt-2 text-[12px] text-rec">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-[13px] font-bold text-white/70 hover:bg-white/5 hover:text-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex h-10 items-center gap-2 rounded-xl bg-white px-5 text-[13px] font-extrabold text-ink-950 hover:bg-white/90 disabled:opacity-50"
          >
            {saving && <LoaderCircle className="size-4 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
