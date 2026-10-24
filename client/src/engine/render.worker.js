import { applyAdjustments, computeHistogram } from './pipeline.js';
import { measure } from './analysis.js';

/**
 * Messages in:
 *   { type: 'source', version, width, height, pixels }      preview source (kept)
 *   { type: 'render', version, adjustments, buffer? }       render the kept source
 *   { type: 'process', id, width, height, pixels, adjustments }  one-shot (export)
 * Messages out:
 *   { type: 'frame', version, width, height, buffer, histogram, stats, sourceStats }
 *   { type: 'skipped', version }   render request for a source this worker doesn't have
 *   { type: 'processed', id, buffer }
 */
const SAMPLE_TARGET = 60_000;
let source = null;

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'source') {
    const pixels = new Uint8ClampedArray(msg.pixels);
    source = {
      version: msg.version,
      width: msg.width,
      height: msg.height,
      pixels,
      stats: measure(pixels, msg.width, msg.height, { sampleTarget: SAMPLE_TARGET }),
    };
    return;
  }

  if (msg.type === 'render') {
    if (!source || source.version !== msg.version) {
      self.postMessage({ type: 'skipped', version: msg.version });
      return;
    }
    const { width, height, pixels } = source;
    const out = msg.buffer?.byteLength === pixels.byteLength ? new Uint8ClampedArray(msg.buffer) : new Uint8ClampedArray(pixels.length);

    applyAdjustments(pixels, out, width, height, msg.adjustments);

    self.postMessage(
      {
        type: 'frame',
        version: msg.version,
        width,
        height,
        buffer: out.buffer,
        histogram: computeHistogram(out, 3),
        stats: measure(out, width, height, { sampleTarget: SAMPLE_TARGET }),
        sourceStats: source.stats,
      },
      [out.buffer],
    );
    return;
  }

  if (msg.type === 'process') {
    const pixels = new Uint8ClampedArray(msg.pixels);
    applyAdjustments(pixels, pixels, msg.width, msg.height, msg.adjustments);
    self.postMessage({ type: 'processed', id: msg.id, buffer: pixels.buffer }, [pixels.buffer]);
  }
};
