import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { containsPoint, hitTest, resizeBox, rotationTowards, toLocal } from '../src/engine/layerMath.js';

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const corner = (box, sx, sy) => {
  const r = (box.rotation * Math.PI) / 180;
  const x = (sx * box.w) / 2;
  const y = (sy * box.h) / 2;
  return { x: box.cx + x * Math.cos(r) - y * Math.sin(r), y: box.cy + x * Math.sin(r) + y * Math.cos(r) };
};

describe('layer math', () => {
  const box = { cx: 500, cy: 400, w: 200, h: 100, rotation: 0 };

  test('hit testing respects rotation and paint order', () => {
    const rotated = { ...box, rotation: 90 };
    assert.equal(containsPoint(rotated, 500, 480), true); // inside after rotating 90°
    assert.equal(containsPoint(rotated, 590, 400), false);
    const top = { ...box, cx: 520 };
    assert.equal(hitTest([box, top], 520, 400), 1);
    assert.equal(hitTest([box, top], 405, 400), 0);
    assert.equal(hitTest([box, top], 10, 10), -1);
  });

  test('corner resize keeps the opposite corner fixed, even when rotated', () => {
    for (const rotation of [0, 30, -120]) {
      const start = { ...box, rotation };
      const anchor = corner(start, -1, -1);
      const { box: next } = resizeBox(start, 'se', 40, 25);
      const moved = corner(next, -1, -1);
      close(moved.x, anchor.x, 1e-6);
      close(moved.y, anchor.y, 1e-6);
    }
  });

  test('aspect-locked resize scales uniformly', () => {
    const { box: next, scale } = resizeBox(box, 'ne', 100, 0, { keepAspect: true });
    close(next.w / next.h, 2);
    close(scale, 1.5);
  });

  test('side handles change width only', () => {
    const { box: next } = resizeBox(box, 'w', -50, 30);
    assert.equal(next.w, 250);
    assert.equal(next.h, 100);
    close(next.cx + next.w / 2, box.cx + box.w / 2); // right edge stays put
  });

  test('resizing never collapses below the minimum', () => {
    const { box: next } = resizeBox(box, 'se', -1000, -1000, { minSize: 12 });
    assert.equal(next.w, 12);
    assert.equal(next.h, 12);
  });

  test('rotation follows the pointer and snaps near right angles', () => {
    assert.equal(rotationTowards(box, 500, 100), 0); // straight up
    assert.equal(rotationTowards(box, 900, 402), 90); // within snap range
    close(rotationTowards(box, 600, 300), 45, 0.1);
    assert.equal(rotationTowards(box, 600, 290, { step: true }), 45);
  });

  test('toLocal undoes rotation', () => {
    const p = toLocal({ ...box, rotation: 90 }, 500, 450);
    close(p.x, 50);
    close(p.y, 0);
  });
});
