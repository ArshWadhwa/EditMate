import { useEffect, useState } from 'react';
import { readPixels } from './geometry.js';
import { applyAdjustments, computeHistogram } from './pipeline.js';
import { measure } from './analysis.js';

/**
 * React hook that renders adjustment previews and calculates frame statistics
 * directly to an offscreen canvas.
 *
 * @param {HTMLCanvasElement|null} base - Geometrically transformed base image
 * @param {object} adjustments - Current adjustment slider values
 * @returns {{ frame: { histogram: object|null, stats: object|null, sourceStats: object|null, id: number }, output: HTMLCanvasElement }}
 */
export function usePreviewRenderer(base, adjustments) {
  const [frame, setFrame] = useState({ histogram: null, stats: null, sourceStats: null, id: 0 });
  const [output] = useState(() => document.createElement('canvas'));

  useEffect(() => {
    if (!base) return;
    const { width, height } = base;
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }

    const { data: pixels } = readPixels(base);
    const out = new Uint8ClampedArray(pixels.length);
    applyAdjustments(pixels, out, width, height, adjustments);

    output.getContext('2d').putImageData(new ImageData(out, width, height), 0, 0);

    const histogram = computeHistogram(out, 3);
    const stats = measure(out, width, height, { sampleTarget: 60_000 });
    const sourceStats = measure(pixels, width, height, { sampleTarget: 60_000 });

    setFrame((f) => ({ histogram, stats, sourceStats, id: f.id + 1 }));
  }, [base, adjustments, output]);

  return { frame, output };
}
