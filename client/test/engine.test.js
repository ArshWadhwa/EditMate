import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultAdjustments } from '@editmate/shared';
import { applyAdjustments, toneCurve } from '../src/engine/pipeline.js';
import { fitAdjustments, measure } from '../src/engine/analysis.js';
import { autoStraightenCrop, outputSize } from '../src/engine/geometry.js';
import { calculateEditCount, emptyDocument, useDocStore } from '../src/state/docStore.js';
import { createShapeLayer } from '../src/engine/layers.js';

/** Generates a synthetic RGBA gradient buffer with distinct color bands for pipeline testing. */
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

describe('history (zustand store)', () => {
  test('a drag of many previews is one undo step', () => {
    useDocStore.getState().reset(emptyDocument());
    for (let v = 1; v <= 30; v++) useDocStore.getState().preview({ adjustments: { contrast: v } });
    useDocStore.getState().commit();
    assert.equal(useDocStore.getState().past.length, 1);
    useDocStore.getState().undo();
    assert.equal(useDocStore.getState().doc.adjustments.contrast, 0);
    useDocStore.getState().redo();
    assert.equal(useDocStore.getState().doc.adjustments.contrast, 30);
  });

  test('committing an unchanged document adds no step, and new edits clear redo', () => {
    useDocStore.getState().reset(emptyDocument());
    useDocStore.getState().commit();
    assert.equal(useDocStore.getState().past.length, 0);
    useDocStore.getState().apply({ adjustments: { warmth: 10 } });
    useDocStore.getState().undo();
    assert.equal(useDocStore.getState().future.length, 1);
    useDocStore.getState().apply({ adjustments: { tint: 5 } });
    assert.equal(useDocStore.getState().future.length, 0);
  });

  test('layers and background changes are undoable steps', () => {
    useDocStore.getState().reset(emptyDocument());
    const layer = { id: 'a', type: 'shape', x: 0.5, y: 0.5 };
    useDocStore.getState().apply({ layers: [layer] });
    useDocStore.getState().preview({ layers: [{ ...layer, x: 0.7 }] });
    useDocStore.getState().preview({ layers: [{ ...layer, x: 0.9 }] });
    useDocStore.getState().commit();
    useDocStore.getState().apply({ background: { mode: 'color', color: '#ffffff' } });
    assert.equal(useDocStore.getState().past.length, 3);
    assert.equal(useDocStore.getState().doc.background.blur, 40, 'background patches merge with defaults');

    useDocStore.getState().undo();
    assert.equal(useDocStore.getState().doc.background.mode, 'original');
    assert.equal(useDocStore.getState().doc.layers[0].x, 0.9);
    useDocStore.getState().undo();
    assert.equal(useDocStore.getState().doc.layers[0].x, 0.5);
    useDocStore.getState().undo();
    assert.deepEqual(useDocStore.getState().doc.layers, []);
  });
});

describe('active edits count calculation', () => {
  test('pristine document has zero active edits', () => {
    assert.equal(calculateEditCount(emptyDocument()), 0);
  });

  test('adjustments increase edit count per non-zero value and decrease when reset', () => {
    const doc = emptyDocument();
    assert.equal(calculateEditCount(doc), 0);
    doc.adjustments.brightness = 10;
    assert.equal(calculateEditCount(doc), 1);
    doc.adjustments.contrast = -5;
    assert.equal(calculateEditCount(doc), 2);
    doc.adjustments.brightness = 0;
    assert.equal(calculateEditCount(doc), 1);
    doc.adjustments.contrast = 0;
    assert.equal(calculateEditCount(doc), 0);
  });

  test('crop, rotation, and flip each add to active edits count', () => {
    const doc = emptyDocument();
    doc.geometry.crop = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
    assert.equal(calculateEditCount(doc), 1);
    doc.geometry.straighten = 2.5;
    assert.equal(calculateEditCount(doc), 2);
    doc.geometry.flipH = true;
    assert.equal(calculateEditCount(doc), 3);
    doc.geometry.crop = null;
    assert.equal(calculateEditCount(doc), 2);
  });

  test('background and layers add exactly per active layer and decrement on removal', () => {
    const doc = emptyDocument();
    doc.background.mode = 'blur';
    assert.equal(calculateEditCount(doc), 1);
    doc.layers.push({ id: '1', type: 'text' });
    assert.equal(calculateEditCount(doc), 2);
    doc.layers.push({ id: '2', type: 'shape' });
    assert.equal(calculateEditCount(doc), 3);
    doc.layers.pop();
    assert.equal(calculateEditCount(doc), 2);
    doc.background.mode = 'original';
    assert.equal(calculateEditCount(doc), 1);
    doc.layers.pop();
    assert.equal(calculateEditCount(doc), 0);
  });

  test('subject layer with background mode is not double-counted', () => {
    const doc = emptyDocument();
    doc.background.mode = 'transparent';
    doc.layers.push({ id: 's1', type: 'subject', isSubject: true });
    assert.equal(calculateEditCount(doc), 1, 'background cutout + subject layer counts as 1 edit');
    doc.layers.push({ id: 't1', type: 'text' });
    assert.equal(calculateEditCount(doc), 2, 'adding text under or over subject adds 1 edit');
  });

  test('layer locking preserves active edit and layer properties', () => {
    const doc = emptyDocument();
    doc.layers.push({ id: '1', type: 'text', locked: false });
    assert.equal(calculateEditCount(doc), 1);
    doc.layers[0].locked = true;
    assert.equal(doc.layers[0].locked, true);
    assert.equal(calculateEditCount(doc), 1);
  });

  test('createShapeLayer initializes with default fillType and assetId', () => {
    const rect = createShapeLayer('rect');
    assert.equal(rect.type, 'shape');
    assert.equal(rect.shape, 'rect');
    assert.equal(rect.fillType, 'color');
    assert.equal(rect.assetId, null);
    assert.equal(rect.locked, false);

    const ellipse = createShapeLayer('ellipse');
    assert.equal(ellipse.shape, 'ellipse');
    assert.equal(ellipse.fillType, 'color');
    assert.equal(ellipse.assetId, null);
  });
});

