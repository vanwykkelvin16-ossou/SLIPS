'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} aria-label={label}>
      <span
        aria-hidden="true"
        className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-mint-200 border-t-green-600', className)}
      />
    </span>
  );
}

export interface ProgressBarProps {
  /** 0-100, or null for an indeterminate bar. */
  value: number | null;
  label: string;
  className?: string;
}

export function ProgressBar({ value, label, className }: ProgressBarProps) {
  const determinate = value !== null && Number.isFinite(value);
  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-label={label}
        {...(determinate
          ? { 'aria-valuenow': Math.round(value!), 'aria-valuemin': 0, 'aria-valuemax': 100 }
          : { 'aria-valuetext': 'In progress' })}
        className="h-2 w-full overflow-hidden rounded-full bg-mint-100"
      >
        {determinate ? (
          <div
            className="h-full rounded-full bg-green-600 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, value!))}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-progress-indeterminate rounded-full bg-green-600" />
        )}
      </div>
    </div>
  );
}

/**
 * The small celebration after a slip is saved. Respects reduced-motion by
 * rendering the finished state immediately.
 */
export function SuccessCheck({ size = 72, className }: { size?: number; className?: string }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return (
    <span className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <span
        aria-hidden="true"
        className={cn('absolute inset-0 rounded-full bg-mint-100', !reduceMotion && 'animate-pop-in')}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        fill="none"
        className="relative"
        style={{ width: size * 0.55, height: size * 0.55 }}
      >
        <path
          d="M12 25.5 20.5 34 36 15"
          stroke="hsl(146 62% 33%)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="48"
          strokeDashoffset={reduceMotion ? 0 : 48}
          className={cn(!reduceMotion && 'animate-check-draw')}
        />
      </svg>
    </span>
  );
}

/** Live region for progress narration during long operations. */
export function StatusAnnouncer({ message }: { message: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite">
      {message}
    </p>
  );
}
