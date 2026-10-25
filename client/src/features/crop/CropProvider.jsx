/**
 * Context provider managing interactive crop geometry and transform state.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useEditor } from '../../state/EditorProvider.jsx';
import {
  constrainRect,
  createFrame,
  effectiveCrop,
  fitAspect,
  fromFractions,
  largestRect,
  toFractions,
  totalRotation,
} from '../../engine/geometry.js';

export const ASPECTS = [
  { key: 'free', label: 'Free' },
  { key: 'original', label: 'Original' },
  { key: '1:1', ratio: [1, 1] },
  { key: '4:5', ratio: [5, 4] },
  { key: '3:2', ratio: [3, 2] },
  { key: '16:9', ratio: [16, 9] },
  { key: 'custom', label: 'Custom' },
];

const clampRatioPart = (v) => Math.min(100, Math.max(1, Math.round(Number(v) || 1)));

const CropContext = createContext(null);

export function CropProvider({ children }) {
  const { image, geometry, ui, setUi, apply } = useEditor();
  const [aspectKey, setAspectKey] = useState('free');
  const [portrait, setPortrait] = useState(false);
  const [custom, setCustomState] = useState({ w: 7, h: 5 });
  const [rect, setRect] = useState(null);

  const rotation = image ? totalRotation(geometry) : 0;
  const frame = useMemo(() => (image ? createFrame(image.width, image.height, rotation) : null), [image, rotation]);

  const ratio = useMemo(() => {
    if (!frame || aspectKey === 'free') return null;
    if (aspectKey === 'original') {
      const turned = geometry.quarterTurns % 2 ? [image.height, image.width] : [image.width, image.height];
      return portrait ? [turned[1], turned[0]] : turned;
    }
    const base = aspectKey === 'custom' ? [custom.w, custom.h] : ASPECTS.find((a) => a.key === aspectKey).ratio;
    const startsPortrait = aspectKey === '4:5';
    return portrait !== startsPortrait ? [base[1], base[0]] : base;
  }, [frame, aspectKey, portrait, custom, image, geometry.quarterTurns]);

  const aspect = ratio ? ratio[0] / ratio[1] : null;

  useEffect(() => {
    if (ui.tool !== 'crop' || !frame) {
      setRect(null);
      return;
    }
    const start = fromFractions(frame, effectiveCrop(image.width, image.height, geometry));
    setRect(aspect ? fitAspect(start, aspect) : start);
  }, [ui.tool, frame]);

  useEffect(() => {
    if (!aspect || !frame) return;
    setRect((current) => {
      if (!current) return current;
      const fitted = fitAspect(current, aspect);
      const tooSmall = fitted.width < frame.W * 0.15 && fitted.height < frame.H * 0.15;
      return tooSmall ? largestRect(frame, aspect) : constrainRect(frame, current, fitted);
    });
  }, [aspect, frame]);

  const setAspect = useCallback((key) => {
    setAspectKey(key);
    if (key === 'free' || key === '1:1') setPortrait(false);
  }, []);

  const setCustom = useCallback((patch) => setCustomState((c) => ({ w: clampRatioPart(patch.w ?? c.w), h: clampRatioPart(patch.h ?? c.h) })), []);

  const resetBox = useCallback(() => frame && setRect(largestRect(frame, aspect)), [frame, aspect]);

  const applyCrop = useCallback(() => {
    if (rect && frame) {
      const full = largestRect(frame, null);
      const untouched = !geometry.straighten && Math.abs(rect.width - full.width) < 1 && Math.abs(rect.height - full.height) < 1;
      apply({ geometry: { crop: untouched ? null : toFractions(frame, rect) } });
    }
    setUi({ tool: 'adjust' });
  }, [rect, frame, geometry.straighten, apply, setUi]);

  const cancelCrop = useCallback(() => setUi({ tool: 'adjust' }), [setUi]);

  const value = useMemo(
    () => ({
      frame,
      rect,
      setRect,
      aspect,
      ratio,
      aspectKey,
      setAspect,
      portrait,
      togglePortrait: () => setPortrait((p) => !p),
      custom,
      setCustom,
      resetBox,
      applyCrop,
      cancelCrop,
    }),
    [frame, rect, aspect, ratio, aspectKey, setAspect, portrait, custom, setCustom, resetBox, applyCrop, cancelCrop],
  );

  return <CropContext.Provider value={value}>{children}</CropContext.Provider>;
}

export function useCrop() {
  const ctx = useContext(CropContext);
  if (!ctx) throw new Error('useCrop must be used inside <CropProvider>');
  return ctx;
}

export function useGeometryActions() {
  const { geometry, preview, commit, apply } = useEditor();
  return {
    rotateLeft: () => apply({ geometry: { quarterTurns: (geometry.quarterTurns + 3) % 4, crop: null } }),
    rotateRight: () => apply({ geometry: { quarterTurns: (geometry.quarterTurns + 1) % 4, crop: null } }),
    flip: () => apply({ geometry: { flipH: !geometry.flipH } }),
    previewStraighten: (straighten) => preview({ geometry: { straighten, crop: null } }),
    commitStraighten: commit,
    setStraighten: (straighten) => apply({ geometry: { straighten, crop: null } }),
  };
}
