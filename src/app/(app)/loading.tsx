import { ListRowSkeleton, Skeleton } from '@/components/ui/states';

export default function AppLoading() {
  return (
    <div className="app-container py-6 lg:py-8" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-56" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="card space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3, 4].map((index) => (
          <ListRowSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
