import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { defaultAdjustments, isNeutral } from '@editmate/shared';
import { defaultGeometry, downscale, renderGeometry } from '../engine/geometry.js';
import { usePreviewRenderer } from '../engine/usePreviewRenderer.js';
import { EXPORT_SIZES, defaultFormatFor, downloadBlob, encodeExport, exportFilename, formatFor, renderFull } from '../engine/exportImage.js';
import { needsAlpha } from '../engine/composite.js';
import { needsMask } from '../engine/layers.js';
import { emptyDocument, historyReducer, initialHistory, sameDocument } from './history.js';
import { useAssets } from './useAssets.js';
import { useSubjectMask } from './useSubjectMask.js';
import { useExportSettings } from './useExportSettings.js';
import { loadImageFile, releaseImage } from '../lib/image.js';
import { useToast } from '../components/Toaster.jsx';

/** Longest side of the interactive preview. Exports always use full resolution. */
export const PREVIEW_MAX = 1800;
/** Longest side of the thumbnail used for recipe fitting and preset previews. */
const THUMB_MAX = 200;

const EditorContext = createContext(null);
const FrameContext = createContext(null);

export function EditorProvider({ children }) {
  const toast = useToast();
  const [image, setImage] = useState(null);
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initialHistory());
  const [ui, setUi] = useState({
    tool: 'adjust',
    group: 'light',
    focusedKey: 'brightness',
    compare: false,
    split: 0.5,
    grid: false,
    showOriginal: false,
    dock: 'inspire',
    /** Mobile only: which sheet the Adjust tool shows (adjust | inspire | presets). */
    sheet: 'adjust',
    selectedLayerId: null,
  });
  const [exporting, setExporting] = useState(false);
  const [exportSettings, setExportSettings] = useExportSettings();
  const [exportedDoc, setExportedDoc] = useState(null);

  const { adjustments, geometry, background, layers } = history.present;
  const assets = useAssets();
  const subject = useSubjectMask(image);

  // Geometry only changes on discrete actions, so the base is cheap to recompute.
  const base = useMemo(
    () => (image ? renderGeometry(image.bitmap, geometry, PREVIEW_MAX) : null),
    [image, geometry],
  );
  const thumbnail = useMemo(() => (base ? downscale(base, THUMB_MAX) : null), [base]);

  const { frame, output } = usePreviewRenderer(base, adjustments);

  // The subject mask goes through the same geometry as the photo, so they always line up.
  const maskBase = useMemo(
    () => (subject.mask ? renderGeometry(subject.mask, geometry, PREVIEW_MAX) : null),
    [subject.mask, geometry],
  );

  const imageRef = useRef(image);
  imageRef.current = image;
  useEffect(() => () => releaseImage(imageRef.current), []);

  const openFile = useCallback(
    async (file) => {
      try {
        const loaded = await loadImageFile(file);
        releaseImage(imageRef.current);
        setImage(loaded);
        dispatch({ type: 'load', doc: emptyDocument() });
        setExportedDoc(null);
        setUi((u) => ({ ...u, tool: 'adjust', compare: false, showOriginal: false, selectedLayerId: null }));
      } catch (err) {
        toast.error(err.message);
      }
    },
    [toast],
  );

  const actions = useMemo(
    () => ({
      preview: (patch) => dispatch({ type: 'preview', patch }),
      commit: () => dispatch({ type: 'commit' }),
      apply: (patch) => dispatch({ type: 'apply', patch }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      resetAdjustments: () => dispatch({ type: 'apply', patch: { adjustments: defaultAdjustments() } }),
      resetGeometry: () => dispatch({ type: 'apply', patch: { geometry: defaultGeometry() } }),
      setUi: (patch) => setUi((u) => ({ ...u, ...(typeof patch === 'function' ? patch(u) : patch) })),
    }),
    [],
  );

  /** Effective format: the chosen one, or the original's; transparent edits never default to JPEG. */
  const exportFormat =
    exportSettings.format ?? (image && needsAlpha(history.present) ? 'png' : defaultFormatFor(image?.type));

  const exportImage = useCallback(async () => {
    if (!image || exporting) return;
    setExporting(true);
    const doc = history.present;
    try {
      const mask = needsMask(doc.background) ? subject.mask : null;
      const canvas = await renderFull({ bitmap: image.bitmap, doc, mask, assets: assets.map });
      const { maxEdge } = EXPORT_SIZES.find((s) => s.key === exportSettings.size) ?? EXPORT_SIZES[0];
      const filename = exportFilename(image.name, exportFormat);
      const blob = await encodeExport(canvas, { format: exportFormat, quality: exportSettings.quality, maxEdge, title: filename });
      downloadBlob(blob, filename);
      setExportedDoc(doc);
      const note = needsAlpha(doc) && !formatFor(exportFormat).alpha ? ' (transparency flattened to white)' : '';
      toast.success(`Exported ${filename}${note}`);
    } catch (err) {
      toast.error(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  }, [image, exporting, history.present, subject.mask, assets.map, exportSettings, exportFormat, toast]);

  const value = useMemo(
    () => ({
      image,
      base,
      thumbnail,
      adjustments,
      geometry,
      background,
      layers,
      ui,
      output,
      maskBase,
      subject,
      assets,
      canUndo: history.past.length > 0 || !sameDocument(history.present, history.committed),
      canRedo: history.future.length > 0,
      editCount: history.past.length,
      /** No edits of any kind (adjustments, background, layers). */
      isPristine: isNeutral(adjustments) && !layers.length && !needsMask(background),
      /** Slider values untouched; presets and "reset adjustments" care only about these. */
      adjustmentsPristine: isNeutral(adjustments),
      isExported: exportedDoc !== null && sameDocument(exportedDoc, history.present),
      exporting,
      exportSettings,
      exportFormat,
      setExportSettings,
      openFile,
      exportImage,
      ...actions,
    }),
    [image, base, thumbnail, adjustments, geometry, background, layers, ui, output, maskBase, subject, assets, history, exportedDoc, exporting, exportSettings, exportFormat, setExportSettings, openFile, exportImage, actions],
  );

  return (
    <EditorContext.Provider value={value}>
      <FrameContext.Provider value={frame}>{children}</FrameContext.Provider>
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside <EditorProvider>');
  return ctx;
}

/** Live render output: { histogram, stats, sourceStats, id } of the current preview frame. */
export function useFrame() {
  return useContext(FrameContext);
}
