import type { Metadata } from 'next';
import { BusinessSettings, CategoryManager, type BusinessValues } from '@/components/settings/business-settings';
import { prisma } from '@/lib/db';
import { financialYearLabel, financialYearRange } from '@/lib/folders';
import { formatMoney } from '@/lib/money';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Business profile' };
export const dynamic = 'force-dynamic';

export default async function BusinessPage() {
  const session = await requireOnboardedWorkspace();

  const [business, categories, counts, fyTotal] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: { id: session.businessId },
      select: {
        name: true,
        currency: true,
        financialYearStartMonth: true,
        folderStructure: true,
        phone: true,
        vatNumber: true,
        addressLine: true,
        createdAt: true,
      },
    }),
    prisma.category.findMany({
      where: { businessId: session.businessId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isDefault: true, _count: { select: { receipts: true } } },
    }),
    prisma.receipt.count({ where: { businessId: session.businessId, deletedAt: null } }),
    prisma.receipt.aggregate({
      where: {
        businessId: session.businessId,
        deletedAt: null,
        purchaseDate: {
          gte: financialYearRange(new Date(), session.financialYearStartMonth).start,
          lte: financialYearRange(new Date(), session.financialYearStartMonth).end,
        },
      },
      _sum: { totalCents: true },
    }),
  ]);

  const values: BusinessValues = {
    name: business.name,
    currency: business.currency,
    financialYearStartMonth: business.financialYearStartMonth,
    folderStructure: business.folderStructure,
    phone: business.phone ?? '',
    vatNumber: business.vatNumber ?? '',
    addressLine: business.addressLine ?? '',
  };

  const fyLabel = financialYearLabel(new Date(), business.financialYearStartMonth);

  return (
    <div className="app-container max-w-3xl py-6 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">Business profile</h1>
        <p className="mt-1 break-words text-ink-600">How {business.name} is set up, and how new slips get filed.</p>
      </header>

      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="text-sm text-ink-500">Slips filed</p>
            <p className="mt-1 text-2xl font-bold text-forest-900">{counts.toLocaleString('en-ZA')}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="text-sm text-ink-500">{fyLabel} spend</p>
            <p className="mt-1 text-2xl font-bold text-forest-900">
              {formatMoney(fyTotal._sum.totalCents ?? 0, business.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <p className="text-sm text-ink-500">Using Slipsy since</p>
            <p className="mt-1 text-2xl font-bold text-forest-900">
              {new Intl.DateTimeFormat('en-ZA', { month: 'short', year: 'numeric' }).format(business.createdAt)}
            </p>
          </div>
        </section>

        <BusinessSettings business={values} />

        <CategoryManager
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            isDefault: category.isDefault,
            usageCount: category._count.receipts,
          }))}
        />
      </div>
    </div>
  );
}
