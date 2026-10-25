import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFrame, fitAspect, fromFractions, largestRect, toFractions } from '../src/engine/geometry.js';

const close = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

describe('crop math', () => {
  const flat = createFrame(4000, 3000, 0);

  test('createFrame sets rotated dimensions', () => {
    assert.equal(flat.W, 4000);
    assert.equal(flat.H, 3000);
    const turned = createFrame(4000, 3000, 90);
    close(turned.W, 3000);
    close(turned.H, 4000);
  });

  test('fitAspect keeps aspect ratio and stays within source rect', () => {
    const r = fitAspect({ x: 0, y: 0, width: 4000, height: 3000 }, 16 / 9);
    assert.ok(r.x >= 0 && r.x + r.width <= 4000);
    close(r.width / r.height, 16 / 9, 0.001);
  });

  test('largestRect fits in frame', () => {
    const r = largestRect(flat, 1);
    assert.equal(r.width, 3000);
    assert.equal(r.height, 3000);
  });

  test('fraction conversion roundtrips accurately', () => {
    const rect = { x: 500, y: 300, width: 2000, height: 1500 };
    const fractions = toFractions(flat, rect);
    const roundtrip = fromFractions(flat, fractions);
    assert.deepEqual(roundtrip, rect);
  });
});
