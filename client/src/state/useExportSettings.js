import { useCallback, useState } from 'react';

const KEY = 'editmate.export';
/** `format: null` means "same as the original photo". */
const DEFAULTS = { format: null, quality: 0.92, size: 'full' };

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULTS;
  }
}

/** Last-used export options, remembered per browser so ⌘E repeats the previous export. */
export function useExportSettings() {
  const [settings, setSettings] = useState(read);

  const update = useCallback((patch) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode); settings still apply for this session.
      }
      return next;
    });
  }, []);

  return [settings, update];
}
