'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/brand/logo';
import { IconButton } from '@/components/ui/button';

const ROOT_PATHS = ['/dashboard', '/slips', '/scan', '/folders', '/more'];

/** Compact mobile header. Deeper pages get a back button instead of the wordmark. */
export function TopBar({ businessName }: { businessName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isRoot = ROOT_PATHS.includes(pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur-sm lg:hidden">
      <div className="safe-top" />
      <div className="flex h-14 items-center gap-2 px-3">
        {isRoot ? (
          <Link href="/dashboard" className="rounded-lg focus-visible:ring-2 focus-visible:ring-green-600">
            <Wordmark size="sm" />
          </Link>
        ) : (
          <IconButton
            label="Go back"
            size="sm"
            icon={<ArrowLeft className="h-5 w-5" />}
            onClick={() => router.back()}
          />
        )}
        <p className="ml-auto max-w-[45%] truncate text-sm font-semibold text-ink-600" title={businessName}>
          {businessName}
        </p>
      </div>
    </header>
  );
}
