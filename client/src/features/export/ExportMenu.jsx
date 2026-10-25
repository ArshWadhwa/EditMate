/**
 * Dropdown menu and modal for exporting images in JPEG, PNG, WebP, or PDF.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, CircleAlert, Download, LoaderCircle } from 'lucide-react';
import { useEditor } from '../../state/EditorProvider.jsx';
import { EXPORT_FORMATS, EXPORT_SIZES, canEncode, exportFilename, formatFor } from '../../engine/exportImage.js';
import { needsAlpha } from '../../engine/composite.js';
import { outputSize } from '../../engine/geometry.js';
import { RangeField } from '../../components/fields.jsx';
import { cx } from '../../components/ui.jsx';

function useSupportedFormats() {
  const [supported, setSupported] = useState(() => new Set(['jpeg', 'png', 'pdf']));
  useEffect(() => {
    let cancelled = false;
    Promise.all(EXPORT_FORMATS.map(async (f) => [f.key, await canEncode(f.mime)])).then((results) => {
      if (!cancelled) setSupported(new Set(results.filter(([, ok]) => ok).map(([key]) => key)));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return supported;
}

export function ExportMenu() {
  const { image, geometry, background, layers, exportImage, exporting, exportSettings, exportFormat, setExportSettings } = useEditor();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const supported = useSupportedFormats();

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !rootRef.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const spec = formatFor(exportFormat);
  const full = outputSize(image.width, image.height, geometry);
  const sizeOf = (maxEdge) => {
    const scale = maxEdge ? Math.min(1, maxEdge / Math.max(full.width, full.height)) : 1;
    return `${Math.round(full.width * scale)} × ${Math.round(full.height * scale)}`;
  };
  const losesAlpha = needsAlpha({ background, layers }) && !spec.alpha;

  const run = () => {
    setOpen(false);
    exportImage();
  };

  return (
    <div ref={rootRef} className="relative flex">
      <button
        type="button"
        onClick={run}
        disabled={exporting}
        title={`Export ${spec.label} (⌘E)`}
        className="flex h-9 items-center gap-1.5 rounded-l-xl bg-rec pr-2.5 pl-3 text-[12px] font-bold sm:h-10 sm:gap-2 sm:pr-3 sm:pl-4 shadow-lg shadow-rec/30 transition hover:brightness-110 disabled:opacity-70"
      >
        {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
        {exporting ? 'Exporting…' : 'Export'}
        {!exporting && <span className="hidden sm:inline">{spec.label}</span>}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Export options"
        className="grid h-9 w-8 place-items-center rounded-r-xl sm:h-10 border-l border-black/20 bg-rec shadow-lg shadow-rec/30 transition hover:brightness-110"
      >
        <ChevronDown className={cx('size-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="dialog" aria-label="Export options" className="hairline absolute top-11 right-0 z-30 w-[min(300px,calc(100vw-32px))] rounded-2xl sm:top-12 bg-ink-800 p-4 shadow-2xl shadow-black/60">
          <p className="label">Format</p>
          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.key}
                type="button"
                disabled={!supported.has(f.key)}
                aria-pressed={exportFormat === f.key}
                title={supported.has(f.key) ? f.hint : `${f.label} isn't supported by this browser`}
                onClick={() => setExportSettings({ format: f.key })}
                className={cx(
                  'h-9 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-25',
                  exportFormat === f.key ? 'bg-white text-ink-950' : 'bg-ink-700 text-white/75 hover:text-white',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/45">{spec.hint}</p>

          {losesAlpha && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-accent">
              <CircleAlert className="mt-px size-3.5 shrink-0" />
              {spec.label} has no transparency; the background will be white. Use PNG or WebP to keep it.
            </p>
          )}

          {spec.lossy && (
            <div className="mt-4">
              <RangeField
                label="Quality"
                value={exportSettings.quality}
                min={0.5}
                max={1}
                step={0.01}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(quality) => setExportSettings({ quality })}
              />
            </div>
          )}

          <p className="label mt-4">Size</p>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {EXPORT_SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={exportSettings.size === s.key}
                onClick={() => setExportSettings({ size: s.key })}
                className={cx(
                  'rounded-lg px-2.5 py-1.5 text-left transition-colors',
                  exportSettings.size === s.key ? 'bg-white text-ink-950' : 'bg-ink-700 text-white/75 hover:text-white',
                )}
              >
                <span className="block text-[11px] font-bold">{s.label}</span>
                <span className="num block text-[10px] opacity-60">{sizeOf(s.maxEdge)}</span>
              </button>
            ))}
          </div>

          <p className="num mt-4 truncate text-[11px] text-white/40">{exportFilename(image.name, exportFormat)}</p>
          <button
            type="button"
            onClick={run}
            disabled={exporting}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-extrabold text-ink-950 hover:bg-white/90 disabled:opacity-60"
          >
            <Download className="size-4" />
            Export {spec.label}
          </button>
        </div>
      )}
    </div>
  );
}
