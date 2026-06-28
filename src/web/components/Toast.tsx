import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertIcon, CheckIcon, CloseIcon } from './icons';

type ToastKind = 'success' | 'error';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const TTL_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { id, kind, message }]);
      window.setTimeout(() => dismiss(id), TTL_MS);
    },
    [dismiss],
  );

  const api = useRef<ToastApi>({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
  });

  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-card animate-fade-up',
              t.kind === 'success'
                ? 'border-emerald-500/70 bg-emerald-900 text-emerald-50'
                : 'border-blood-500/70 bg-blood-900 text-blood-50',
            )}
          >
            {t.kind === 'success' ? <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="flex-1">{t.message}</span>
            <button aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
