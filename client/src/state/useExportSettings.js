/**
 * State hook managing format, quality, and scaling options for image export.
 */

import { useCallback, useState } from 'react';

const KEY = 'editmate.export';
const DEFAULTS = { format: null, quality: 0.92, size: 'full' };

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

export function useExportSettings() {
  const [settings, setSettings] = useState(read);

  const update = useCallback((patch) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return [settings, update];
}
