import { ADJUSTMENTS, clampAdjustment, defaultAdjustments } from '@editmate/shared';
import { applyAdjustments } from './pipeline.js';

/**
 * Measured properties describe what is in an image. They are never used as slider
 * values directly: `fitAdjustments` searches for the slider values that move *your*
 * photo's measurements towards a target, which is what makes a recipe transferable.
 */

const LUM_R = 0.2126;
const LUM_G = 0.7152;
const LUM_B = 0.0722;

function percentile(histogram, total, p) {
  const target = total * p;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += histogram[i];
    if (acc >= target) return i / 255;
  }
  return 1;
}

/**
 * @param {Uint8ClampedArray} data RGBA pixels
 * @param {{ sampleTarget?: number }} options roughly how many pixels to sample
 */
export function measure(data, width, height, { sampleTarget = Infinity } = {}) {
  const pixels = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(pixels / sampleTarget)));
  const lumHist = new Uint32Array(256);

  let n = 0;
  let sumL = 0;
  let sumL2 = 0;
  let sumChroma = 0;
  let sumWarm = 0;
  let sumTint = 0;
  let edgeL = 0;
  let edgeN = 0;
  let centerL = 0;
  let centerN = 0;

  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y += step) {
    const ny = (y - cy) / cy;
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = (LUM_R * r + LUM_G * g + LUM_B * b) / 255;

      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;

      n++;
      sumL += l;
      sumL2 += l * l;
      sumChroma += (max - min) / 255;
      sumWarm += (r - b) / 255;
      sumTint += (g - (r + b) / 2) / 255;
      lumHist[(l * 255 + 0.5) | 0]++;

      const nx = (x - cx) / cx;
      const d = nx * nx + ny * ny;
      if (d > 1.1) {
        edgeL += l;
        edgeN++;
      } else if (d < 0.2) {
        centerL += l;
        centerN++;
      }
    }
  }

  const mean = sumL / n;
  const centerMean = centerN ? centerL / centerN : mean;
  const edgeMean = edgeN ? edgeL / edgeN : mean;

  return {
    brightness: mean,
    contrast: Math.sqrt(Math.max(0, sumL2 / n - mean * mean)),
    saturation: sumChroma / n,
    warmth: sumWarm / n,
    tint: sumTint / n,
    shadows: percentile(lumHist, n, 0.05),
    highlights: percentile(lumHist, n, 0.95),
    blackPoint: percentile(lumHist, n, 0.01),
    falloff: centerMean > 0.02 ? edgeMean / centerMean : 1,
  };
}

/** Median absolute Laplacian of luminance: a texture/noise estimate that ignores most edges. */
export function measureNoise(data, width, height) {
  const lum = new Float32Array(width * height);
  for (let p = 0, i = 0; p < lum.length; p++, i += 4) {
    lum[p] = LUM_R * data[i] + LUM_G * data[i + 1] + LUM_B * data[i + 2];
  }

  const bins = new Uint32Array(256);
  let total = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const p = y * width + x;
      const lap = Math.abs(4 * lum[p] - lum[p - 1] - lum[p + 1] - lum[p - width] - lum[p + width]);
      bins[Math.min(255, lap | 0)]++;
      total++;
    }
  }
  return total ? percentile(bins, total, 0.5) * 255 : 0;
}

/**
 * Each fitted dimension pairs a measured property with the slider that most directly
 * controls it. `scale` is a "noticeable difference" used to weight residuals.
 */
export const FIT_DIMENSIONS = [
  { stat: 'brightness', key: 'brightness', scale: 0.05 },
  { stat: 'contrast', key: 'contrast', scale: 0.04 },
  { stat: 'highlights', key: 'highlights', scale: 0.06 },
  { stat: 'shadows', key: 'shadows', scale: 0.05 },
  { stat: 'blackPoint', key: 'fade', scale: 0.04 },
  { stat: 'warmth', key: 'warmth', scale: 0.05 },
  { stat: 'tint', key: 'tint', scale: 0.03 },
  { stat: 'saturation', key: 'saturation', scale: 0.04 },
  { stat: 'falloff', key: 'vignette', scale: 0.1 },
];

const RANGE = Object.fromEntries(ADJUSTMENTS.map((a) => [a.key, a]));
const LAMBDA = 0.08;
const MU = 2e-4;

/** Solves the small dense system A x = b with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const div = M[col][col] || 1e-9;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / div;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / (M[r][r] || 1e-9);
  }
  return x;
}

/**
 * Finds slider values that bring `source` (a small RGBA thumbnail) closest to `target`
 * measurements, using damped Gauss-Newton with a numerically estimated Jacobian.
 *
 * @param {object} params
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} params.source
 * @param {Record<string, number>} params.target measurements to match (subset of `measure` output)
 * @param {object} [params.base] adjustments held fixed for keys not being fitted
 * @param {string[]} [params.keys] adjustment keys allowed to move
 */
