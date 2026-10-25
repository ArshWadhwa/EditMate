/**
 * Image adjustment definitions, validation limits, defaults, and normalization helpers.
 */

export const ADJUSTMENTS = [
  { key: 'brightness', label: 'Brightness', group: 'light', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', group: 'light', min: -100, max: 100 },
  { key: 'highlights', label: 'Highlights', group: 'light', min: -100, max: 100 },
  { key: 'shadows', label: 'Shadows', group: 'light', min: -100, max: 100 },
  { key: 'fade', label: 'Fade', group: 'light', min: 0, max: 100 },
  { key: 'warmth', label: 'Warmth', group: 'color', min: -100, max: 100 },
  { key: 'tint', label: 'Tint', group: 'color', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', group: 'color', min: -100, max: 100 },
  { key: 'vibrance', label: 'Vibrance', group: 'color', min: -100, max: 100 },
  { key: 'vignette', label: 'Vignette', group: 'effects', min: 0, max: 100 },
  { key: 'grain', label: 'Grain', group: 'effects', min: 0, max: 100 },
];

export const ADJUSTMENT_GROUPS = [
  { key: 'light', label: 'Light' },
  { key: 'color', label: 'Color' },
  { key: 'effects', label: 'Effects' },
];

export const ADJUSTMENT_KEYS = ADJUSTMENTS.map((a) => a.key);

const byKey = Object.fromEntries(ADJUSTMENTS.map((a) => [a.key, a]));

export function getAdjustment(key) {
  return byKey[key];
}

export function defaultAdjustments() {
  return Object.fromEntries(ADJUSTMENT_KEYS.map((key) => [key, 0]));
}

export function clampAdjustment(key, value) {
  const { min, max } = byKey[key];
  return Math.round(Math.min(max, Math.max(min, value)));
}

export function normalizeAdjustments(input = {}) {
  const out = defaultAdjustments();
  for (const key of ADJUSTMENT_KEYS) {
    const value = Number(input[key]);
    if (Number.isFinite(value)) out[key] = clampAdjustment(key, value);
  }
  return out;
}

export function isNeutral(adjustments) {
  return ADJUSTMENT_KEYS.every((key) => !adjustments[key]);
}
