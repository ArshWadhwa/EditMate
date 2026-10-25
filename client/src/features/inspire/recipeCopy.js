/**
 * Generates human-readable descriptions of adjustments applied by a recipe.
 */

const INTENTS = {
  brightness: ['Lift the overall exposure', 'Bring exposure down'],
  contrast: ['Stronger light/dark separation', 'Softer, flatter tones'],
  highlights: ['Brighten the bright areas', 'Recover bright areas'],
  shadows: ['Open up the shadows', 'Deepen the shadows'],
  fade: ['Matte, lifted blacks'],
  warmth: ['Warmer colour cast', 'Cooler colour cast'],
  tint: ['Shift towards magenta', 'Shift towards green'],
  saturation: ['Richer colours', 'More muted colours'],
  vibrance: ['Boost the quieter colours', 'Calm the quieter colours'],
  vignette: ['Darken the edges'],
  grain: ['Film-like texture'],
};

export function describeIntent(key, value) {
  const [up, down = up] = INTENTS[key] ?? [''];
  return value >= 0 ? up : down;
}

export function significantSteps(adjustments, limit = 6) {
  return Object.entries(adjustments)
    .filter(([, value]) => Math.abs(value) >= 3)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, limit)
    .map(([key, value]) => ({ key, value, intent: describeIntent(key, value) }));
}
