import { normalizeAdjustments } from '@editmate/shared';

const preset = (id, name, adjustments) => ({ id, name, builtIn: true, adjustments: normalizeAdjustments(adjustments) });

export const BUILT_IN_PRESETS = [
  preset('golden-hour', 'Golden hour', { brightness: 5, contrast: 14, highlights: -22, shadows: 10, warmth: 30, tint: 6, saturation: 6, vibrance: 12 }),
  preset('moody', 'Moody', { brightness: -14, contrast: 24, highlights: -30, shadows: -12, warmth: -6, saturation: -18, vignette: 35 }),
  preset('faded-film', 'Faded film', { contrast: -12, highlights: -18, fade: 38, warmth: 10, saturation: -16, grain: 22 }),
  preset('clean-editorial', 'Clean editorial', { brightness: 8, contrast: 10, highlights: -12, shadows: 14, saturation: -6, vibrance: 10 }),
  preset('cool-crisp', 'Cool & crisp', { contrast: 18, highlights: -10, warmth: -24, tint: -4, vibrance: 16 }),
  preset('vibrant-pop', 'Vibrant pop', { brightness: 4, contrast: 20, shadows: 8, saturation: 22, vibrance: 26 }),
  preset('bright-airy', 'Bright & airy', { brightness: 24, contrast: -10, highlights: -14, shadows: 30, fade: 10, saturation: -8 }),
  preset('noir', 'Noir', { contrast: 36, highlights: -12, shadows: -18, saturation: -100, vignette: 40, grain: 26 }),
];
