import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query, e.g. useMediaQuery('(min-width: 1024px)'). */
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

/** Desktop layout (side rail, panel grid) from this width; below it the mobile app layout. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** Touch-first devices get larger hit targets. */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';
