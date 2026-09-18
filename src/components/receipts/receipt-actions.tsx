'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Download, FileDown, FolderInput, Pencil, Share2, Trash2 } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { SelectField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import type { FolderOption } from './receipt-form';

export function ReceiptActions({
  receiptId,
  merchantName,
  originalDownloadUrl,
  currentFolderId,
  folders,
}: {
  receiptId: string;
  merchantName: string | null;
  originalDownloadUrl: string | null;
  currentFolderId: string | null;
  folders: FolderOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState(currentFolderId ?? '');
  const [moving, setMoving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await apiFetch(`/api/receipts/${receiptId}`, { method: 'DELETE' });
      toast({
        title: 'Slip deleted',
        description: 'You can put it back if that was a mistake.',
        tone: 'info',
        durationMs: 12000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await apiFetch(`/api/receipts/${receiptId}?action=restore`, { method: 'PUT' });
              toast({ title: 'Slip restored', tone: 'success' });
              router.push(`/slips/${receiptId}`);
              router.refresh();
            } catch {
              toast({ title: 'We could not restore that slip', tone: 'error' });
            }
          },
        },
      });
      router.push('/slips');
      router.refresh();
    } catch (error) {
      toast({
        title: 'We could not delete that',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function move() {
    setMoving(true);
    try {
      await apiFetch(`/api/receipts/${receiptId}`, {
        method: 'PATCH',
        json: { folderId: moveTarget || null },
      });
      toast({ title: 'Moved', description: 'The slip is in its new folder.', tone: 'success' });
      setMoveOpen(false);
      router.refresh();
    } catch (error) {
      toast({
        title: 'We could not move that slip',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setMoving(false);
    }
  }

  async function duplicate() {
    setDuplicating(true);
    try {
      const result = await apiFetch<{ receiptId: string }>(`/api/receipts/${receiptId}/duplicate`, { method: 'POST' });
      toast({ title: 'Copy created', description: 'Edit the copy without changing the original.', tone: 'success' });
      router.push(`/slips/${result.receiptId}/edit`);
      router.refresh();
    } catch (error) {
      toast({
        title: 'We could not make a copy',
        description: error instanceof ApiError ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setDuplicating(false);
    }
  }

  /**
   * Shares the document itself rather than a link — a link would be useless to
   * anyone outside the workspace, since every document needs a signed-in session.
   */
  async function share() {
    setSharing(true);
    try {
      const response = await fetch(`/api/receipts/${receiptId}/pdf`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('download failed');
      const blob = await response.blob();
      const name = `${(merchantName ?? 'slip').replace(/[^\w -]/g, '')}.pdf`.replace(/\s+/g, '-');
      const file = new File([blob], name, { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: merchantName ?? 'Slip' });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
        toast({
          title: 'Downloaded instead',
          description: 'Your browser cannot share files directly, so we saved the PDF for you.',
          tone: 'info',
        });
      }
    } catch (error) {
      // A share the user cancels is not an error worth shouting about.
      if (error instanceof Error && error.name === 'AbortError') return;
      toast({ title: 'We could not share that slip', tone: 'error' });
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/slips/${receiptId}/edit`} size="sm" icon={<Pencil className="h-4 w-4" />}>
          Edit details
        </ButtonLink>

        <a
          href={`/api/receipts/${receiptId}/pdf`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold text-forest-800 shadow-card transition-colors hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          <FileDown aria-hidden="true" className="h-4 w-4" />
          Download PDF
        </a>

        {originalDownloadUrl ? (
          <a
            href={originalDownloadUrl}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-sm font-semibold text-forest-800 shadow-card transition-colors hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Original file
          </a>
        ) : null}

        <Button size="sm" variant="secondary" onClick={share} loading={sharing} icon={<Share2 className="h-4 w-4" />}>
          Share
        </Button>

        <Button size="sm" variant="secondary" onClick={() => setMoveOpen(true)} icon={<FolderInput className="h-4 w-4" />}>
          Move
        </Button>

        <Button size="sm" variant="secondary" onClick={duplicate} loading={duplicating} icon={<Copy className="h-4 w-4" />}>
          Duplicate
        </Button>

        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
          Delete
        </Button>
      </div>

      <Dialog
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        title="Move this slip"
        description="Choose where it should live. You can move it again at any time."
        variant="sheet"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveOpen(false)} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button onClick={move} loading={moving} fullWidth className="sm:w-auto">
              Move it
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
        onConfirm={remove}
        loading={deleting}
        tone="danger"
        title="Delete this slip?"
        description="It will be removed from your library. You will have a short window to undo this if you change your mind."
        confirmLabel="Delete slip"
      />
    </>
  );
}
