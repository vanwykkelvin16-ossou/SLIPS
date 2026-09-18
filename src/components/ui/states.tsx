import type { ReactNode } from 'react';
import { CloudOff, Lock, RefreshCw, SearchX, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, ButtonLink } from './button';

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn('skeleton block', className)} />;
}

export function ReceiptCardSkeleton() {
  return (
    <div className="card overflow-hidden p-0">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
      <Skeleton className="h-12 w-12 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-5 w-20" />
    </div>
  );
}

/**
 * Loading state that announces itself. Screen-reader users hear the message
 * while sighted users see the skeleton.
 */
export function LoadingState({ message = 'Loading…', className }: { message?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)} role="status">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-mint-200 border-t-green-600" aria-hidden="true" />
      <p className="text-sm font-medium text-ink-500">{message}</p>
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, secondaryAction, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-forest-700"
        >
          {icon}
        </span>
      ) : null}
      <h3 className="text-lg font-bold text-forest-900">{title}</h3>
      {description ? <p className="mt-2 max-w-sm text-balance text-sm text-ink-500">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          {action ? (
            action.href ? (
              <ButtonLink href={action.href}>{action.label}</ButtonLink>
            ) : (
              <Button onClick={action.onClick}>{action.label}</Button>
            )
          ) : null}
          {secondaryAction ? (
            secondaryAction.href ? (
              <ButtonLink href={secondaryAction.href} variant="secondary">
                {secondaryAction.label}
              </ButtonLink>
            ) : (
              <Button variant="secondary" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We could not load this just now. Your documents are safe.',
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
    >
      <span aria-hidden="true" className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-50 text-danger-600">
        <TriangleAlert className="h-7 w-7" />
      </span>
      <h3 className="text-lg font-bold text-forest-900">{title}</h3>
      <p className="mt-2 max-w-sm text-balance text-sm text-ink-500">{description}</p>
      {onRetry ? (
        <Button className="mt-5" variant="secondary" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function NoResultsState({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={<SearchX className="h-7 w-7" />}
      title="No slips match those filters"
      description="Try a different search term, widen the date range, or clear the filters to see everything again."
      action={onClear ? { label: 'Clear filters', onClick: onClear } : undefined}
    />
  );
}

export function OfflineState({ message = 'You are offline. We will finish this as soon as you are back on a network.' }: { message?: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 text-sm text-warning-600"
    >
      <CloudOff aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="font-medium">{message}</p>
    </div>
  );
}

export function PermissionDeniedState({
  title = 'Permission needed',
  description,
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span aria-hidden="true" className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-warning-50 text-warning-600">
        <Lock className="h-7 w-7" />
      </span>
      <h3 className="text-lg font-bold text-forest-900">{title}</h3>
      <p className="mt-2 max-w-sm text-balance text-sm text-ink-500">{description}</p>
      {onRetry ? (
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
