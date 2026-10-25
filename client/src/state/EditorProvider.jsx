import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { defaultAdjustments, isNeutral } from '@editmate/shared';
import { defaultGeometry, downscale, renderGeometry } from '../engine/geometry.js';
import { usePreviewRenderer } from '../engine/usePreviewRenderer.js';
import { EXPORT_SIZES, defaultFormatFor, downloadBlob, encodeExport, exportFilename, formatFor, renderFull } from '../engine/exportImage.js';
import { needsAlpha } from '../engine/composite.js';
import { needsMask } from '../engine/layers.js';
import { useAssets } from './useAssets.js';
import { useSubjectMask } from './useSubjectMask.js';
import { useExportSettings } from './useExportSettings.js';
import { loadImageFile, releaseImage } from '../lib/image.js';
import { useToast } from '../components/Toaster.jsx';
import { emptyDocument, useDocStore } from './docStore.js';

export { emptyDocument, useDocStore };

export const PREVIEW_MAX = 1800;
const THUMB_MAX = 200;

const EditorContext = createContext(null);
const FrameContext = createContext(null);

export function EditorProvider({ children }) {
  const toast = useToast();
  const [image, setImage] = useState(null);
  const doc = useDocStore((s) => s.doc);
  const { adjustments, geometry, background, layers } = doc;

  const [ui, setUi] = useState({
    tool: 'adjust',
    group: 'light',
    focusedKey: 'brightness',
    compare: false,
    split: 0.5,
    grid: false,
    showOriginal: false,
    dock: 'inspire',
    sheet: 'adjust',
    selectedLayerId: null,
  });
  const [exporting, setExporting] = useState(false);
  const [exportSettings, setExportSettings] = useExportSettings();
  const [exportedDoc, setExportedDoc] = useState(null);

  const assets = useAssets();
  const subject = useSubjectMask(image);

  const base = useMemo(
    () => (image ? renderGeometry(image.bitmap, geometry, PREVIEW_MAX) : null),
    [image, geometry],
  );
  const thumbnail = useMemo(() => (base ? downscale(base, THUMB_MAX) : null), [base]);

  const { frame, output } = usePreviewRenderer(base, adjustments);

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
        useDocStore.getState().reset(emptyDocument());
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
      preview: (patch) => useDocStore.getState().preview(patch),
      commit: () => useDocStore.getState().commit(),
      apply: (patch) => useDocStore.getState().apply(patch),
      undo: () => useDocStore.getState().undo(),
      redo: () => useDocStore.getState().redo(),
      resetAdjustments: () => useDocStore.getState().apply({ adjustments: defaultAdjustments() }),
      resetGeometry: () => useDocStore.getState().apply({ geometry: defaultGeometry() }),
      setUi: (patch) => setUi((u) => ({ ...u, ...(typeof patch === 'function' ? patch(u) : patch) })),
    }),
    [],
  );

  const exportFormat =
    exportSettings.format ?? (image && needsAlpha(doc) ? 'png' : defaultFormatFor(image?.type));

  const exportImage = useCallback(async () => {
    if (!image || exporting) return;
    setExporting(true);
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
  }, [image, exporting, doc, subject.mask, assets.map, exportSettings, exportFormat, toast]);

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
      canUndo: useDocStore.getState().past.length > 0,
      canRedo: useDocStore.getState().future.length > 0,
      editCount: useDocStore.getState().past.length,
      isPristine: isNeutral(adjustments) && !layers.length && !needsMask(background),
      adjustmentsPristine: isNeutral(adjustments),
      isExported: exportedDoc !== null && exportedDoc === doc,
      exporting,
      exportSettings,
      exportFormat,
      setExportSettings,
      openFile,
      exportImage,
      ...actions,
    }),
    [image, base, thumbnail, adjustments, geometry, background, layers, ui, output, maskBase, subject, assets, exportedDoc, doc, exporting, exportSettings, exportFormat, setExportSettings, openFile, exportImage, actions],
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

export function useFrame() {
  return useContext(FrameContext);
}
