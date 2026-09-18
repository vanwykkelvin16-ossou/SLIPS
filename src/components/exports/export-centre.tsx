'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Clock, Download, FileArchive, Package, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { Checkbox, SelectField, TextField } from '@/components/ui/field';
import { ProgressBar } from '@/components/ui/feedback';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import type { FolderOption } from '@/components/receipts/receipt-form';

export interface ExportJobView {
  id: string;
  type: string;
  status: string;
  label: string | null;
  fileCount: number;
  sizeBytes: number;
  progress: number;
  periodStart: string | null;
  periodEnd: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  SELECTION: 'Selected slips',
  FOLDER: 'Folder',
  DATE_RANGE: 'Date range',
  FULL_WORKSPACE: 'Everything',
  ACCOUNT_DATA: 'Account data',
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function ExportCentre({
  initialJobs,
  folders,
  initialFolderId,
  highlightId,
}: {
  initialJobs: ExportJobView[];
  folders: FolderOption[];
  initialFolderId?: string;
  highlightId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [jobs, setJobs] = useState(initialJobs);
  const [createOpen, setCreateOpen] = useState(Boolean(initialFolderId));
  const [deleting, setDeleting] = useState<ExportJobView | null>(null);
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    type: initialFolderId ? 'FOLDER' : 'DATE_RANGE',
    folderId: initialFolderId ?? '',
    from: `${new Date().getFullYear()}-01-01`,
    to: today,
    summaryFormat: 'csv',
    includeCombinedPdf: false,
    label: '',
  });

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<{ jobs: ExportJobView[] }>('/api/exports');
      setJobs(result.jobs);
    } catch {
      // A failed poll is not worth interrupting the user for.
    }
  }, []);

  // Poll only while something is actually being built.
  useEffect(() => {
    const active = jobs.some((job) => job.status === 'QUEUED' || job.status === 'PROCESSING');
    if (!active) {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
      return;
    }
    if (pollTimer.current) return;
    pollTimer.current = setInterval(refresh, 2500);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
  }, [jobs, refresh]);

  async function createExport() {
    setFormError(null);
    setWorking(true);
    try {
      await apiFetch('/api/exports', {
        method: 'POST',
        json: {
          type: form.type,
          ...(form.type === 'FOLDER' ? { folderId: form.folderId } : {}),
          ...(form.type === 'DATE_RANGE' ? { from: form.from, to: form.to } : {}),
          summaryFormat: form.summaryFormat,
          includeCombinedPdf: form.includeCombinedPdf,
          ...(form.label.trim() ? { label: form.label.trim() } : {}),
        },
      });
      toast({
        title: 'Export started',
        description: 'We will pack everything up. You can carry on using Slipsy.',
        tone: 'success',
      });
      setCreateOpen(false);
      await refresh();
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'We could not start that export.');
    } finally {
      setWorking(false);
    }
  }

  async function download(job: ExportJobView) {
    try {
      const result = await apiFetch<{ downloadUrl: string | null }>(`/api/exports/${job.id}`);
      if (!result.downloadUrl) {
        toast({ title: 'That export is no longer available', description: 'Create a new one.', tone: 'warning' });
        await refresh();
        return;
      }
      window.location.href = result.downloadUrl;
    } catch (error) {
      toast({
        title: 'We could not start that download',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    }
  }

  async function retry(job: ExportJobView) {
    try {
      await apiFetch(`/api/exports/${job.id}`, { method: 'POST' });
      toast({ title: 'Trying that export again', tone: 'info' });
      await refresh();
    } catch {
      toast({ title: 'We could not retry that export', tone: 'error' });
    }
  }

  async function remove() {
    if (!deleting) return;
    setWorking(true);
    try {
      await apiFetch(`/api/exports/${deleting.id}`, { method: 'DELETE' });
      toast({ title: 'Export removed', tone: 'success' });
      setDeleting(null);
      await refresh();
    } catch {
      toast({ title: 'We could not remove that export', tone: 'error' });
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-mint-300 bg-mint-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-forest-900">Ready for your accountant</h2>
          <p className="mt-1 text-sm text-forest-800/80">
            Pack your slips into one ZIP: original files in year and month folders, plus a spreadsheet summary.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Package className="h-4 w-4" />} className="shrink-0">
          New export
        </Button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={<FileArchive className="h-7 w-7" />}
          title="No exports yet"
          description="Create one whenever your accountant asks — a folder, a date range, or everything you have."
          action={{ label: 'Create an export', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const expired = job.status === 'EXPIRED' || (job.expiresAt ? new Date(job.expiresAt) < new Date() : false);
            const busy = job.status === 'QUEUED' || job.status === 'PROCESSING';

            return (
              <li
                key={job.id}
                className={`rounded-xl border bg-surface p-4 shadow-card ${
                  highlightId === job.id ? 'border-green-600 ring-2 ring-green-600/20' : 'border-line'
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-forest-900">{job.label ?? TYPE_LABELS[job.type] ?? 'Export'}</h3>
                      {job.status === 'READY' && !expired ? (
                        <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                          Ready
                        </Badge>
                      ) : busy ? (
                        <Badge tone="info" icon={<Clock className="h-3.5 w-3.5" />}>
                          {job.status === 'QUEUED' ? 'Queued' : 'Packing…'}
                        </Badge>
                      ) : job.status === 'FAILED' ? (
                        <Badge tone="danger" icon={<TriangleAlert className="h-3.5 w-3.5" />}>
                          Failed
                        </Badge>
                      ) : (
                        <Badge tone="neutral" icon={<Clock className="h-3.5 w-3.5" />}>
                          Expired
                        </Badge>
                      )}
                    </div>

                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="text-ink-500">Type</dt>
                        <dd className="font-medium text-charcoal">{TYPE_LABELS[job.type] ?? job.type}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-ink-500">Requested</dt>
                        <dd className="font-medium text-charcoal">{formatWhen(job.createdAt)}</dd>
                      </div>
                      {job.periodStart && job.periodEnd ? (
                        <div className="flex gap-2">
                          <dt className="text-ink-500">Period</dt>
                          <dd className="font-medium text-charcoal">
                            {job.periodStart.slice(0, 10)} → {job.periodEnd.slice(0, 10)}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex gap-2">
                        <dt className="text-ink-500">Files</dt>
                        <dd className="font-medium text-charcoal">
                          {job.fileCount || '—'}
                          {job.sizeBytes > 0 ? ` · ${formatBytes(job.sizeBytes)}` : ''}
                        </dd>
                      </div>
                      {job.expiresAt && job.status === 'READY' ? (
                        <div className="flex gap-2">
                          <dt className="text-ink-500">Available until</dt>
                          <dd className="font-medium text-charcoal">{formatWhen(job.expiresAt)}</dd>
                        </div>
                      ) : null}
                    </dl>

                    {job.error ? <p className="mt-2 text-sm text-danger-600">{job.error}</p> : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {job.status === 'READY' && !expired ? (
                      <Button size="sm" onClick={() => download(job)} icon={<Download className="h-4 w-4" />}>
                        Download
                      </Button>
                    ) : null}
                    {job.status === 'FAILED' || expired ? (
                      <Button size="sm" variant="secondary" onClick={() => retry(job)} icon={<RefreshCw className="h-4 w-4" />}>
                        Try again
                      </Button>
                    ) : null}
                    {!busy ? (
                      <Button size="sm" variant="ghost" onClick={() => setDeleting(job)} icon={<Trash2 className="h-4 w-4" />}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>

                {busy ? (
                  <ProgressBar
                    className="mt-3"
                    value={job.status === 'QUEUED' ? null : job.progress}
                    label={`Packing ${job.label ?? 'your export'}`}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New export"
        description="Everything is packed into a single ZIP with a spreadsheet summary."
        variant="sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button onClick={createExport} loading={working} fullWidth className="sm:w-auto">
              Start export
            </Button>
          </>
        }
      >
        <div className="space-y-4 pb-2">
          {formError ? (
            <p role="alert" className="rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
              {formError}
            </p>
          ) : null}

          <SelectField
            label="What should we export?"
            value={form.type}
            onChange={(event) => setForm({ ...form, type: event.target.value })}
          >
            <option value="DATE_RANGE">A date range</option>
            <option value="FOLDER">One folder</option>
            <option value="FULL_WORKSPACE">Everything in this business</option>
          </SelectField>

          {form.type === 'FOLDER' ? (
            <SelectField
              label="Folder"
              value={form.folderId}
              onChange={(event) => setForm({ ...form, folderId: event.target.value })}
              hint="Slips in folders inside this one are included too."
            >
              <option value="">Choose a folder…</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </SelectField>
          ) : null}

          {form.type === 'DATE_RANGE' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="From"
                type="date"
                value={form.from}
                onChange={(event) => setForm({ ...form, from: event.target.value })}
                required
              />
              <TextField
                label="To"
                type="date"
                value={form.to}
                onChange={(event) => setForm({ ...form, to: event.target.value })}
                required
              />
            </div>
          ) : null}

          <SelectField
            label="Summary format"
            value={form.summaryFormat}
            onChange={(event) => setForm({ ...form, summaryFormat: event.target.value })}
            hint="A one-row-per-slip summary your accountant can open straight away."
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (XLSX)</option>
            <option value="both">Both</option>
          </SelectField>

          <Checkbox
            checked={form.includeCombinedPdf}
            onChange={(event) => setForm({ ...form, includeCombinedPdf: event.target.checked })}
            label="Also include one combined PDF of every slip (handy for printing)"
          />

          <TextField
            label="Name this export"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="e.g. FY2026 for the auditor"
            hint="Optional — makes it easier to find later."
          />
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={working}
        tone="danger"
        title="Remove this export?"
        description="The archive is deleted. Your slips are untouched — you can build a new export any time."
        confirmLabel="Remove export"
      />
    </div>
  );
}
