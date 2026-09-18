import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, CircleDashed, FileWarning, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 border-ink-200',
  success: 'bg-mint-100 text-forest-800 border-mint-300',
  warning: 'bg-warning-50 text-warning-600 border-warning-500/40',
  danger: 'bg-danger-50 text-danger-600 border-danger-500/40',
  info: 'bg-info-50 text-info-500 border-info-500/30',
  brand: 'bg-forest-900 text-white border-forest-900',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export type ReceiptStatusValue = 'UPLOADING' | 'PROCESSING' | 'NEEDS_REVIEW' | 'FILED' | 'FAILED';

/**
 * Status is never communicated by colour alone — each state carries its own
 * icon and wording.
 */
export function StatusBadge({ status, className }: { status: ReceiptStatusValue; className?: string }) {
  switch (status) {
    case 'FILED':
      return (
        <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />} className={className}>
          Filed
        </Badge>
      );
    case 'NEEDS_REVIEW':
      return (
        <Badge tone="warning" icon={<AlertCircle className="h-3.5 w-3.5" />} className={className}>
          Needs review
        </Badge>
      );
    case 'PROCESSING':
      return (
        <Badge tone="info" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />} className={className}>
          Reading…
        </Badge>
      );
    case 'UPLOADING':
      return (
        <Badge tone="info" icon={<CircleDashed className="h-3.5 w-3.5" />} className={className}>
          Uploading
        </Badge>
      );
    case 'FAILED':
    default:
      return (
        <Badge tone="danger" icon={<FileWarning className="h-3.5 w-3.5" />} className={className}>
          Needs details
        </Badge>
      );
  }
}
