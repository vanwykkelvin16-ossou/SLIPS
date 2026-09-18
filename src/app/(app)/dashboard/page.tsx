import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Camera, FolderOpen, Receipt, Upload, Wallet } from 'lucide-react';
import { brand } from '@/config/brand';
import { InstallCard } from '@/components/pwa/install-card';
import { ReceiptCard } from '@/components/receipts/receipt-card';
import { ButtonLink } from '@/components/ui/button';
import { CardHeader, StatCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { getDashboardData } from '@/lib/dashboard';
import { formatMoney } from '@/lib/money';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
  const session = await requireOnboardedWorkspace();
  const data = await getDashboardData(session.businessId, session.financialYearStartMonth);

  return (
    <div className="app-container py-6 lg:py-8">
      {/* `min-w-0` on the text and `shrink-0` on the actions keep a long name
          from pushing the buttons off the side at tablet widths. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-500">{greeting()},</p>
          <h1 className="break-words text-3xl font-extrabold tracking-tight text-forest-900">{session.firstName}</h1>
          <p className="mt-1 text-ink-600">
            {data.hasAnySlip ? 'Everything is safely filed. Add today’s slips whenever you are ready.' : brand.tagline}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row">
          <ButtonLink href="/scan" size="lg" icon={<Camera className="h-5 w-5" />}>
            Scan a slip
          </ButtonLink>
          <ButtonLink href="/scan?mode=upload" size="lg" variant="secondary" icon={<Upload className="h-5 w-5" />}>
            Upload from device
          </ButtonLink>
        </div>
      </header>

      <div className="mt-6 space-y-6">
        <InstallCard />

        <section aria-labelledby="stats-heading">
          <h2 id="stats-heading" className="sr-only">
            Your numbers
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Slips stored"
              value={data.totalSlips.toLocaleString('en-ZA')}
              hint={data.totalSlips === 0 ? 'Your first one is a tap away' : 'Safely filed and searchable'}
              icon={<Receipt className="h-4.5 w-4.5" />}
            />
            <StatCard
              label="Added this month"
              value={data.slipsThisMonth.toLocaleString('en-ZA')}
              hint="Since the 1st"
              icon={<Camera className="h-4.5 w-4.5" />}
            />
            <StatCard
              label="Total recorded"
              value={formatMoney(data.totalSpendCents, session.currency)}
              hint={`${formatMoney(data.financialYearSpendCents, session.currency)} this financial year`}
              icon={<Wallet className="h-4.5 w-4.5" />}
            />
            <StatCard
              label="Needs review"
              value={data.needsReview.toLocaleString('en-ZA')}
              hint={data.needsReview > 0 ? 'Check the details and file them' : 'Nothing waiting on you'}
              icon={<AlertCircle className="h-4.5 w-4.5" />}
              tone={data.needsReview > 0 ? 'warning' : 'default'}
              href={data.needsReview > 0 ? '/slips?status=NEEDS_REVIEW' : undefined}
            />
          </div>
        </section>

        <section aria-labelledby="recent-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <CardHeader
            title="Recent slips"
            description={data.hasAnySlip ? 'The last few things you filed.' : undefined}
            action={
              data.hasAnySlip ? (
                <Link
                  href="/slips"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-green-700 transition-colors hover:bg-mint-100 focus-visible:ring-2 focus-visible:ring-green-600"
                >
                  See all
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              ) : null
            }
          />

          {data.recentReceipts.length === 0 ? (
            <EmptyState
              icon={<Camera className="h-7 w-7" />}
              title="No slips yet"
              description="Snap your first receipt and we will read the details, work out where it belongs, and file it for you."
              action={{ label: 'Scan my first slip', href: '/scan' }}
              secondaryAction={{ label: 'Upload a file', href: '/scan?mode=upload' }}
            />
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.recentReceipts.map((receipt) => (
                <ReceiptCard
                  key={receipt.id}
                  receipt={{
                    id: receipt.id,
                    merchantName: receipt.merchantName,
                    purchaseDate: receipt.purchaseDate,
                    totalCents: receipt.totalCents,
                    currency: receipt.currency,
                    status: receipt.status,
                    categoryName: receipt.categoryName,
                    folderName: receipt.folderName,
                    thumbnailUrl: receipt.thumbnailUrl,
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {data.recentFolders.length > 0 ? (
          <section aria-labelledby="folders-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <CardHeader
              title="Recently used folders"
              action={
                <Link
                  href="/folders"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-green-700 transition-colors hover:bg-mint-100 focus-visible:ring-2 focus-visible:ring-green-600"
                >
                  All folders
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              }
            />
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.recentFolders.map((folder) => (
                <li key={folder.id}>
                  <Link
                    href={`/slips?folderId=${folder.id}`}
                    className="flex items-center gap-3 rounded-lg border border-line bg-page p-3.5 transition-colors hover:border-mint-300 hover:bg-mint-50 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700"
                      style={folder.color ? { backgroundColor: `${folder.color}22`, color: folder.color } : undefined}
                    >
                      <FolderOpen className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-forest-900">{folder.name}</span>
                      <span className="block truncate text-sm text-ink-500">
                        {folder.parentName ? `${folder.parentName} · ` : ''}
                        {folder.count} slip{folder.count === 1 ? '' : 's'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
