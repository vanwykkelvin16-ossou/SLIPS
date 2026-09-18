'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Mail, Phone, Search, Users } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { IconButton } from '@/components/ui/button';
import { ListRowSkeleton } from '@/components/ui/states';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import type { DirectoryStats, RegisteredUser, RegisteredUserStatus } from '@/lib/admin/directory';

interface DirectoryResponse {
  users: RegisteredUser[];
  total: number;
  page: number;
  pageCount: number;
  stats: DirectoryStats;
}

/** Short enough to fit the column; `title` carries the full meaning. */
const STATUS_META: Record<RegisteredUserStatus, { label: string; tone: BadgeTone; detail: string }> = {
  ACTIVE: { label: 'Active', tone: 'success', detail: 'Active — e-mail address confirmed' },
  UNCONFIRMED: { label: 'Unconfirmed', tone: 'warning', detail: 'Registered but has not confirmed their e-mail address' },
  LOCKED: { label: 'Locked', tone: 'danger', detail: 'Temporarily locked after repeated failed sign-ins' },
  CLOSED: { label: 'Closed', tone: 'neutral', detail: 'The account has been closed' },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Older browsers and non-secure contexts have no clipboard API.
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.position = 'absolute';
        field.style.left = '-9999px';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        document.body.removeChild(field);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: 'Could not copy that', description: 'Select the text and copy it manually.', tone: 'error' });
    }
  }

  return (
    <IconButton
      label={copied ? `${label} copied` : `Copy ${label}`}
      size="sm"
      icon={copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      onClick={copy}
    />
  );
}

