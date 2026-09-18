'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderInput,
  LayoutGrid,
  List,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { EmptyState, NoResultsState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/money';
import { ReceiptCard, ReceiptRow, type ReceiptCardData } from './receipt-card';
import type { CategoryOption, FolderOption } from './receipt-form';

export interface SlipsBrowserFilters {
  search: string;
  folderId: string;
  categoryId: string;
  status: string;
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
  tag: string;
  sort: string;
  view: string;
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'highest', label: 'Highest amount' },
  { value: 'lowest', label: 'Lowest amount' },
  { value: 'merchant', label: 'Merchant A–Z' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'NEEDS_REVIEW', label: 'Needs review' },
  { value: 'FILED', label: 'Filed' },
  { value: 'PROCESSING', label: 'Still reading' },
  { value: 'FAILED', label: 'Needs details' },
];

const VIEW_STORAGE_KEY = 'slipsy.slips.view';

export function SlipsBrowser({
  items,
  total,
  page,
  pageCount,
  sumCents,
  currency,
  filters,
  folders,
  categories,
}: {
  items: ReceiptCardData[];
  total: number;
  page: number;
  pageCount: number;
  sumCents: number;
  currency: string;
  filters: SlipsBrowserFilters;
  folders: FolderOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [searchDraft, setSearchDraft] = useState(filters.search);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'grid' | 'list'>(filters.view === 'list' ? 'list' : 'grid');
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setDraft(filters);
    setSearchDraft(filters.search);
    setSelected(new Set());
  }, [filters]);

  useEffect(() => {
    if (searchParams.get('view')) return;
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === 'list' || stored === 'grid') setView(stored);
    } catch {
      // Storage blocked: the default view is fine.
    }
  }, [searchParams]);

  const activeFilterCount = useMemo(
    () =>
      [filters.folderId, filters.categoryId, filters.status, filters.from, filters.to, filters.minAmount, filters.maxAmount, filters.tag].filter(
        Boolean,
      ).length,
    [filters],
  );

  const applyParams = useCallback(
    (next: Partial<SlipsBrowserFilters> & { page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(next).forEach(([key, value]) => {
        if (value === '' || value === undefined || value === null) params.delete(key);
        else params.set(key, String(value));
      });
      if (!('page' in next)) params.delete('page');
      startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  // Debounced search so typing does not fire a request per keystroke.
  useEffect(() => {
    if (searchDraft === filters.search) return;
    const timer = setTimeout(() => applyParams({ search: searchDraft }), 350);
    return () => clearTimeout(timer);
  }, [searchDraft, filters.search, applyParams]);

  function setViewMode(next: 'grid' | 'list') {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Ignored: the choice simply will not be remembered.
    }
  }

  function toggleSelected(id: string, isSelected: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function bulk(action: 'delete' | 'move', folderId?: string | null) {
    setWorking(true);
    const ids = [...selected];
    try {
      const result = await apiFetch<{ count: number }>('/api/receipts/bulk', {
        method: 'POST',
        json: { receiptIds: ids, action, ...(action === 'move' ? { folderId: folderId ?? null } : {}) },
      });

      if (action === 'delete') {
        toast({
          title: `${result.count} slip${result.count === 1 ? '' : 's'} deleted`,
          tone: 'info',
          durationMs: 12000,
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await apiFetch('/api/receipts/bulk', { method: 'POST', json: { receiptIds: ids, action: 'restore' } });
                toast({ title: 'Slips restored', tone: 'success' });
                router.refresh();
              } catch {
                toast({ title: 'We could not restore those slips', tone: 'error' });
              }
            },
          },
        });
      } else {
        toast({ title: `${result.count} slip${result.count === 1 ? '' : 's'} moved`, tone: 'success' });
      }

      setSelected(new Set());
      setMoveOpen(false);
      setConfirmDelete(false);
      router.refresh();
    } catch (error) {
      toast({
        title: 'That did not work',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setWorking(false);
    }
  }

  async function bulkExport() {
    setWorking(true);
    try {
      const result = await apiFetch<{ job: { id: string } }>('/api/exports', {
        method: 'POST',
        json: { type: 'SELECTION', receiptIds: [...selected], summaryFormat: 'csv', includeCombinedPdf: false },
      });
      toast({
        title: 'Export started',
        description: 'We will pack the files up — this keeps working if you carry on.',
        tone: 'success',
        action: { label: 'Open exports', onClick: () => router.push(`/exports?highlight=${result.job.id}`) },
      });
      setSelected(new Set());
    } catch (error) {
      toast({
        title: 'We could not start that export',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setWorking(false);
    }
  }

  const allOnPageSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search shop, receipt number, note or tag"
            aria-label="Search your slips"
            className="h-12 w-full rounded-lg border border-ink-300 bg-surface pl-11 pr-4 text-base placeholder:text-ink-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={activeFilterCount > 0 ? 'primary' : 'secondary'}
            onClick={() => setFiltersOpen(true)}
            icon={<SlidersHorizontal className="h-4 w-4" />}
          >
            Filters
            {activeFilterCount > 0 ? (
              <span className="ml-1 rounded-full bg-white/25 px-1.5 text-xs font-bold">{activeFilterCount}</span>
            ) : null}
          </Button>

          <div className="flex overflow-hidden rounded-lg border border-line" role="group" aria-label="View style">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={view === 'grid'}
              aria-label="Grid view"
              className={cn(
                'flex h-12 w-12 items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset',
                view === 'grid' ? 'bg-forest-900 text-white' : 'bg-surface text-ink-600 hover:bg-ink-50',
              )}
            >
              <LayoutGrid aria-hidden="true" className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={view === 'list'}
              aria-label="List view"
              className={cn(
                'flex h-12 w-12 items-center justify-center border-l border-line transition-colors focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset',
                view === 'list' ? 'bg-forest-900 text-white' : 'bg-surface text-ink-600 hover:bg-ink-50',
              )}
            >
              <List aria-hidden="true" className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-ink-600">
          {pending ? (
            'Updating…'
          ) : (
            <>
              <strong className="font-semibold text-forest-900">{total.toLocaleString('en-ZA')}</strong> slip
              {total === 1 ? '' : 's'}
              {total > 0 ? (
                <>
                  {' '}
                  · <strong className="font-semibold text-forest-900">{formatMoney(sumCents, currency)}</strong> in total
                </>
              ) : null}
            </>
          )}
        </p>

        <div className="flex items-center gap-3">
          {items.length > 0 ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-600">
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={(event) => {
                  setSelected((current) => {
                    const next = new Set(current);
                    items.forEach((item) => (event.target.checked ? next.add(item.id) : next.delete(item.id)));
                    return next;
                  });
                }}
                className="h-4.5 w-4.5 cursor-pointer appearance-none rounded border-2 border-ink-400 bg-surface checked:border-green-600 checked:bg-green-600 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
              />
              Select all on this page
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only sm:not-sr-only sm:text-ink-600">Sort</span>
            <select
              value={filters.sort}
              onChange={(event) => applyParams({ sort: event.target.value })}
              aria-label="Sort slips"
              className="h-10 rounded-lg border border-ink-300 bg-surface px-3 text-sm font-medium focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {items.length === 0 ? (
        activeFilterCount > 0 || filters.search ? (
          <NoResultsState
            onClear={() =>
              applyParams({
                search: '',
                folderId: '',
                categoryId: '',
                status: '',
                from: '',
                to: '',
                minAmount: '',
                maxAmount: '',
                tag: '',
              })
            }
          />
        ) : (
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title="Nothing filed yet"
            description="Your slips will appear here the moment you scan your first one."
            action={{ label: 'Scan a slip', href: '/scan' }}
            secondaryAction={{ label: 'Upload a file', href: '/scan?mode=upload' }}
          />
        )
      ) : view === 'grid' ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <ReceiptCard
                receipt={item}
                selectable
                selected={selected.has(item.id)}
                onSelectedChange={(isSelected) => toggleSelected(item.id, isSelected)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {items.map((item) => (
            <ReceiptRow
              key={item.id}
              receipt={item}
              selectable
              selected={selected.has(item.id)}
              onSelectedChange={(isSelected) => toggleSelected(item.id, isSelected)}
            />
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-center gap-3 pt-2">
          <IconButton
            label="Previous page"
            variant="secondary"
            icon={<ChevronLeft className="h-4 w-4" />}
            disabled={page <= 1}
            onClick={() => applyParams({ page: page - 1 })}
          />
          <p className="text-sm font-medium text-ink-600">
            Page {page} of {pageCount}
          </p>
          <IconButton
            label="Next page"
            variant="secondary"
            icon={<ChevronRight className="h-4 w-4" />}
            disabled={page >= pageCount}
            onClick={() => applyParams({ page: page + 1 })}
          />
        </nav>
      ) : null}

      {selected.size > 0 ? (
        <div
          role="region"
          aria-label="Bulk actions"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/97 px-4 py-3 pb-[calc(0.75rem+var(--bottom-nav-height)+env(safe-area-inset-bottom))] shadow-sheet backdrop-blur-sm lg:pb-3"
        >
          <div className="app-container flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-forest-900">
              {selected.size} selected
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="ml-2 rounded-md p-1 align-middle text-ink-500 hover:bg-ink-100 hover:text-charcoal focus-visible:ring-2 focus-visible:ring-green-600"
                aria-label="Clear selection"
              >
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setMoveOpen(true)} icon={<FolderInput className="h-4 w-4" />}>
                Move
              </Button>
              <Button size="sm" variant="secondary" onClick={bulkExport} loading={working} icon={<Download className="h-4 w-4" />}>
                Download
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter your slips"
        description="Narrow things down, then apply."
        variant="sheet"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                const cleared = {
                  search: draft.search,
                  folderId: '',
                  categoryId: '',
                  status: '',
                  from: '',
                  to: '',
                  minAmount: '',
                  maxAmount: '',
                  tag: '',
                };
                setDraft({ ...draft, ...cleared });
                applyParams(cleared);
                setFiltersOpen(false);
              }}
              fullWidth
              className="sm:w-auto"
            >
              Clear all
            </Button>
            <Button
              onClick={() => {
                applyParams(draft);
                setFiltersOpen(false);
              }}
              fullWidth
              className="sm:w-auto"
            >
              Apply filters
            </Button>
          </>
        }
      >
        <div className="space-y-4 pb-2">
          <SelectField
            label="Folder"
            value={draft.folderId}
            onChange={(event) => setDraft({ ...draft, folderId: event.target.value })}
          >
            <option value="">Any folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.label}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Category"
            value={draft.categoryId}
            onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
          >
            <option value="">Any category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>

          <SelectField
            label="Status"
            value={draft.status}
            onChange={(event) => setDraft({ ...draft, status: event.target.value })}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="From date"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
            <TextField
              label="To date"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Smallest amount"
              inputMode="decimal"
              placeholder="0,00"
              value={draft.minAmount}
              onChange={(event) => setDraft({ ...draft, minAmount: event.target.value })}
            />
            <TextField
              label="Largest amount"
              inputMode="decimal"
              placeholder="10 000,00"
              value={draft.maxAmount}
              onChange={(event) => setDraft({ ...draft, maxAmount: event.target.value })}
            />
          </div>

          <TextField
            label="Tag"
            value={draft.tag}
            onChange={(event) => setDraft({ ...draft, tag: event.target.value })}
            placeholder="e.g. job-142"
          />
        </div>
      </Dialog>

      <Dialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title={`Move ${selected.size} slip${selected.size === 1 ? '' : 's'}`}
        description="Pick the folder they should go to."
        variant="sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button onClick={() => bulk('move', moveTarget || null)} loading={working} fullWidth className="sm:w-auto">
              Move them
            </Button>
          </>
        }
      >
        <SelectField
          label="Folder"
          value={moveTarget}
          onChange={(event) => setMoveTarget(event.target.value)}
          containerClassName="pb-2"
        >
          <option value="">Unfiled</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </SelectField>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => bulk('delete')}
        loading={working}
        tone="danger"
        title={`Delete ${selected.size} slip${selected.size === 1 ? '' : 's'}?`}
        description="They will be removed from your library. You will get a short window to undo it."
        confirmLabel="Delete them"
      />
    </div>
  );
}
