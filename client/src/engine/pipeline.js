/**
 * Non-destructive pixel pipeline. Pure functions over RGBA buffers so the same code
 * runs in the preview worker, the export worker and the recipe fitter.
 *
 * Order: white balance -> tone curve (both folded into per-channel LUTs)
 *        -> saturation/vibrance -> vignette -> grain.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Tone curve for a normalized value. Every term keeps 0 and 1 anchored except fade. */
export function toneCurve(v, { brightness, contrast, highlights, shadows, fade }) {
  if (brightness) v = Math.pow(v, Math.pow(2, -brightness * 0.009));

  if (contrast) {
    const k = Math.pow(2, contrast * 0.012);
    v = v < 0.5 ? 0.5 * Math.pow(2 * v, k) : 1 - 0.5 * Math.pow(2 * (1 - v), k);
  }

  // Bell-shaped weights centred on the lower and upper thirds of the range.
  if (shadows) v = clamp01(v + shadows * 0.0035 * 4 * v * (1 - v) * (1 - v));
  if (highlights) v = clamp01(v + highlights * 0.0035 * 4 * v * v * (1 - v));

  if (fade) v = fade * 0.0022 + v * (1 - fade * 0.0022);

  return clamp01(v);
}

/** Builds the three per-channel lookup tables that combine white balance and tone. */
export function buildChannelLuts(adj) {
  // Warmth trades red against blue; tint moves green only (positive = magenta).
  const gains = [1 + adj.warmth * 0.003, 1 - adj.tint * 0.0015, 1 - adj.warmth * 0.003];

  return gains.map((gain) => {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(toneCurve(clamp01((i / 255) * gain), adj) * 255);
    return lut;
  });
}

/** Deterministic triangular noise in [-1, 1]; stable across renders so grain never shimmers. */
function noise(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 0xffff) + ((h >>> 16) & 0xffff)) / 65535 - 1;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Grain cells grow with resolution so a full-size export looks like the preview. */
export const grainCellSize = (width) => Math.max(1, Math.round(width / 1600));

/**
 * Writes `src` with `adj` applied into `dst`. Both are RGBA buffers of width * height * 4.
 */
export function applyAdjustments(src, dst, width, height, adj) {
  const [lutR, lutG, lutB] = buildChannelLuts(adj);

  const satFactor = 1 + adj.saturation / 100;
  const vibrance = adj.vibrance / 100;
  const doColor = adj.saturation !== 0 || vibrance !== 0;

  const vignette = adj.vignette / 100;
  const grain = adj.grain / 100;
  const cell = grainCellSize(width);
  const grainAmp = grain * 46;

  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const invCx = cx > 0 ? 1 / cx : 0;
  const invCy = cy > 0 ? 1 / cy : 0;

  for (let y = 0, i = 0; y < height; y++) {
    const dy = (y - cy) * invCy;
    const dy2 = dy * dy;
    const gy = (y / cell) | 0;

    for (let x = 0; x < width; x++, i += 4) {
      let r = lutR[src[i]];
      let g = lutG[src[i + 1]];
      let b = lutB[src[i + 2]];

      if (doColor) {
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        let factor = satFactor;
        if (vibrance) {
          const max = r > g ? (r > b ? r : b) : g > b ? g : b;
          const min = r < g ? (r < b ? r : b) : g < b ? g : b;
          const chroma = (max - min) / 255;
          factor *= 1 + vibrance * (1 - chroma) * (1 - chroma);
        }
        r = lum + (r - lum) * factor;
        g = lum + (g - lum) * factor;
        b = lum + (b - lum) * factor;
      }

      if (vignette) {
        const dx = (x - cx) * invCx;
        const d = Math.sqrt((dx * dx + dy2) * 0.5);
        const shade = 1 - vignette * 0.8 * smoothstep(0.3, 1, d);
        r *= shade;
        g *= shade;
        b *= shade;
      }

      if (grain) {
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        const weight = 0.35 + 2.6 * lum * (1 - lum);
        const n = noise((x / cell) | 0, gy) * grainAmp * weight;
        r += n;
        g += n;
        b += n;
      }

      dst[i] = r;
      dst[i + 1] = g;
      dst[i + 2] = b;
      dst[i + 3] = src[i + 3];
    }
  }

  return dst;
}

/** 256-bin histograms per channel plus luminance, sampled on every `step`-th pixel. */
export function computeHistogram(data, step = 2) {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const l = new Uint32Array(256);
  const stride = step * 4;

  for (let i = 0; i < data.length; i += stride) {
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    r[R]++;
    g[G]++;
    b[B]++;
    l[(0.2126 * R + 0.7152 * G + 0.0722 * B + 0.5) | 0]++;
  }

  return { r, g, b, l };
}
