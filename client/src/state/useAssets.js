import { useCallback, useEffect, useRef, useState } from 'react';
import { loadImageFile, releaseImage } from '../lib/image.js';

/**
 * Images placed into an edit (image layers, replacement backgrounds).
 *
 * The undoable document only stores asset ids; the bitmaps live here. Assets are never
 * dropped during a session, so undoing a deletion can always bring its image back.
 */
export function useAssets() {
  const map = useRef(new Map());
  const [version, setVersion] = useState(0);

  const add = useCallback(async (file) => {
    const loaded = await loadImageFile(file);
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    map.current.set(id, loaded);
    setVersion((v) => v + 1);
    return { id, ...loaded };
  }, []);

  useEffect(() => {
    const assets = map.current;
    return () => assets.forEach(releaseImage);
  }, []);

  return { map: map.current, version, add };
}
