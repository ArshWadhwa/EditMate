import { drawLayer, needsMask } from './layers.js';

/**
 * Final compositing stage, after the pixel pipeline:
 *
 *   backdrop (original photo | transparent | colour | image | blurred photo)
 *   → subject (photo masked by the segmentation alpha)
 *   → layers, bottom to top
 *
 * Runs with canvas 2D compositing, so it's GPU-accelerated in most browsers and cheap enough
 * to redo on every pointer move. The same function renders the preview and the export.
 */

const scratch = new Map();

/** Reusable offscreen canvas per purpose, resized on demand. */
function scratchCanvas(key, width, height) {
  let canvas = scratch.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    scratch.set(key, canvas);
  }
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function drawCover(ctx, image, W, H) {
  const scale = Math.max(W / image.width, H / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h);
}

let filterSupport;
/** Canvas `filter` is missing in some browsers (Safari); detect once by blurring a single pixel. */
function supportsCanvasFilter() {
  if (filterSupport !== undefined) return filterSupport;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.filter = 'blur(2px)';
    ctx.fillRect(4, 4, 1, 1);
    filterSupport = ctx.getImageData(2, 4, 1, 1).data[3] > 0;
  } catch {
    filterSupport = false;
  }
  return filterSupport;
}

/**
 * Blurs `image` over the whole canvas. The radius is a fraction of the image size, so the preview
 * and a full-resolution export look the same. Edges are overdrawn to avoid a dark fade-in.
 */
function drawBlurred(ctx, image, W, H, amount) {
  const radius = (amount / 100) * 0.04 * Math.max(W, H);
  const bleed = radius * 2;

  if (supportsCanvasFilter()) {
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(image, -bleed, -bleed, W + bleed * 2, H + bleed * 2);
    ctx.restore();
    return;
  }

  // Fallback: halve repeatedly, then double back up. Each 2× step with smoothing acts as a small
  // box filter, which together approximate a Gaussian far better than one big rescale.
  let src = image;
  let w = W;
  let h = H;
  for (let i = 0; w > 8 && h > 8 && 2 ** i < radius; i++) {
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
    const step = scratchCanvas(`blur-${i}`, w, h);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, w, h);
    src = step;
  }
  for (let i = 0; w * 2 < W; i++) {
    w *= 2;
    h *= 2;
    const step = scratchCanvas(`blur-up-${i}`, w, h);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(src, 0, 0, w, h);
    src = step;
  }
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, -bleed, -bleed, W + bleed * 2, H + bleed * 2);
  ctx.restore();
}

/**
 * @param {HTMLCanvasElement} target         resized to match `photo`
 * @param {object} scene
 * @param {CanvasImageSource & {width:number,height:number}} scene.photo  adjusted photo
 * @param {CanvasImageSource | null} scene.mask   subject alpha, same size as photo (or null)
 * @param {object} scene.background             { mode, color, assetId, blur }
 * @param {object[]} scene.layers
 * @param {Map} scene.assets                    assetId → { bitmap }
 */
export function compose(target, { photo, mask, background, layers, assets }) {
  const W = photo.width;
  const H = photo.height;
  if (target.width !== W || target.height !== H) {
    target.width = W;
    target.height = H;
  }
  const ctx = target.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  if (!needsMask(background) || !mask) {
    ctx.drawImage(photo, 0, 0);
  } else {
    if (background.mode === 'color') {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, W, H);
    } else if (background.mode === 'image') {
      const asset = assets.get(background.assetId);
      if (asset) drawCover(ctx, asset.bitmap, W, H);
    } else if (background.mode === 'blur') {
      drawBlurred(ctx, photo, W, H, background.blur);
    }
    // 'transparent' leaves the backdrop empty.

    // compose() is synchronous, so preview and export can share one scratch canvas.
    const subject = scratchCanvas('subject', W, H);
    const sctx = subject.getContext('2d');
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, W, H);
    sctx.drawImage(photo, 0, 0);
    sctx.globalCompositeOperation = 'destination-in';
    sctx.drawImage(mask, 0, 0, W, H);
    sctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(subject, 0, 0);
  }

  for (const layer of layers) drawLayer(ctx, layer, W, H, assets);
  return target;
}

/** True when the edit needs the compositing stage at all (keeps the fast path for plain photo edits). */
export const hasComposition = (doc) => doc.layers.length > 0 || needsMask(doc.background);

/** Transparent output can only be kept in formats with alpha. */
export const needsAlpha = (doc) => doc.background.mode === 'transparent';
