'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RetryButton({ className, label = 'Try again' }: { className?: string; label?: string }) {
  return (
    <Button className={className} onClick={() => window.location.reload()} icon={<RefreshCw className="h-4 w-4" />}>
      {label}
    </Button>
  );
}
