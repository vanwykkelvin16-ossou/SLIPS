'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Chrome, MoreVertical, Plus, Share, Smartphone, SquarePlus } from 'lucide-react';
import { brand } from '@/config/brand';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { usePwaInstall, type InstallPlatform } from '@/hooks/use-pwa-install';

interface Step {
  icon: ReactNode;
  title: string;
  detail: string;
}

/** Accurate, per-browser instructions. Nothing here pretends a prompt exists. */
export function manualSteps(platform: InstallPlatform): { heading: string; steps: Step[]; note?: string } {
  switch (platform) {
    case 'ios-safari':
      return {
        heading: `Add ${brand.name} to your iPhone or iPad`,
        steps: [
          { icon: <Share className="h-5 w-5" />, title: 'Tap the Share button', detail: 'It is the square with an arrow, in the toolbar at the bottom (or top) of Safari.' },
          { icon: <SquarePlus className="h-5 w-5" />, title: 'Choose “Add to Home Screen”', detail: 'Scroll down the share sheet until you see it in the list of actions.' },
          { icon: <Plus className="h-5 w-5" />, title: 'Tap “Add”', detail: `${brand.name} appears on your home screen like any other app.` },
        ],
      };
    case 'ios-other':
      return {
        heading: `Add ${brand.name} from Safari`,
        steps: [
          { icon: <Chrome className="h-5 w-5" />, title: 'Open this page in Safari', detail: 'On iPhone and iPad, only Safari can add an app to the home screen.' },
          { icon: <Share className="h-5 w-5" />, title: 'Tap the Share button', detail: 'The square with an arrow pointing up.' },
          { icon: <SquarePlus className="h-5 w-5" />, title: 'Choose “Add to Home Screen”, then “Add”', detail: 'That is it — you are done.' },
        ],
        note: 'Your current browser cannot install apps on iOS. Safari can.',
      };
    case 'android-chrome':
    case 'android-other':
      return {
        heading: `Add ${brand.name} to your home screen`,
        steps: [
          { icon: <MoreVertical className="h-5 w-5" />, title: 'Open the browser menu', detail: 'Tap the three dots in the top-right corner.' },
          { icon: <SquarePlus className="h-5 w-5" />, title: 'Choose “Install app” or “Add to Home screen”', detail: 'The wording depends on your browser version.' },
          { icon: <Plus className="h-5 w-5" />, title: 'Confirm', detail: `${brand.name} installs like a normal app.` },
        ],
      };
    case 'desktop-chromium':
      return {
        heading: `Install ${brand.name} on this computer`,
        steps: [
          { icon: <SquarePlus className="h-5 w-5" />, title: 'Click the install icon in the address bar', detail: 'It looks like a screen with a downward arrow, on the right of the address bar.' },
          { icon: <MoreVertical className="h-5 w-5" />, title: 'Or use the browser menu', detail: 'Three dots → Cast, save and share → Install page as app.' },
          { icon: <Plus className="h-5 w-5" />, title: 'Click “Install”', detail: `${brand.name} opens in its own window.` },
        ],
      };
    default:
      return {
        heading: `Add ${brand.name} to your device`,
        steps: [
          { icon: <MoreVertical className="h-5 w-5" />, title: 'Open your browser menu', detail: 'Look for an “Install”, “Add to Home screen” or “Add to Dock” option.' },
          { icon: <SquarePlus className="h-5 w-5" />, title: 'Choose to install this site', detail: 'Not every browser supports installing apps.' },
          { icon: <Smartphone className="h-5 w-5" />, title: 'Open it from your home screen', detail: `${brand.name} works in any browser either way.` },
        ],
        note: 'If you cannot find the option, your browser may not support installing apps. Everything still works in the browser.',
      };
  }
}

export function InstallSteps({ platform }: { platform: InstallPlatform }) {
  const { heading, steps, note } = manualSteps(platform);

  return (
    <div>
      <h3 className="text-base font-bold text-forest-900">{heading}</h3>
      <ol className="mt-4 space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-lg border border-line bg-page p-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700"
            >
              {step.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-forest-900">
                <span className="mr-1.5 text-ink-500">{index + 1}.</span>
                {step.title}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {note ? <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-600">{note}</p> : null}
    </div>
  );
}

/**
 * The single, shared install experience: a real prompt on browsers that expose
 * one, and step-by-step instructions everywhere else.
 */
export function InstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const install = usePwaInstall();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={install.isInstalled ? 'App installed' : `Add ${brand.name} to your home screen`}
      description={
        install.isInstalled
          ? 'You are already using the installed app. Nothing else to do.'
          : 'One tap to open, works like a normal app, and keeps your slips a second away.'
      }
      footer={
        install.isInstalled ? (
          <Button onClick={onClose} fullWidth className="sm:w-auto">
            Great
          </Button>
        ) : install.canPrompt ? (
          <>
            <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">
              Not now
            </Button>
            <Button
              onClick={async () => {
                const outcome = await install.promptInstall();
                if (outcome !== 'dismissed') onClose();
              }}
              fullWidth
              className="sm:w-auto"
            >
              Add to Home Screen
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">
            Got it
          </Button>
        )
      }
    >
      {install.isInstalled ? (
        <div className="flex items-center gap-3 rounded-lg border border-mint-300 bg-mint-50 p-4">
          <CheckCircle2 aria-hidden="true" className="h-6 w-6 shrink-0 text-green-600" />
          <p className="text-sm font-medium text-forest-800">
            {brand.name} is installed on this device and running in app mode.
          </p>
        </div>
      ) : install.canPrompt ? (
        <div className="rounded-lg border border-mint-300 bg-mint-50 p-4">
          <p className="text-sm font-medium text-forest-800">
            Your browser can install {brand.name} directly. Tap <strong>Add to Home Screen</strong> below and confirm the
            prompt your browser shows.
          </p>
        </div>
      ) : (
        <InstallSteps platform={install.platform} />
      )}
    </Dialog>
  );
}
