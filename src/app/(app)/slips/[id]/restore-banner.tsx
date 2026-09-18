'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/client/api-client';

export function RestoreDeletedBanner({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [restoring, setRestoring] = useState(false);

  async function restore() {
    setRestoring(true);
    try {
      await apiFetch(`/api/receipts/${receiptId}?action=restore`, { method: 'PUT' });
      toast({ title: 'Slip restored', description: 'It is back in your library.', tone: 'success' });
      router.refresh();
    } catch {
      toast({ title: 'We could not restore that slip', tone: 'error' });
      setRestoring(false);
    }
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-sm font-medium text-danger-600">
        <Trash2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        This slip is deleted. It is hidden from your library but nothing has been destroyed.
      </p>
      <Button size="sm" variant="secondary" onClick={restore} loading={restoring} icon={<RotateCcw className="h-4 w-4" />}>
        Put it back
      </Button>
    </div>
  );
}
