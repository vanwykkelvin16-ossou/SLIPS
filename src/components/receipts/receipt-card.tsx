'use client';

import Link from 'next/link';
import { FileText, FolderOpen, ImageOff } from 'lucide-react';
import { StatusBadge, type ReceiptStatusValue } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';

export interface ReceiptCardData {
  id: string;
  merchantName: string | null;
  purchaseDate: string | Date | null;
  totalCents: number | null;
  currency: string;
  status: ReceiptStatusValue;
  categoryName: string | null;
  folderName: string | null;
  thumbnailUrl: string | null;
  hasPdf?: boolean;
}

export function formatSlipDate(value: string | Date | null): string {
  if (!value) return 'No date yet';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'No date yet';
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function Thumbnail({ receipt, className }: { receipt: ReceiptCardData; className?: string }) {
  if (receipt.thumbnailUrl) {
    return (
      // A signed, short-lived URL; next/image would proxy and cache a private document.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={receipt.thumbnailUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={cn('h-full w-full bg-ink-100 object-cover', className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn('flex h-full w-full items-center justify-center bg-mint-50 text-forest-300', className)}
    >
      {receipt.hasPdf ? <FileText className="h-8 w-8" /> : <ImageOff className="h-8 w-8" />}
    </span>
  );
}

export function ReceiptCard({
  receipt,
  selectable = false,
  selected = false,
  onSelectedChange,
}: {
  receipt: ReceiptCardData;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const merchant = receipt.merchantName?.trim() || 'Unknown merchant';

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-surface shadow-card transition-all duration-150',
        'focus-within:shadow-raised hover:-translate-y-0.5 hover:shadow-raised',
        selected ? 'border-green-600 ring-2 ring-green-600/30' : 'border-line',
      )}
    >
      {selectable ? (
        <label className="absolute left-2.5 top-2.5 z-10 flex cursor-pointer items-center rounded-md bg-surface/95 p-1.5 shadow-card">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange?.(event.target.checked)}
            className="h-4.5 w-4.5 cursor-pointer appearance-none rounded border-2 border-ink-400 bg-surface checked:border-green-600 checked:bg-green-600 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
          />
          <span className="sr-only">Select the slip from {merchant}</span>
        </label>
      ) : null}

      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <Thumbnail receipt={receipt} />
        <span className="absolute right-2 top-2">
          <StatusBadge status={receipt.status} />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-bold text-forest-900" title={merchant}>
          <Link
            href={`/slips/${receipt.id}`}
            className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            {merchant}
          </Link>
        </h3>
        <p className="mt-0.5 text-sm text-ink-500">{formatSlipDate(receipt.purchaseDate)}</p>

        <p className="mt-2 text-lg font-bold tracking-tight text-forest-900">
          {formatMoney(receipt.totalCents, receipt.currency)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
          {receipt.categoryName ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-ink-100 px-2 py-0.5 font-medium">
              {receipt.categoryName}
            </span>
          ) : null}
          {receipt.folderName ? (
            <span className="inline-flex max-w-full items-center gap-1 truncate">
              <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              {receipt.folderName}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ReceiptRow({
  receipt,
  selectable = false,
  selected = false,
  onSelectedChange,
}: {
  receipt: ReceiptCardData;
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}) {
  const merchant = receipt.merchantName?.trim() || 'Unknown merchant';

  return (
    <div
      className={cn(
        'relative flex items-center gap-3 border-b border-line px-3 py-3 transition-colors last:border-b-0 sm:gap-4 sm:px-4',
        selected ? 'bg-mint-50' : 'hover:bg-ink-50',
      )}
    >
      {selectable ? (
        <label className="flex shrink-0 cursor-pointer items-center p-1">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange?.(event.target.checked)}
            className="h-5 w-5 cursor-pointer appearance-none rounded border-2 border-ink-400 bg-surface checked:border-green-600 checked:bg-green-600 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
          />
          <span className="sr-only">Select the slip from {merchant}</span>
        </label>
      ) : null}

      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg sm:h-14 sm:w-14">
        <Thumbnail receipt={receipt} />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-forest-900">
          <Link
            href={`/slips/${receipt.id}`}
            className="rounded after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
          >
            {merchant}
          </Link>
        </h3>
        <p className="truncate text-sm text-ink-500">
          {formatSlipDate(receipt.purchaseDate)}
          {receipt.categoryName ? ` · ${receipt.categoryName}` : ''}
          {receipt.folderName ? ` · ${receipt.folderName}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-bold tabular-nums text-forest-900">{formatMoney(receipt.totalCents, receipt.currency)}</span>
        <StatusBadge status={receipt.status} />
      </div>
    </div>
  );
}
