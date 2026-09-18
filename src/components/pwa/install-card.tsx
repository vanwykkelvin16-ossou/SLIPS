'use client';

import { useState } from 'react';
import { CheckCircle2, Smartphone, X } from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { InstallDialog } from './install-guide';

/** Dashboard card. Hidden once the app is installed or the user dismisses it. */
export function InstallCard() {
  const install = usePwaInstall();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!install.ready || install.isInstalled || install.dismissed) return null;

  return (
    <>
      <section
        aria-labelledby="install-card-heading"
        className="relative overflow-hidden rounded-xl border border-mint-300 bg-mint-50 p-5"
      >
        <button
          type="button"
          onClick={install.dismiss}
          aria-label="Dismiss the install suggestion"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-forest-700/70 transition-colors hover:bg-mint-200 hover:text-forest-900 focus-visible:ring-2 focus-visible:ring-green-600"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-forest-900 text-white"
          >
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="install-card-heading" className="pr-6 text-base font-bold text-forest-900">
              Put {brand.name} on your home screen
            </h2>
            <p className="mt-1 text-sm text-forest-800/80">
              Scan a slip the moment you get it — one tap from your home screen, no browser needed.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                {install.canPrompt ? 'Add to Home Screen' : 'Show me how'}
              </Button>
              <Button size="sm" variant="ghost" onClick={install.dismiss}>
                Maybe later
              </Button>
            </div>
          </div>
        </div>
      </section>

      <InstallDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

/**
 * Persistent entry point in More / Settings. Shows installation status instead
 * of the action once the app is running in standalone mode.
 */
export function InstallStatusRow() {
  const install = usePwaInstall();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!install.ready) {
    return <div className="skeleton h-14 w-full" />;
  }

  if (install.isInstalled) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-mint-300 bg-mint-50 px-4 py-3">
        <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-green-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-forest-900">App installed</p>
          <p className="text-sm text-forest-800/75">{brand.name} is on this device’s home screen.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          install.resetDismissal();
          setDialogOpen(true);
        }}
        className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700">
          <Smartphone className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-forest-900">Add to Home Screen</span>
          <span className="block text-sm text-ink-500">
            {install.canPrompt ? 'Install the app on this device' : 'See the steps for your device'}
          </span>
        </span>
      </button>

      <InstallDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}
