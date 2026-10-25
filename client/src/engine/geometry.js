/**
 * Geometry calculations for crop, rotation, flip, and straightening.
 */

export const defaultGeometry = () => ({
  quarterTurns: 0,
  straighten: 0,
  flipH: false,
  crop: null,
});

export const isDefaultGeometry = (g) =>
  !g.quarterTurns && !g.straighten && !g.flipH && !g.crop;

export const totalRotation = (g) => g.quarterTurns * 90 + g.straighten;

export function rotatedSize(width, height, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

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

export function outputSize(width, height, geometry) {
  const box = rotatedSize(width, height, totalRotation(geometry));
  const crop = effectiveCrop(width, height, geometry);
  return {
    width: Math.max(1, Math.round(box.width * crop.width)),
    height: Math.max(1, Math.round(box.height * crop.height)),
  };
}

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

export function createFrame(imageWidth, imageHeight, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    W: imageWidth * cos + imageHeight * sin,
    H: imageWidth * sin + imageHeight * cos,
    w: imageWidth,
    h: imageHeight,
    rad,
  };
}

export function fitAspect(rect, aspect) {
  if (!aspect) return rect;
  let width = rect.width;
  let height = width / aspect;
  if (height > rect.height) {
    height = rect.height;
    width = height * aspect;
  }
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

export function largestRect(frame, aspect) {
  return fitAspect({ x: 0, y: 0, width: frame.W, height: frame.H }, aspect ?? frame.w / frame.h);
}

export const constrainRect = (_frame, _valid, next) => next;

export const toFractions = (frame, r) => ({
  x: r.x / frame.W,
  y: r.y / frame.H,
  width: r.width / frame.W,
  height: r.height / frame.H,
});

export const fromFractions = (frame, f) => ({
  x: f.x * frame.W,
  y: f.y * frame.H,
  width: f.width * frame.W,
  height: f.height * frame.H,
});
