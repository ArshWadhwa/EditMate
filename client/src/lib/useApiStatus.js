import { useEffect, useState } from 'react';
import { api } from './api.js';

const POLL_MS = 30_000;

/**
 * 'checking' | 'online' (API + database) | 'no-database' | 'offline'
 */
export function useApiStatus() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let controller;
    const check = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const { database } = await api.health(controller.signal);
        setStatus(database === 'connected' ? 'online' : 'no-database');
      } catch (err) {
        if (err.name !== 'AbortError') setStatus('offline');
      }
    };

    check();
    const timer = setInterval(check, POLL_MS);
    window.addEventListener('focus', check);
    return () => {
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, []);

  return status;
}

export const API_STATUS_COPY = {
  checking: { label: 'Connecting…', tone: 'bg-white/40' },
  online: { label: 'API connected', tone: 'bg-ok shadow-[0_0_10px_var(--color-ok)]' },
  'no-database': { label: 'API up, no database (set MONGODB_URI)', tone: 'bg-accent shadow-[0_0_10px_var(--color-accent)]' },
  offline: { label: 'API offline: presets can’t be saved', tone: 'bg-rec shadow-[0_0_10px_var(--color-rec)]' },
};
