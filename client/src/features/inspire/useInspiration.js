/**
 * Hook driving reference image measurement and iterative adjustment fitting.
 */

import { useCallback, useEffect, useState } from 'react';
import { ADJUSTMENT_KEYS, clampAdjustment } from '@editmate/shared';
import { classifyStyle, extractPalette, fitAdjustments, measure, measureNoise, suggestGrain } from '../../engine/analysis.js';
import { downscale, readPixels } from '../../engine/geometry.js';
import { loadImageFile } from '../../lib/image.js';

const TEXTURE_SIZE = 512;

function toCanvas(bitmap, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function analyzeReference(bitmap) {
  const { data, width, height } = readPixels(toCanvas(bitmap, TEXTURE_SIZE));
  const stats = measure(data, width, height);
  return {
    stats,
    noise: measureNoise(data, width, height),
    palette: extractPalette(data),
    style: classifyStyle(stats),
  };
}

export function scaleRecipe(adjustments, strength) {
  return Object.fromEntries(ADJUSTMENT_KEYS.map((k) => [k, clampAdjustment(k, (adjustments[k] ?? 0) * strength)]));
}

export function useInspiration({ base, thumbnail, onError }) {
  const [reference, setReference] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [strength, setStrength] = useState(0.8);

  const chooseReference = useCallback(
    async (file) => {
      setAnalyzing(true);
      try {
        const loaded = await loadImageFile(file);
        const analysis = analyzeReference(loaded.bitmap);
        loaded.bitmap.close();
        setReference({ url: loaded.url, name: loaded.name, ...analysis });
      } catch (err) {
        setAnalyzing(false);
        onError?.(err.message);
      }
    },
    [onError],
  );

  const clearReference = useCallback(() => {
    setReference(null);
    setRecipe(null);
  }, []);

  useEffect(() => {
    if (!reference || !thumbnail || !base) {
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    const timer = setTimeout(() => {
      const source = readPixels(thumbnail);
      const texture = readPixels(downscale(base, TEXTURE_SIZE));
      const fit = fitAdjustments({ source, target: reference.stats, iterations: 10 });
      const grain = suggestGrain(reference.noise, measureNoise(texture.data, texture.width, texture.height));
      setRecipe({ ...fit, adjustments: { ...fit.adjustments, grain } });
      setAnalyzing(false);
    }, 30);
    return () => clearTimeout(timer);
  }, [reference, thumbnail, base]);

  useEffect(() => () => reference && URL.revokeObjectURL(reference.url), [reference]);

  return { reference, recipe, analyzing, strength, setStrength, chooseReference, clearReference };
}
