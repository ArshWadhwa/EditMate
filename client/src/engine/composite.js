/**
 * Canvas compositing engine for backgrounds, cutout masks, and overlay layers.
 */

import { drawLayer, layerBox, needsMask } from './layers.js';

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

function drawCover(ctx, image, W, H, blur = 0) {
  if (blur > 0) {
    const radius = (blur / 100) * 0.04 * Math.max(W, H);
    const bleed = Math.ceil(radius * 2);
    ctx.save();
    ctx.filter = `blur(${radius}px)`;
    const targetW = W + bleed * 2;
    const targetH = H + bleed * 2;
    const scale = Math.max(targetW / image.width, targetH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, -bleed + (targetW - w) / 2, -bleed + (targetH - h) / 2, w, h);
    ctx.restore();
  } else {
    const scale = Math.max(W / image.width, H / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h);
  }
}

function drawBlurred(ctx, image, W, H, amount) {
  const radius = (amount / 100) * 0.04 * Math.max(W, H);
  const bleed = radius * 2;
  ctx.save();
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(image, -bleed, -bleed, W + bleed * 2, H + bleed * 2);
  ctx.restore();
}

function drawSubjectLayer(ctx, layer, W, H, subject) {
  if (layer.hidden) return;
  const isDefaultPlacement =
    layer.x === 0.5 &&
    layer.y === 0.5 &&
    layer.w === 1 &&
    layer.h === 1 &&
    (!layer.rotation || layer.rotation === 0) &&
    (layer.opacity === undefined || layer.opacity === 1) &&
    (!layer.blend || layer.blend === 'source-over');

  if (isDefaultPlacement) {
    ctx.drawImage(subject, 0, 0, W, H);
  } else {
    const box = layerBox(layer, W, H);
    ctx.save();
    ctx.translate(box.cx, box.cy);
    if (box.rotation) ctx.rotate((box.rotation * Math.PI) / 180);
    ctx.globalAlpha = layer.opacity ?? 1;
    ctx.globalCompositeOperation = layer.blend || 'source-over';
    ctx.drawImage(subject, -box.w / 2, -box.h / 2, box.w, box.h);
    ctx.restore();
  }
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

  const hasSubjectLayer = layers && layers.some((l) => l.type === 'subject' || l.isSubject);

  if (!needsMask(background) || !mask) {
    ctx.drawImage(photo, 0, 0);
  } else {
    if (background.mode === 'color') {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, W, H);
    } else if (background.mode === 'image') {
      const asset = assets.get(background.assetId);
      if (asset) {
        const blur = background.imageBlur ?? background.blur ?? 0;
        drawCover(ctx, asset.bitmap, W, H, blur);
      }
    } else if (background.mode === 'blur') {
      drawBlurred(ctx, photo, W, H, background.blur);
    }

    let subjectCanvas = null;
    if (mask) {
      subjectCanvas = scratchCanvas('subject', W, H);
      const sctx = subjectCanvas.getContext('2d');
      sctx.globalCompositeOperation = 'source-over';
      sctx.clearRect(0, 0, W, H);
      sctx.drawImage(photo, 0, 0);
      sctx.globalCompositeOperation = 'destination-in';
      sctx.drawImage(mask, 0, 0, W, H);
      sctx.globalCompositeOperation = 'source-over';
    }

    if (!hasSubjectLayer && subjectCanvas) {
      ctx.drawImage(subjectCanvas, 0, 0);
    }

    for (const layer of layers) {
      if (layer.hidden) continue;
      if (layer.type === 'subject' || layer.isSubject) {
        if (subjectCanvas) drawSubjectLayer(ctx, layer, W, H, subjectCanvas);
      } else {
        drawLayer(ctx, layer, W, H, assets);
      }
    }
    return target;
  }

  for (const layer of layers) drawLayer(ctx, layer, W, H, assets);
  return target;
}

export const hasComposition = (doc) => doc.layers.length > 0 || needsMask(doc.background);

export const needsAlpha = (doc) => doc.background.mode === 'transparent';
