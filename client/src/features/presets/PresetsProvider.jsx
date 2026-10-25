/**
 * Context provider managing preset fetching, creation, deletion, and local caching.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { useApiStatus } from '../../lib/useApiStatus.js';
import { useToast } from '../../components/Toaster.jsx';
import { BUILT_IN_PRESETS } from './builtInPresets.js';

const PresetsContext = createContext(null);

export function PresetsProvider({ children }) {
  const status = useApiStatus();
  const toast = useToast();
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status !== 'online') return;
    let cancelled = false;
    setLoading(true);
    api
      .listPresets()
      .then((presets) => !cancelled && setSaved(presets))
      .catch((err) => !cancelled && toast.error(`Couldn’t load presets: ${err.message}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status, toast]);

  const savePreset = useCallback(async (preset) => {
    const created = await api.createPreset(preset);
    setSaved((list) => [created, ...list]);
    return created;
  }, []);

  const deletePreset = useCallback(
    async (id) => {
      const previous = saved;
      setSaved((list) => list.filter((p) => p.id !== id));
      try {
        await api.deletePreset(id);
      } catch (err) {
        setSaved(previous);
        toast.error(`Couldn’t delete preset: ${err.message}`);
      }
    },
    [saved, toast],
  );

  const value = useMemo(
    () => ({ status, builtIn: BUILT_IN_PRESETS, saved, loading, canSave: status === 'online', savePreset, deletePreset }),
    [status, saved, loading, savePreset, deletePreset],
  );

  return <PresetsContext.Provider value={value}>{children}</PresetsContext.Provider>;
}

export function usePresets() {
  const ctx = useContext(PresetsContext);
  if (!ctx) throw new Error('usePresets must be used inside <PresetsProvider>');
  return ctx;
}
