import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { constrainRect, createFrame, fitAspect, isRectOnImage, largestRect, moveRect, resizeRect } from '../src/engine/cropMath.js';

const close = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

describe('crop math', () => {
  const flat = createFrame(4000, 3000, 0);

  test('free resize from a corner moves only that corner', () => {
    const r = resizeRect({ x: 100, y: 100, width: 1000, height: 800 }, 'se', 200, -100, null, 50);
    assert.deepEqual(r, { x: 100, y: 100, width: 1200, height: 700 });
  });

  test('locked corner resize keeps the ratio and anchors the opposite corner', () => {
    const start = { x: 1000, y: 1000, width: 1000, height: 1000 };
    const r = resizeRect(start, 'nw', -300, -50, 1, 50);
    close(r.width / r.height, 1, 0.001);
    close(r.x + r.width, 2000);
    close(r.y + r.height, 2000);
  });

  test('locked edge resize grows symmetrically on the other axis', () => {
    const r = resizeRect({ x: 1000, y: 1000, width: 800, height: 400 }, 'e', 200, 0, 2, 50);
    assert.equal(r.width, 1000);
    assert.equal(r.height, 500);
    close(r.y + r.height / 2, 1200);
  });

  test('resizing never inverts or shrinks below the minimum', () => {
    const r = resizeRect({ x: 0, y: 0, width: 300, height: 300 }, 'w', 1000, 0, null, 50);
    assert.equal(r.width, 50);
  });

  test('moves stop at the image edge instead of leaving it', () => {
    const start = { x: 3000, y: 100, width: 800, height: 800 };
    const r = constrainRect(flat, start, moveRect(start, 900, 0));
    close(r.x + r.width, 4000);
    assert.ok(isRectOnImage(flat, r));
  });

  test('a straightened image rejects rects that reach into empty corners', () => {
    const tilted = createFrame(4000, 3000, 10);
    assert.equal(isRectOnImage(tilted, { x: 0, y: 0, width: tilted.W, height: tilted.H }), false);
    const best = largestRect(tilted, 4 / 3);
    assert.ok(isRectOnImage(tilted, best));
    close(best.width / best.height, 4 / 3, 0.01);
    assert.ok(best.width > 3000, `largest rect only ${best.width}px wide`);
  });

  test('fitAspect stays within the source rect', () => {
    const r = fitAspect({ x: 0, y: 0, width: 4000, height: 3000 }, 9 / 16);
    assert.ok(r.x >= 0 && r.x + r.width <= 4000 && r.height === 3000);
    close(r.width / r.height, 9 / 16, 0.001);
  });
});
