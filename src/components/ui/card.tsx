import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  as?: ElementType;
  padded?: boolean;
  interactive?: boolean;
}

export function Card({ as: Tag = 'div', padded = true, interactive = false, className, children, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        'rounded-xl border border-line bg-surface shadow-card',
        padded && 'p-5',
        interactive && 'transition-all duration-150 hover:-translate-y-0.5 hover:shadow-raised focus-within:shadow-raised',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-forest-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'mint' | 'warning';
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-600">{label}</p>
        {icon ? (
          <span
            aria-hidden="true"
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg',
              tone === 'warning' ? 'bg-warning-50 text-warning-600' : 'bg-mint-100 text-forest-700',
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-forest-900 sm:text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-sm text-ink-500">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          'block rounded-xl border bg-surface p-5 shadow-card transition-all duration-150',
          'hover:-translate-y-0.5 hover:shadow-raised focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2',
          tone === 'warning' ? 'border-warning-500/40' : 'border-line',
        )}
      >
        {body}
      </a>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface p-5 shadow-card',
        tone === 'warning' ? 'border-warning-500/40' : 'border-line',
      )}
    >
      {body}
    </div>
  );
}
