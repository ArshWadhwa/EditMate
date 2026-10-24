import { fitAdjustments, measure } from './analysis.js';
import { readPixels } from './geometry.js';

const TONE_KEYS = ['brightness', 'contrast', 'highlights', 'shadows'];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Auto tone: nudges exposure into a comfortable range and spreads the histogram,
 * keeping the photo's character (a dark scene stays darker than a bright one).
 */
export function autoTone(thumbnail, current) {
  const source = readPixels(thumbnail);
  const m = measure(source.data, source.width, source.height);
  const target = {
    brightness: clamp(m.brightness, 0.4, 0.56),
    contrast: clamp(m.contrast, 0.19, 0.26),
    highlights: Math.max(m.highlights, 0.9),
    shadows: Math.min(m.shadows, 0.07),
  };
  const base = { ...current, ...Object.fromEntries(TONE_KEYS.map((k) => [k, 0])) };
  return fitAdjustments({ source, target, base, keys: TONE_KEYS }).adjustments;
}

/** Gray-world white balance: removes the average colour cast. */
export function autoWhiteBalance(thumbnail, current) {
  const source = readPixels(thumbnail);
  const base = { ...current, warmth: 0, tint: 0 };
  return fitAdjustments({ source, target: { warmth: 0, tint: 0 }, base, keys: ['warmth', 'tint'] }).adjustments;
}