export function UserDirectory({ initial }: { initial: DirectoryResponse }) {
  const [data, setData] = useState(initial);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRender = useRef(true);

  const load = useCallback(async (nextSearch: string, nextSort: 'newest' | 'oldest', nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort: nextSort, page: String(nextPage) });
      if (nextSearch.trim()) params.set('search', nextSearch.trim());
      const result = await apiFetch<DirectoryResponse>(`/api/admin/users?${params.toString()}`);
      setData(result);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError('Your session has ended. Please sign in again.');
      } else {
        setError(caught instanceof ApiError ? caught.message : 'We could not load the directory.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search so each keystroke does not hit the database.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setSearch(searchDraft);
      setPage(1);
      void load(searchDraft, sort, 1);
    }, 300);
    return () => clearTimeout(timer);
    // `sort` and `page` changes are handled by their own callers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  function changeSort(next: 'newest' | 'oldest') {
    setSort(next);
    setPage(1);
    void load(search, next, 1);
  }

  function changePage(next: number) {
    setPage(next);
    void load(search, sort, next);
  }

  return (
    <div className="space-y-4">
      <section aria-labelledby="stats-heading" className="grid gap-3 sm:grid-cols-3">
        <h2 id="stats-heading" className="sr-only">
          Registration numbers
        </h2>
        {[
          { label: 'Registered users', value: data.stats.total },
          { label: 'Joined this month', value: data.stats.thisMonth },
          { label: 'Joined today', value: data.stats.today },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-line bg-surface p-5 shadow-card">
            <p className="text-sm font-semibold text-ink-600">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-forest-900">
              {stat.value.toLocaleString('en-ZA')}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="directory-heading" className="rounded-xl border border-line bg-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
          {/* Distinct from the page's own "Registered users" heading so the two
              are told apart when navigating by heading. */}
          <h2 id="directory-heading" className="sr-only">
            Search and browse the directory
          </h2>

          <div className="relative flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Search name, business, e-mail or telephone"
              aria-label="Search registered users"
              className="h-11 w-full rounded-lg border border-ink-300 bg-surface pl-11 pr-4 text-base placeholder:text-ink-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-600">Sort</span>
            <select
              value={sort}
              onChange={(event) => changeSort(event.target.value as 'newest' | 'oldest')}
              aria-label="Sort registered users"
              className="h-11 rounded-lg border border-ink-300 bg-surface px-3 text-sm font-medium focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>

        <p role="status" className="px-4 py-2.5 text-sm text-ink-600">
          {loading
            ? 'Loading…'
            : `${data.total.toLocaleString('en-ZA')} ${data.total === 1 ? 'person' : 'people'}${search ? ' match that search' : ' registered'}`}
        </p>

        {error ? (
          <ErrorState
            title="We could not load the directory"
            description={error}
            onRetry={() => load(search, sort, page)}
          />
        ) : loading && data.users.length === 0 ? (
          <div>
            {[0, 1, 2, 3, 4].map((index) => (
              <ListRowSkeleton key={index} />
            ))}
          </div>
        ) : data.users.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7" />}
            title={search ? 'Nobody matches that search' : 'No one has registered yet'}
            description={
              search
                ? 'Try part of a name, business, e-mail address or telephone number.'
                : 'New registrations appear here automatically as people sign up.'
            }
            action={search ? { label: 'Clear search', onClick: () => setSearchDraft('') } : undefined}
          />
        ) : (
          <>
            {/* Desktop: a plain, scannable table. */}
            <div className="hidden overflow-x-auto md:block">
              {/* Fixed layout with declared widths: the columns share the
                  available space predictably instead of one long e-mail
                  address pushing Status off the edge. */}
              <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
                <caption className="sr-only">Everyone registered for Slipsy, with their contact details</caption>
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[17%]" />
                  <col className="w-[27%]" />
                  <col className="w-[17%]" />
                  <col className="w-[12%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-page text-left">
                    <th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold text-ink-600">
                      Name
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold text-ink-600">
                      Business
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold text-ink-600">
                      E-mail
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold text-ink-600">
                      Telephone
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold text-ink-600">
                      Registered
                    </th>
                    <th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold text-ink-600">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id} className="border-b border-line last:border-0 hover:bg-ink-50">
                      <th scope="row" className="truncate px-3 py-3 text-left font-semibold text-forest-900" title={`${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`}>
                        {user.firstName}
                        {user.lastName ? ` ${user.lastName}` : ''}
                      </th>
                      <td className="truncate px-3 py-3 text-charcoal" title={user.businessName}>{user.businessName}</td>
                      <td className="px-3 py-3">
                        <span className="flex min-w-0 items-center gap-1">
                          <a
                            href={`mailto:${user.email}`}
                            title={user.email}
                            className="min-w-0 flex-1 truncate rounded text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600"
                          >
                            {user.email}
                          </a>
                          <CopyButton value={user.email} label="e-mail address" />
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <a
                            href={`tel:${user.phone}`}
                            className="rounded text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600"
                          >
                            {user.phone}
                          </a>
                          <CopyButton value={user.phone} label="telephone number" />
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-charcoal">
                        <time dateTime={user.registeredAt} title={formatDateTime(user.registeredAt)}>
                          {formatDate(user.registeredAt)}
                        </time>
                      </td>
                      <td className="px-3 py-3">
                        <span title={STATUS_META[user.status].detail}>
                          <Badge tone={STATUS_META[user.status].tone}>{STATUS_META[user.status].label}</Badge>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: stacked contact cards. */}
            <ul className="divide-y divide-line md:hidden">
              {data.users.map((user) => (
                <li key={user.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-forest-900">
                        {user.firstName}
                        {user.lastName ? ` ${user.lastName}` : ''}
                      </p>
                      <p className="truncate text-sm text-ink-600">{user.businessName}</p>
                    </div>
                    <span title={STATUS_META[user.status].detail}>
                      <Badge tone={STATUS_META[user.status].tone}>{STATUS_META[user.status].label}</Badge>
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                      <a
                        href={`mailto:${user.email}`}
                        className="min-w-0 flex-1 truncate rounded text-sm text-green-700 underline underline-offset-2"
                      >
                        {user.email}
                      </a>
                      <CopyButton value={user.email} label="e-mail address" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                      <a href={`tel:${user.phone}`} className="min-w-0 flex-1 truncate rounded text-sm text-green-700 underline underline-offset-2">
                        {user.phone}
                      </a>
                      <CopyButton value={user.phone} label="telephone number" />
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-ink-500">
                    Registered <time dateTime={user.registeredAt}>{formatDateTime(user.registeredAt)}</time>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}

        {data.pageCount > 1 ? (
          <nav aria-label="Directory pages" className="flex items-center justify-center gap-3 border-t border-line p-3">
            <IconButton
              label="Previous page"
              variant="secondary"
              size="sm"
              icon={<ChevronLeft className="h-4 w-4" />}
              disabled={page <= 1 || loading}
              onClick={() => changePage(page - 1)}
            />
            <p className="text-sm font-medium text-ink-600">
              Page {data.page} of {data.pageCount}
            </p>
            <IconButton
              label="Next page"
              variant="secondary"
              size="sm"
              icon={<ChevronRight className="h-4 w-4" />}
              disabled={page >= data.pageCount || loading}
              onClick={() => changePage(page + 1)}
            />
          </nav>
        ) : null}
      </section>
    </div>
  );
}
