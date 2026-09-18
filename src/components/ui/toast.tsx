'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const toneStyles: Record<ToastTone, { wrapper: string; icon: ReactNode }> = {
  success: {
    wrapper: 'border-mint-300 bg-mint-50',
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
  },
  error: {
    wrapper: 'border-danger-500/40 bg-danger-50',
    icon: <AlertCircle className="h-5 w-5 text-danger-600" />,
  },
  warning: {
    wrapper: 'border-warning-500/40 bg-warning-50',
    icon: <TriangleAlert className="h-5 w-5 text-warning-600" />,
  },
  info: {
    wrapper: 'border-info-500/30 bg-info-50',
    icon: <Info className="h-5 w-5 text-info-500" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const record: ToastRecord = { ...options, id, tone: options.tone ?? 'success' };
      setToasts((current) => [...current.slice(-3), record]);

      const duration = options.durationMs ?? (record.tone === 'error' ? 8000 : 5000);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:bottom-4 sm:right-4 sm:left-auto sm:items-end sm:pb-0"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-slide-up items-start gap-3 rounded-lg border px-4 py-3 shadow-float',
              toneStyles[item.tone].wrapper,
            )}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">
              {toneStyles[item.tone].icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-forest-900">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-sm text-ink-600">{item.description}</p> : null}
              {item.action ? (
                <button
                  type="button"
                  onClick={() => {
                    item.action?.onClick();
                    dismiss(item.id);
                  }}
                  className="mt-2 rounded-md text-sm font-semibold text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                >
                  {item.action.label}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 rounded-md p-1 text-ink-500 transition-colors hover:bg-black/5 hover:text-charcoal focus-visible:ring-2 focus-visible:ring-green-600"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
