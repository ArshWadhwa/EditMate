import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

const ToastContext = createContext(null);

const TONES = {
  info: { Icon: Info, className: 'text-sky' },
  success: { Icon: CircleCheck, className: 'text-ok' },
  error: { Icon: CircleAlert, className: 'text-rec' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (tone, message) => {
      const id = ++nextId.current;
      setToasts((list) => [...list.slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3200);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      info: (m) => show('info', m),
      success: (m) => show('success', m),
      error: (m) => show('error', m),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] left-1/2 z-50 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-col items-center gap-2 lg:bottom-6" aria-live="polite">
        {toasts.map(({ id, tone, message }) => {
          const { Icon, className } = TONES[tone];
          return (
            <button
              key={id}
              type="button"
              onClick={() => dismiss(id)}
              className="glass hairline animate-toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-left text-[13px] font-medium shadow-2xl shadow-black/50"
            >
              <Icon className={`size-4 shrink-0 ${className}`} />
              {message}
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
