/**
 * Hook managing on-demand subject segmentation mask generation and caching.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { segmentSubject } from '../engine/segment.js';

const IDLE = { status: 'idle', progress: 0, phase: null, mask: null, error: null };

export function useSubjectMask(image) {
  const [state, setState] = useState(IDLE);
  const runId = useRef(0);

  useEffect(() => {
    runId.current += 1; 
    setState(IDLE);
  }, [image]);

  const ensureMask = useCallback(async () => {
    if (!image) return null;
    if (state.status === 'ready') return state.mask;
    if (state.status === 'working') return null;

    const id = ++runId.current;
    setState({ ...IDLE, status: 'working', phase: 'download' });
    try {
      const mask = await segmentSubject(image.bitmap, (progress, phase) => {
        if (runId.current === id) setState((s) => ({ ...s, progress, phase }));
      });
      if (runId.current !== id) return null;
      setState({ ...IDLE, status: 'ready', mask, progress: 1 });
      return mask;
    } catch (err) {
      if (runId.current === id) setState({ ...IDLE, status: 'error', error: err.message || 'Background removal failed' });
      return null;
    }
  }, [image, state.status, state.mask]);

  return { ...state, ensureMask };
}
