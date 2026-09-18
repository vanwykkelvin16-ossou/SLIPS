'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react';
import { Button, IconButton } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { SelectField, TextField } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { cn } from '@/lib/cn';

export interface FolderTreeNode {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  icon: string | null;
  archived: boolean;
  isSystem: boolean;
  canDelete: boolean;
  receiptCount: number;
  totalCount: number;
  children: FolderTreeNode[];
}

const COLOR_CHOICES = ['#1F6B47', '#2F9E68', '#4C8DB8', '#8A6BC1', '#C97C2E', '#C1554B', '#5A6B62'];

export function FolderManager({
  folders,
  parentOptions,
}: {
  folders: FolderTreeNode[];
  parentOptions: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(folders.map((folder) => folder.id)));
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<FolderTreeNode | null>(null);
  const [deleting, setDeleting] = useState<FolderTreeNode | null>(null);
  const [working, setWorking] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] = useState({ name: '', parentId: '', color: COLOR_CHOICES[0]! });
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (node: FolderTreeNode): FolderTreeNode | null => {
      if (!showArchived && node.archived) return null;
      const children = node.children.map(matches).filter((child): child is FolderTreeNode => child !== null);
      if (!term || node.name.toLowerCase().includes(term) || children.length > 0) {
        return { ...node, children };
      }
      return null;
    };
    return folders.map(matches).filter((node): node is FolderTreeNode => node !== null);
  }, [folders, search, showArchived]);

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createFolder() {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Give the folder a name.');
      return;
    }
    setWorking(true);
    try {
      await apiFetch('/api/folders', {
        method: 'POST',
        json: { name: form.name.trim(), parentId: form.parentId || null, color: form.color },
      });
      toast({ title: 'Folder created', tone: 'success' });
      setCreateOpen(false);
      setForm({ name: '', parentId: '', color: COLOR_CHOICES[0]! });
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? (error.fields?.name ?? error.message) : 'That did not work.');
    } finally {
      setWorking(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('Give the folder a name.');
      return;
    }
    setWorking(true);
    try {
      await apiFetch(`/api/folders/${editing.id}`, {
        method: 'PATCH',
        json: { name: form.name.trim(), color: form.color },
      });
      toast({ title: 'Folder updated', tone: 'success' });
      setEditing(null);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof ApiError ? (error.fields?.name ?? error.message) : 'That did not work.');
    } finally {
      setWorking(false);
    }
  }

  async function setArchived(folder: FolderTreeNode, archived: boolean) {
    try {
      await apiFetch(`/api/folders/${folder.id}`, { method: 'PATCH', json: { archived } });
      toast({ title: archived ? 'Folder archived' : 'Folder restored', tone: 'success' });
      router.refresh();
    } catch (error) {
      toast({
        title: 'That did not work',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    }
  }

  async function remove() {
    if (!deleting) return;
    setWorking(true);
    try {
      const result = await apiFetch<{ movedToUnfiled: number }>(`/api/folders/${deleting.id}`, { method: 'DELETE' });
      toast({
        title: 'Folder deleted',
        description:
          result.movedToUnfiled > 0
            ? `${result.movedToUnfiled} slip${result.movedToUnfiled === 1 ? '' : 's'} moved to Unfiled — nothing was lost.`
            : undefined,
        tone: 'success',
      });
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast({
        title: 'We could not delete that folder',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setWorking(false);
    }
  }

  function renderNode(node: FolderTreeNode, depth = 0) {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children.length > 0;

    return (
      <li key={node.id}>
        <div
          className={cn(
            'group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-mint-50',
            node.archived && 'opacity-60',
          )}
          style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.name}`}
              className="rounded-md p-1 text-ink-500 transition-colors hover:bg-ink-100 hover:text-charcoal focus-visible:ring-2 focus-visible:ring-green-600"
            >
              {isOpen ? (
                <ChevronDown aria-hidden="true" className="h-4 w-4" />
              ) : (
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span aria-hidden="true" className="w-6" />
          )}

          <Link
            href={`/slips?folderId=${node.id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700"
              style={node.color ? { backgroundColor: `${node.color}1f`, color: node.color } : undefined}
            >
              {isOpen && hasChildren ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-forest-900">{node.name}</span>
              <span className="block text-xs text-ink-500">
                {node.totalCount} slip{node.totalCount === 1 ? '' : 's'}
                {node.archived ? ' · archived' : ''}
                {node.isSystem ? ' · automatic' : ''}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1 opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
            <a
              href={`/exports?folderId=${node.id}`}
              aria-label={`Export ${node.name}`}
              title={`Export ${node.name}`}
              className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-charcoal focus-visible:ring-2 focus-visible:ring-green-600"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
            </a>

            {!node.isSystem ? (
              <>
                <IconButton
                  label={`Rename ${node.name}`}
                  size="sm"
                  icon={<Pencil className="h-4 w-4" />}
                  onClick={() => {
                    setEditing(node);
                    setForm({ name: node.name, parentId: '', color: node.color ?? COLOR_CHOICES[0]! });
                    setFormError(null);
                  }}
                />
                <IconButton
                  label={node.archived ? `Restore ${node.name}` : `Archive ${node.name}`}
                  size="sm"
                  icon={node.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  onClick={() => setArchived(node, !node.archived)}
                />
                {node.canDelete ? (
                  <IconButton
                    label={`Delete ${node.name}`}
                    size="sm"
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setDeleting(node)}
                  />
                ) : null}
              </>
            ) : (
              <span className="px-2 text-ink-300" aria-hidden="true">
                <MoreHorizontal className="h-4 w-4 opacity-0" />
              </span>
            )}
          </div>
        </div>

        {hasChildren && isOpen ? <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search folders"
            aria-label="Search folders"
            className="h-12 w-full rounded-lg border border-ink-300 bg-surface pl-11 pr-4 text-base placeholder:text-ink-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>
        <Button
          onClick={() => {
            setForm({ name: '', parentId: '', color: COLOR_CHOICES[0]! });
            setFormError(null);
            setCreateOpen(true);
          }}
          icon={<FolderPlus className="h-4 w-4" />}
          className="shrink-0"
        >
          New folder
        </Button>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-600">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
          className="h-4.5 w-4.5 cursor-pointer appearance-none rounded border-2 border-ink-400 bg-surface checked:border-green-600 checked:bg-green-600 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
        />
        Show archived folders
      </label>

      <div className="rounded-xl border border-line bg-surface p-2 shadow-card">
        {filtered.length === 0 ? (
          search ? (
            <EmptyState
              icon={<Search className="h-7 w-7" />}
              title="No folders match that search"
              description="Try a shorter word, or clear the search to see everything."
              action={{ label: 'Clear search', onClick: () => setSearch('') }}
            />
          ) : (
            <EmptyState
              icon={<FolderPlus className="h-7 w-7" />}
              title="Your folders appear as you file slips"
              description="We create a folder for each year and month automatically. You can add your own folders too."
              action={{ label: 'Scan a slip', href: '/scan' }}
              secondaryAction={{ label: 'Create a folder', onClick: () => setCreateOpen(true) }}
            />
          )
        ) : (
          <ul>{filtered.map((node) => renderNode(node))}</ul>
        )}
      </div>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New folder"
        description="Group slips however suits your business."
        variant="sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button onClick={createFolder} loading={working} fullWidth className="sm:w-auto">
              Create folder
            </Button>
          </>
        }
      >
        <div className="space-y-4 pb-2">
          <TextField
            label="Folder name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            error={formError ?? undefined}
            placeholder="e.g. Vehicle costs"
            required
          />
          <SelectField
            label="Inside"
            value={form.parentId}
            onChange={(event) => setForm({ ...form, parentId: event.target.value })}
            hint="Leave as “Top level” to keep it alongside your year folders."
          >
            <option value="">Top level</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Rename folder"
        variant="sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={working} fullWidth className="sm:w-auto">
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4 pb-2">
          <TextField
            label="Folder name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            error={formError ?? undefined}
            required
          />
          <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={working}
        tone="danger"
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="The folder goes away, but every slip inside it moves to Unfiled. No documents are deleted."
        confirmLabel="Delete folder"
      />
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-forest-800">Colour</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {COLOR_CHOICES.map((color) => (
          <label key={color} className="cursor-pointer">
            <input
              type="radio"
              name="folder-color"
              value={color}
              checked={value === color}
              onChange={() => onChange(color)}
              className="sr-only peer"
            />
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-transparent transition-all peer-checked:border-charcoal peer-focus-visible:ring-2 peer-focus-visible:ring-green-600 peer-focus-visible:ring-offset-2"
              style={{ backgroundColor: `${color}26`, color }}
            >
              <Folder aria-hidden="true" className="h-5 w-5" />
            </span>
            <span className="sr-only">Colour {color}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
