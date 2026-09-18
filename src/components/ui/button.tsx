'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-all duration-150 select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 ' +
  'disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none active:scale-[0.985]';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-green-600 text-white shadow-card hover:bg-green-700 active:bg-green-800 disabled:hover:bg-green-600',
  secondary:
    'bg-surface text-forest-800 border border-line shadow-card hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100',
  ghost: 'bg-transparent text-forest-800 hover:bg-mint-100 active:bg-mint-200',
  danger: 'bg-danger-600 text-white shadow-card hover:bg-danger-500 active:brightness-95',
  subtle: 'bg-mint-100 text-forest-800 hover:bg-mint-200 active:bg-mint-300',
};

const sizes: Record<ButtonSize, string> = {
  // 44px+ tall at every size: comfortable touch targets on a phone.
  sm: 'h-10 px-3.5 text-sm',
  md: 'h-12 px-5 text-base',
  lg: 'h-14 px-6 text-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Text announced to screen readers while `loading` is true. */
  loadingText?: string;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, loadingText, fullWidth, icon, iconRight, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        <>
          {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
          {children}
          {iconRight ? <span aria-hidden="true" className="shrink-0">{iconRight}</span> : null}
        </>
      )}
    </button>
  );
});

export interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
  'aria-label'?: string;
  onClick?: () => void;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  iconRight,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
      {children}
      {iconRight ? <span aria-hidden="true" className="shrink-0">{iconRight}</span> : null}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only controls must still be announced. */
  label: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', size = 'md', icon, className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        base,
        variants[variant],
        size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
        'rounded-lg p-0',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
});
