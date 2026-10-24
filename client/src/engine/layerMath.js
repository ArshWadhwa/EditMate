/**
 * Pure geometry for layers. Boxes are in output pixels: { cx, cy, w, h, rotation (deg) }.
 * Layers store the same thing as fractions of the output so they survive crops and exports.
 */

const toRad = (deg) => (deg * Math.PI) / 180;

/** Rotates (x, y) by `deg` degrees. */
export function rotate(x, y, deg) {
  const r = toRad(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Point in the box's own (unrotated, centre-origin) coordinates. */
export function toLocal(box, px, py) {
  return rotate(px - box.cx, py - box.cy, -box.rotation);
}

export function containsPoint(box, px, py, padding = 0) {
  const p = toLocal(box, px, py);
  return Math.abs(p.x) <= box.w / 2 + padding && Math.abs(p.y) <= box.h / 2 + padding;
}

/** Index of the top-most box under the point, or -1. `boxes` are in paint order (bottom first). */
export function hitTest(boxes, px, py, padding = 0) {
  for (let i = boxes.length - 1; i >= 0; i--) if (boxes[i] && containsPoint(boxes[i], px, py, padding)) return i;
  return -1;
}

export const CORNERS = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
export const SIDES = { e: [1, 0], w: [-1, 0] };

/**
 * Resizes a box by dragging a handle by (dx, dy) screen-aligned output pixels.
 * The opposite corner/side stays fixed, also when the box is rotated.
 *
 * @param {'nw'|'ne'|'se'|'sw'|'e'|'w'} handle
 * @param {{ keepAspect?: boolean, minSize?: number }} options
 * @returns {{ box, scale }} `scale` is the uniform factor applied when keepAspect is set
 */
export function resizeBox(box, handle, dx, dy, { keepAspect = false, minSize = 8 } = {}) {
  const [sx, sy] = CORNERS[handle] ?? SIDES[handle];
  const local = rotate(dx, dy, -box.rotation);

  let w = sx ? Math.max(minSize, box.w + sx * local.x) : box.w;
  let h = sy ? Math.max(minSize, box.h + sy * local.y) : box.h;
  let scale = 1;

  if (keepAspect) {
    // Follow the axis the pointer moved further along, relative to the box's size.
    scale = sy === 0 ? w / box.w : Math.abs(w / box.w - 1) > Math.abs(h / box.h - 1) ? w / box.w : h / box.h;
    scale = Math.max(scale, minSize / Math.min(box.w, box.h));
    w = box.w * scale;
    h = box.h * scale;
  }

  // Shift the centre so the anchored edge doesn't move.
  const shift = rotate((sx * (w - box.w)) / 2, (sy * (h - box.h)) / 2, box.rotation);
  return { box: { ...box, cx: box.cx + shift.x, cy: box.cy + shift.y, w, h }, scale };
}

/** Rotation (deg) that points the box's top at the pointer; snaps to 0/90/180/270 within 3°, or 15° steps with `step`. */
export function rotationTowards(box, px, py, { step = false } = {}) {
  let deg = (Math.atan2(py - box.cy, px - box.cx) * 180) / Math.PI + 90;
  deg = ((deg % 360) + 540) % 360 - 180;
  if (step) return Math.round(deg / 15) * 15;
  const nearest = Math.round(deg / 90) * 90;
  return Math.abs(deg - nearest) < 3 ? nearest : Math.round(deg * 10) / 10;
}
