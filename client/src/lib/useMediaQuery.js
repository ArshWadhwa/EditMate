/**
 * Hook evaluating CSS media queries for responsive layouts.
 */

import { useSyncExternalStore } from 'react';

export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const DESKTOP_QUERY = '(min-width: 1024px)';

export const COARSE_POINTER_QUERY = '(pointer: coarse)';
