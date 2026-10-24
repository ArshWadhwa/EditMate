import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdjustments, defaultAdjustments, isNeutral, ADJUSTMENT_KEYS } from '../src/index.js';

test('normalizeAdjustments fills defaults, clamps and drops unknown keys', () => {
  const result = normalizeAdjustments({ brightness: 250, fade: -10, grain: '12.6', bogus: 5 });
  assert.equal(result.brightness, 100);
  assert.equal(result.fade, 0);
  assert.equal(result.grain, 13);
  assert.equal(result.contrast, 0);
  assert.equal('bogus' in result, false);
  assert.deepEqual(Object.keys(result), ADJUSTMENT_KEYS);
});

test('isNeutral detects untouched adjustments', () => {
  assert.equal(isNeutral(defaultAdjustments()), true);
  assert.equal(isNeutral({ ...defaultAdjustments(), tint: -1 }), false);
});
