/**
 * Canvas compositing engine for backgrounds, cutout masks, and overlay layers.
 */

import { drawLayer, needsMask } from './layers.js';

const scratch = new Map();

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

function drawBlurred(ctx, image, W, H, amount) {
  const radius = (amount / 100) * 0.04 * Math.max(W, H);
  const bleed = radius * 2;
  ctx.save();
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(image, -bleed, -bleed, W + bleed * 2, H + bleed * 2);
  ctx.restore();
}

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

export const hasComposition = (doc) => doc.layers.length > 0 || needsMask(doc.background);

export const needsAlpha = (doc) => doc.background.mode === 'transparent';
