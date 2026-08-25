'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastTone = 'default' | 'pos' | 'neg';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastCtx = createContext<(message: string, tone?: ToastTone) => void>(() => {});

/** Wrap a subtree to enable useToast(). Mount once near the app root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: ToastTone = 'default') => {
    // Timestamp-free id: monotonically increasing via state updater.
    setToasts((prev) => {
      const id = (prev[prev.length - 1]?.id ?? 0) + 1;
      const next = [...prev, { id, message, tone }];
      setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 4000);
      return next;
    });
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in rounded-md border border-l-[3px] border-hairline bg-paper px-4 py-3 text-sm text-ink ${
              t.tone === 'pos' ? 'border-l-pos' : t.tone === 'neg' ? 'border-l-neg' : 'border-l-[var(--accent)]'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
