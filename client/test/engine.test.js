import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultAdjustments } from '@editmate/shared';
import { applyAdjustments, toneCurve } from '../src/engine/pipeline.js';
import { fitAdjustments, measure } from '../src/engine/analysis.js';
import { autoStraightenCrop, outputSize } from '../src/engine/geometry.js';
import { historyReducer, initialHistory } from '../src/state/history.js';

/** A small synthetic "photo": a warm-ish gradient with a darker band, so every stat has signal. */
function syntheticImage(width = 96, height = 64) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const t = x / (width - 1);
      const band = y > height * 0.6 ? 0.55 : 1;
      data[i] = (40 + 190 * t) * band;
      data[i + 1] = (50 + 150 * t) * band;
      data[i + 2] = (70 + 110 * (1 - t)) * band;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const adjust = (patch) => ({ ...defaultAdjustments(), ...patch });

describe('pipeline', () => {
  test('neutral adjustments are an exact identity', () => {
    const { data, width, height } = syntheticImage();
    const out = applyAdjustments(data, new Uint8ClampedArray(data.length), width, height, defaultAdjustments());
    assert.deepEqual(out, data);
  });

  test('tone curve keeps black and white anchored for contrast, highlights and shadows', () => {
    for (const patch of [{ contrast: 80 }, { contrast: -80 }, { highlights: -100 }, { shadows: 100 }]) {
      const adj = adjust(patch);
      assert.equal(toneCurve(0, adj), 0, JSON.stringify(patch));
      assert.equal(toneCurve(1, adj), 1, JSON.stringify(patch));
    }
  });

  test('every adjustment moves the statistic it is named after', () => {
    const img = syntheticImage();
    const base = measure(img.data, img.width, img.height);
    const render = (patch) => {
      const out = applyAdjustments(img.data, new Uint8ClampedArray(img.data.length), img.width, img.height, adjust(patch));
      return measure(out, img.width, img.height);
    };
    assert.ok(render({ brightness: 40 }).brightness > base.brightness);
    assert.ok(render({ contrast: 40 }).contrast > base.contrast);
    assert.ok(render({ saturation: -60 }).saturation < base.saturation);
    assert.ok(render({ warmth: 50 }).warmth > base.warmth);
    assert.ok(render({ fade: 60 }).blackPoint > base.blackPoint);
    assert.ok(render({ vignette: 80 }).falloff < base.falloff);
  });

  test('grain is deterministic between renders', () => {
    const { data, width, height } = syntheticImage();
    const a = applyAdjustments(data, new Uint8ClampedArray(data.length), width, height, adjust({ grain: 50 }));
    const b = applyAdjustments(data, new Uint8ClampedArray(data.length), width, height, adjust({ grain: 50 }));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, data);
  });
});

describe('recipe fitting', () => {
  test('recovers a look applied to the same photo', () => {
    const img = syntheticImage();
    const look = adjust({ brightness: 12, contrast: 25, warmth: 30, saturation: -20 });
    const styled = applyAdjustments(img.data, new Uint8ClampedArray(img.data.length), img.width, img.height, look);
    const target = measure(styled, img.width, img.height);

    const fit = fitAdjustments({ source: img, target, iterations: 12 });
    assert.ok(fit.matchAfter >= 90, `match ${fit.matchAfter}`);
    assert.ok(fit.matchAfter > fit.matchBefore);

    const result = applyAdjustments(img.data, new Uint8ClampedArray(img.data.length), img.width, img.height, fit.adjustments);
    const m = measure(result, img.width, img.height);
    assert.ok(Math.abs(m.brightness - target.brightness) < 0.02);
    assert.ok(Math.abs(m.warmth - target.warmth) < 0.015);
    assert.ok(Math.abs(m.saturation - target.saturation) < 0.02);
  });

  test('respects slider bounds even for unreachable targets', () => {
    const img = syntheticImage();
    const bright = fitAdjustments({ source: img, target: { brightness: 2 }, keys: ['brightness'] });
    assert.equal(bright.adjustments.brightness, 100);
    const faded = fitAdjustments({ source: img, target: { blackPoint: -1 }, keys: ['fade'] });
    assert.equal(faded.adjustments.fade, 0);
  });
});

describe('geometry', () => {
  test('no crop or rotation keeps the full size', () => {
    assert.deepEqual(outputSize(4000, 3000, { quarterTurns: 0, straighten: 0, flipH: false, crop: null }), { width: 4000, height: 3000 });
  });

  test('a quarter turn swaps dimensions', () => {
    assert.deepEqual(outputSize(4000, 3000, { quarterTurns: 1, straighten: 0, flipH: false, crop: null }), { width: 3000, height: 4000 });
  });

  test('straightening auto-crops to the original aspect ratio, inside the image', () => {
    const g = { quarterTurns: 0, straighten: 10, flipH: false, crop: null };
    const crop = autoStraightenCrop(4000, 3000, g);
    const size = outputSize(4000, 3000, g);
    assert.ok(Math.abs(size.width / size.height - 4 / 3) < 0.01);
    assert.ok(size.width < 4000 && size.height < 3000);
    assert.ok(crop.x > 0 && crop.y > 0);
  });
});

describe('history', () => {
  const step = (state, ...actions) => actions.reduce(historyReducer, state);

  test('a drag of many previews is one undo step', () => {
    let s = initialHistory();
    for (let v = 1; v <= 30; v++) s = historyReducer(s, { type: 'preview', patch: { adjustments: { contrast: v } } });
    s = historyReducer(s, { type: 'commit' });
    assert.equal(s.past.length, 1);
    s = historyReducer(s, { type: 'undo' });
    assert.equal(s.present.adjustments.contrast, 0);
    s = historyReducer(s, { type: 'redo' });
    assert.equal(s.present.adjustments.contrast, 30);
  });

  test('committing an unchanged document adds no step, and new edits clear redo', () => {
    let s = step(initialHistory(), { type: 'commit' });
    assert.equal(s.past.length, 0);
    s = step(s, { type: 'apply', patch: { adjustments: { warmth: 10 } } }, { type: 'undo' });
    assert.equal(s.future.length, 1);
    s = step(s, { type: 'apply', patch: { adjustments: { tint: 5 } } });
    assert.equal(s.future.length, 0);
  });

  test('undo mid-gesture reverts the uncommitted preview', () => {
    let s = step(initialHistory(), { type: 'apply', patch: { adjustments: { warmth: 10 } } });
    s = step(s, { type: 'preview', patch: { adjustments: { warmth: 40 } } }, { type: 'undo' });
    assert.equal(s.present.adjustments.warmth, 10);
  });

  test('layers and background changes are undoable steps', () => {
    const layer = { id: 'a', type: 'shape', x: 0.5, y: 0.5 };
    let s = step(initialHistory(), { type: 'apply', patch: { layers: [layer] } });
    s = step(s, { type: 'preview', patch: { layers: [{ ...layer, x: 0.7 }] } }, { type: 'preview', patch: { layers: [{ ...layer, x: 0.9 }] } }, { type: 'commit' });
    s = step(s, { type: 'apply', patch: { background: { mode: 'color', color: '#ffffff' } } });
    assert.equal(s.past.length, 3);
    assert.equal(s.present.background.blur, 40, 'background patches merge with defaults');

    s = step(s, { type: 'undo' });
    assert.equal(s.present.background.mode, 'original');
    assert.equal(s.present.layers[0].x, 0.9);
    s = step(s, { type: 'undo' });
    assert.equal(s.present.layers[0].x, 0.5);
    s = step(s, { type: 'undo' });
    assert.deepEqual(s.present.layers, []);
  });
});
