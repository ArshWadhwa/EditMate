/**
 * Crop rectangle math in the rotated bounding box's pixel space.
 *
 * A `frame` describes that space: the box size (W × H) and the rotated image inside it
 * (w × h at `rad`). Rects are { x, y, width, height } in box pixels. Every operation keeps
 * the rect fully on the image, so a straightened crop never includes empty corners.
 */

const EPSILON = 0.5;

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

function pointOnImage(frame, px, py) {
  const dx = px - frame.W / 2;
  const dy = py - frame.H / 2;
  const cos = Math.cos(-frame.rad);
  const sin = Math.sin(-frame.rad);
  const u = dx * cos - dy * sin;
  const v = dx * sin + dy * cos;
  return Math.abs(u) <= frame.w / 2 + EPSILON && Math.abs(v) <= frame.h / 2 + EPSILON;
}

export function isRectOnImage(frame, { x, y, width, height }) {
  return (
    width > 0 &&
    height > 0 &&
    pointOnImage(frame, x, y) &&
    pointOnImage(frame, x + width, y) &&
    pointOnImage(frame, x, y + height) &&
    pointOnImage(frame, x + width, y + height)
  );
}

const lerpRect = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  width: a.width + (b.width - a.width) * t,
  height: a.height + (b.height - a.height) * t,
});

/**
 * Moves from a valid rect towards `next`, stopping at the last position still on the image.
 * Works for moves and resizes alike, so dragging into an edge slides to a stop instead of jumping.
 */
export function constrainRect(frame, valid, next) {
  if (isRectOnImage(frame, next)) return next;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (isRectOnImage(frame, lerpRect(valid, next, mid))) lo = mid;
    else hi = mid;
  }
  return lerpRect(valid, next, lo);
}

export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Resizes `start` by dragging `handle` by (dx, dy) box pixels. With `aspect` (width / height),
 * corners keep the ratio and edges grow the other side symmetrically.
 */
export function resizeRect(start, handle, dx, dy, aspect, minSize) {
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  if (handle.includes('w')) left = Math.min(left + dx, right - minSize);
  if (handle.includes('e')) right = Math.max(right + dx, left + minSize);
  if (handle.includes('n')) top = Math.min(top + dy, bottom - minSize);
  if (handle.includes('s')) bottom = Math.max(bottom + dy, top + minSize);

  if (!aspect) return { x: left, y: top, width: right - left, height: bottom - top };

  let width = right - left;
  let height = bottom - top;
  const corner = handle.length === 2;

  if (corner) {
    // Follow whichever axis the pointer moved further, relative to the ratio.
    if (width / aspect > height) height = width / aspect;
    else width = height * aspect;
    width = Math.max(width, minSize * Math.max(1, aspect));
    height = width / aspect;
    const x = handle.includes('w') ? start.x + start.width - width : start.x;
    const y = handle.includes('n') ? start.y + start.height - height : start.y;
    return { x, y, width, height };
  }

  if (handle === 'e' || handle === 'w') {
    height = width / aspect;
    const cy = start.y + start.height / 2;
    return { x: left, y: cy - height / 2, width, height };
  }
  width = height * aspect;
  const cx = start.x + start.width / 2;
  return { x: cx - width / 2, y: top, width, height };
}

export const moveRect = (rect, dx, dy) => ({ ...rect, x: rect.x + dx, y: rect.y + dy });

/** Shrinks `rect` around its centre to match `aspect`; always stays inside the original rect. */
export function fitAspect(rect, aspect) {
  if (!aspect) return rect;
  let { width, height } = rect;
  if (width / height > aspect) width = height * aspect;
  else height = width / aspect;
  return { x: rect.x + (rect.width - width) / 2, y: rect.y + (rect.height - height) / 2, width, height };
}

/** Largest centred rect of `aspect` (or the image's own) that sits fully on the image. */
export function largestRect(frame, aspect) {
  const ratio = aspect ?? frame.w / frame.h;
  const full = fitAspect({ x: 0, y: 0, width: frame.W, height: frame.H }, ratio);
  if (isRectOnImage(frame, full)) return full;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const w = full.width * mid;
    const h = full.height * mid;
    const candidate = { x: (frame.W - w) / 2, y: (frame.H - h) / 2, width: w, height: h };
    if (isRectOnImage(frame, candidate)) lo = mid;
    else hi = mid;
  }
  const w = full.width * lo;
  const h = full.height * lo;
  return { x: (frame.W - w) / 2, y: (frame.H - h) / 2, width: w, height: h };
}

/** Pixel rect ↔ the 0..1 fractions stored in geometry.crop. */
export const toFractions = (frame, r) => ({ x: r.x / frame.W, y: r.y / frame.H, width: r.width / frame.W, height: r.height / frame.H });
export const fromFractions = (frame, f) => ({ x: f.x * frame.W, y: f.y * frame.H, width: f.width * frame.W, height: f.height * frame.H });
