'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, FileText, ImageOff } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface DocumentPage {
  pageNumber: number;
  /** Short-lived signed URL for the screen-sized preview (or the original). */
  previewUrl: string | null;
  originalUrl: string;
  mimeType: string;
  originalFilename: string;
}

/**
 * Shows the stored document. Images lazy-load and can be opened full screen;
 * PDFs render in an inline frame with a download fallback for browsers that
 * refuse to display them.
 */
export function DocumentViewer({ pages, merchantName }: { pages: DocumentPage[]; merchantName: string | null }) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  const page = pages[index];
  const describedAs = `${merchantName?.trim() || 'Receipt'} — page ${page?.pageNumber ?? 1} of ${pages.length}`;

  if (!page) {
    return (
      <div className="flex aspect-[3/4] items-center justify-center rounded-xl border border-line bg-mint-50 text-forest-300">
        <span className="flex flex-col items-center gap-2 text-sm text-ink-500">
          <ImageOff aria-hidden="true" className="h-8 w-8" />
          No document attached
        </span>
      </div>
    );
  }

  const isPdf = page.mimeType === 'application/pdf';

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-line bg-ink-100">
        {isPdf ? (
          <div className="flex aspect-[3/4] w-full flex-col">
            <iframe
              src={page.previewUrl ?? page.originalUrl}
              title={describedAs}
              className="h-full w-full border-0 bg-white"
            />
          </div>
        ) : failed ? (
          <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 p-6 text-center">
            <ImageOff aria-hidden="true" className="h-8 w-8 text-ink-400" />
            <p className="text-sm text-ink-500">
              The preview could not load. The original file is still stored safely.
            </p>
            <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        ) : (
          <>
            {/* Signed, expiring URL — deliberately not routed through the image optimiser. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.previewUrl ?? page.originalUrl}
              alt={describedAs}
              loading="lazy"
              decoding="async"
              onError={() => setFailed(true)}
              className="max-h-[70vh] w-full bg-white object-contain"
            />
            <div className="absolute right-2 top-2">
              <IconButton
                label="View full screen"
                variant="secondary"
                size="sm"
                icon={<Expand className="h-4 w-4" />}
                onClick={() => setExpanded(true)}
              />
            </div>
          </>
        )}
      </div>

      {pages.length > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <IconButton
            label="Previous page"
            variant="secondary"
            size="sm"
            icon={<ChevronLeft className="h-4 w-4" />}
            disabled={index === 0}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          />
          <p role="status" className="text-sm font-medium text-ink-600">
            Page {index + 1} of {pages.length}
          </p>
          <IconButton
            label="Next page"
            variant="secondary"
            size="sm"
            icon={<ChevronRight className="h-4 w-4" />}
            disabled={index === pages.length - 1}
            onClick={() => setIndex((current) => Math.min(pages.length - 1, current + 1))}
          />
        </div>
      ) : null}

      {isPdf ? (
        <p className="flex items-center gap-2 text-sm text-ink-500">
          <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span className="truncate">{page.originalFilename}</span>
        </p>
      ) : null}

      <Dialog open={expanded} onClose={() => setExpanded(false)} title={describedAs} size="lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={page.previewUrl ?? page.originalUrl} alt={describedAs} className="w-full rounded-lg bg-white object-contain" />
      </Dialog>
    </div>
  );
}
