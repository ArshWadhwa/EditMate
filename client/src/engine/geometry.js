/**
 * Geometry is stored resolution-independently so the same edit renders the preview
 * and the full-size export:
 *   - quarterTurns: 0..3 clockwise 90° steps
 *   - straighten:   fine rotation in degrees, -45..45
 *   - flipH:        mirror the final result
 *   - crop:         { x, y, width, height } as 0..1 fractions of the rotated bounding box,
 *                   or null for "whole image" (auto-trimmed when straightened)
 */
export const defaultGeometry = () => ({ quarterTurns: 0, straighten: 0, flipH: false, crop: null });

export const isDefaultGeometry = (g) => !g.quarterTurns && !g.straighten && !g.flipH && !g.crop;

export const totalRotation = (g) => g.quarterTurns * 90 + g.straighten;

export function rotatedSize(width, height, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return { width: width * cos + height * sin, height: width * sin + height * cos };
}

/**
 * Largest centred rectangle with the image's (post quarter-turn) aspect ratio that fits
 * inside the straightened image, so straightening never shows empty corners.
 */
export function autoStraightenCrop(width, height, geometry) {
  const turned = geometry.quarterTurns % 2 ? { width: height, height: width } : { width, height };
  const rad = (Math.abs(geometry.straighten) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const { width: w, height: h } = turned;
  const scale = Math.min(w / (w * cos + h * sin), h / (w * sin + h * cos));
  const box = rotatedSize(w, h, geometry.straighten);
  const cw = (w * scale) / box.width;
  const ch = (h * scale) / box.height;
  return { x: (1 - cw) / 2, y: (1 - ch) / 2, width: cw, height: ch };
}

export function effectiveCrop(width, height, geometry) {
  if (geometry.crop) return geometry.crop;
  if (geometry.straighten) return autoStraightenCrop(width, height, geometry);
  return { x: 0, y: 0, width: 1, height: 1 };
}

/** Pixel size of the edited result at full resolution. */
export function outputSize(width, height, geometry) {
  const box = rotatedSize(width, height, totalRotation(geometry));
  const crop = effectiveCrop(width, height, geometry);
  return {
    width: Math.max(1, Math.round(box.width * crop.width)),
    height: Math.max(1, Math.round(box.height * crop.height)),
  };
}

/**
 * Draws `source` with `geometry` applied onto a new canvas whose longest side is at most
 * `maxSize` (pass Infinity for full resolution).
 *
 * @param {CanvasImageSource & { width: number, height: number }} source
 */
export function renderGeometry(source, geometry, maxSize = Infinity) {
  const { width, height } = source;
  const degrees = totalRotation(geometry);
  const box = rotatedSize(width, height, degrees);
  const crop = effectiveCrop(width, height, geometry);

  const cropW = box.width * crop.width;
  const cropH = box.height * crop.height;
  const scale = Math.min(1, maxSize / Math.max(cropW, cropH));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cropW * scale));
  canvas.height = Math.max(1, Math.round(cropH * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (geometry.flipH) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.scale(scale, scale);
  ctx.translate(-box.width * crop.x, -box.height * crop.y);
  ctx.translate(box.width / 2, box.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(source, -width / 2, -height / 2);

  return canvas;
}

/** Downscales any canvas so its longest side is at most `maxSize`. */
export function downscale(canvas, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(canvas.width * scale));
  out.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

export const readPixels = (canvas) =>
  canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