export function fitAdjustments({ source, target, base = defaultAdjustments(), keys, iterations = 8 }) {
  const dims = FIT_DIMENSIONS.filter((d) => target[d.stat] !== undefined && (!keys || keys.includes(d.key)));
  const free = dims.map((d) => d.key);
  const buffer = new Uint8ClampedArray(source.data.length);

  const adjustmentsFor = (x) => {
    const adj = { ...base };
    free.forEach((key, j) => (adj[key] = x[j]));
    return adj;
  };

  const evaluate = (x) => {
    applyAdjustments(source.data, buffer, source.width, source.height, adjustmentsFor(x));
    const m = measure(buffer, source.width, source.height);
    return dims.map((d) => (target[d.stat] - m[d.stat]) / d.scale);
  };

  const clampX = (key, v) => Math.min(RANGE[key].max, Math.max(RANGE[key].min, v));

  let x = free.map((key) => base[key] ?? 0);
  let residual = evaluate(x);
  const initialError = rms(residual);
  const delta = 6;

  for (let iter = 0; iter < iterations; iter++) {
    // J[i][j] = d residual_i / d x_j (in slider units)
    const J = dims.map(() => new Array(free.length).fill(0));
    free.forEach((key, j) => {
      const step = x[j] + delta > RANGE[key].max ? -delta : delta;
      const probe = x.slice();
      probe[j] += step;
      const r = evaluate(probe);
      for (let i = 0; i < dims.length; i++) J[i][j] = (r[i] - residual[i]) / step;
    });

    // Levenberg-Marquardt step with a small pull towards neutral (prefer gentler edits):
    //   (JᵀJ + λ·diag(JᵀJ) + μI) Δ = -Jᵀr - μx
    // Sliders already at a bound and being pushed outwards are frozen and the step re-solved,
    // so an unreachable target can't drag every other slider to an extreme.
    const n = free.length;
    const solveStep = (frozen) => {
      const A = Array.from({ length: n }, () => new Array(n).fill(0));
      const g = new Array(n).fill(0);
      for (let a = 0; a < n; a++) {
        if (frozen.has(a)) {
          A[a][a] = 1;
          continue;
        }
        for (let i = 0; i < dims.length; i++) g[a] -= J[i][a] * residual[i];
        g[a] -= MU * x[a];
        for (let c = 0; c < n; c++) {
          if (frozen.has(c)) continue;
          let s = 0;
          for (let i = 0; i < dims.length; i++) s += J[i][a] * J[i][c];
          A[a][c] = s;
        }
        A[a][a] += LAMBDA * A[a][a] + MU;
      }
      return solve(A, g);
    };

    const frozen = new Set();
    let step = solveStep(frozen);
    free.forEach((key, j) => {
      const atMax = x[j] >= RANGE[key].max && step[j] > 0;
      const atMin = x[j] <= RANGE[key].min && step[j] < 0;
      if (atMax || atMin) frozen.add(j);
    });
    if (frozen.size) step = solveStep(frozen);

    const next = x.map((v, j) => clampX(free[j], v + Math.max(-35, Math.min(35, step[j]))));
    const nextResidual = evaluate(next);

    if (rms(nextResidual) >= rms(residual)) break;
    const moved = next.reduce((s, v, j) => s + Math.abs(v - x[j]), 0);
    x = next;
    residual = nextResidual;
    if (moved < 1) break;
  }

  const fitted = {};
  free.forEach((key, j) => (fitted[key] = clampAdjustment(key, x[j])));

  return {
    adjustments: { ...base, ...fitted },
    matchBefore: matchScore(initialError),
    matchAfter: matchScore(rms(residual)),
  };
}

function rms(values) {
  return values.length ? Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length) : 0;
}

/** Maps a weighted RMS residual to a friendly 0–100 similarity. */
const matchScore = (error) => Math.round(100 * Math.exp(-error / 3));

/** Grain isn't fitted (it barely moves global statistics); estimate it from texture difference. */
export function suggestGrain(referenceNoise, photoNoise) {
  return clampAdjustment('grain', Math.max(0, (referenceNoise - photoNoise) * 2));
}

export function classifyStyle(m) {
  if (m.saturation < 0.05) return m.contrast > 0.22 ? 'Noir' : 'Monochrome';
  if (m.blackPoint > 0.07 && m.contrast < 0.2) return 'Faded film';
  if (m.brightness < 0.3) return m.contrast > 0.18 ? 'Moody' : 'Low key';
  if (m.warmth > 0.08) return 'Golden hour';
  if (m.warmth < -0.05) return 'Cool & crisp';
  if (m.brightness > 0.6 && m.contrast < 0.22) return 'Bright & airy';
  if (m.saturation > 0.3) return 'Vibrant';
  return 'Clean editorial';
}

/** Dominant colours via coarse 4-bit-per-channel buckets, skipping near-duplicates. */
export function extractPalette(data, count = 5) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 16) {
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.n++;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
    } else {
      buckets.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }

  const colors = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map(({ n, r, g, b }) => [r / n, g / n, b / n]);

  const picked = [];
  for (const c of colors) {
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c);
    if (picked.length === count) break;
  }
  return picked.map((c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
