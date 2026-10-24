import { useEffect, useRef, useState } from 'react';
import { readPixels } from './geometry.js';

const createWorker = () => new Worker(new URL('./render.worker.js', import.meta.url), { type: 'module' });

/**
 * Renders adjusted frames of `base` into an offscreen `output` canvas. Rendering happens
 * in a worker; while a frame is in flight only the newest adjustments are kept, so
 * dragging a slider never builds a queue. The viewport composites `output` into its own
 * canvas whenever `frame.id` changes, so display canvases can mount and unmount freely.
 */
export function usePreviewRenderer(base, adjustments) {
  const [frame, setFrame] = useState({ histogram: null, stats: null, sourceStats: null, id: 0 });
  const [output] = useState(() => document.createElement('canvas'));

  const latest = useRef({ base, adjustments });
  latest.current = { base, adjustments };

  /** Mutable render-loop state, shared by the effects below. */
  const loop = useRef({ worker: null, version: 0, busy: false, dirty: false, spare: null });

  const sendSource = () => {
    const s = loop.current;
    const canvas = latest.current.base;
    if (!s.worker || !canvas) return;
    s.version += 1;
    s.spare = null;
    const { data } = readPixels(canvas);
    s.worker.postMessage(
      { type: 'source', version: s.version, width: canvas.width, height: canvas.height, pixels: data.buffer },
      [data.buffer],
    );
  };

  const requestRender = () => {
    const s = loop.current;
    if (!s.worker || !latest.current.base) return;
    if (s.busy) {
      s.dirty = true;
      return;
    }
    s.busy = true;
    s.dirty = false;
    const buffer = s.spare;
    s.spare = null;
    s.worker.postMessage(
      { type: 'render', version: s.version, adjustments: latest.current.adjustments, buffer },
      buffer ? [buffer] : [],
    );
  };

  useEffect(() => {
    const worker = createWorker();
    const s = loop.current;
    Object.assign(s, { worker, busy: false, dirty: false, spare: null });

    worker.onmessage = ({ data }) => {
      s.busy = false;
      if (data.type === 'skipped') {
        // The worker lost track of the source (e.g. it was recreated): resend, then render.
        sendSource();
        requestRender();
        return;
      }
      if (data.version === s.version) {
        const { width, height } = data;
        if (output.width !== width || output.height !== height) {
          output.width = width;
          output.height = height;
        }
        output.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer), width, height), 0, 0);
        s.spare = data.buffer;
        setFrame((f) => ({ histogram: data.histogram, stats: data.stats, sourceStats: data.sourceStats, id: f.id + 1 }));
      }
      // A stale frame still frees the loop; render again if anything changed meanwhile.
      if (s.dirty || data.version !== s.version) requestRender();
    };

    // A fresh worker knows nothing yet: hand it the current source and render.
    sendSource();
    requestRender();

    return () => {
      worker.terminate();
      if (s.worker === worker) s.worker = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output]);

  // New geometry or image: replace the source and render it.
  useEffect(() => {
    sendSource();
    requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(() => {
    requestRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustments]);

  return { frame, output };
}

/** Runs the pipeline on a full-resolution canvas in a throwaway worker (keeps the UI responsive). */
export function processInWorker(canvas, adjustments) {
  const { data, width, height } = readPixels(canvas);
  const worker = createWorker();
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data: msg }) => {
      if (msg.type !== 'processed') return;
      worker.terminate();
      resolve(new ImageData(new Uint8ClampedArray(msg.buffer), width, height));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Rendering failed'));
    };
    worker.postMessage({ type: 'process', id: 1, width, height, pixels: data.buffer, adjustments }, [data.buffer]);
  });
}
