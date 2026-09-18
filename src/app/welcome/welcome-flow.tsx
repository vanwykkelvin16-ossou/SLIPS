'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowRight, Camera, CheckCircle2, FolderTree, PartyPopper, Smartphone, Sparkles } from 'lucide-react';
import { brand } from '@/config/brand';
import { Wordmark } from '@/components/brand/logo';
import { InstallSteps } from '@/components/pwa/install-guide';
import { Button } from '@/components/ui/button';
import { SuccessCheck } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { usePwaInstall } from '@/hooks/use-pwa-install';
import { apiFetch } from '@/lib/client/api-client';

const HOW_IT_WORKS = [
  {
    icon: Camera,
    title: 'Snap the slip',
    body: 'Use your camera, upload a photo, or add a PDF invoice. One slip takes a few seconds.',
  },
  {
    icon: Sparkles,
    title: 'Check what we read',
    body: 'We pull out the shop, date, VAT and total. You confirm or correct — you are always in control.',
  },
  {
    icon: FolderTree,
    title: 'Find it whenever you need it',
    body: 'Everything files itself by year and month, ready to search, download or send to your accountant.',
  },
];

type Step = 'welcome' | 'how' | 'install' | 'done';

export function WelcomeFlow({ firstName, businessName }: { firstName: string; businessName: string }) {
  const router = useRouter();
  const { update } = useSession();
  const { toast } = useToast();
  const install = usePwaInstall();
  const [step, setStep] = useState<Step>('welcome');
  const [finishing, setFinishing] = useState(false);

  async function finish() {
    setFinishing(true);
    try {
      await apiFetch('/api/business', { method: 'POST', json: { completed: true } });
      await update();
      setStep('done');
      setTimeout(() => {
        router.replace('/dashboard');
        router.refresh();
      }, 1400);
    } catch {
      toast({
        title: 'We could not finish setting up',
        description: 'Check your connection and try again.',
        tone: 'error',
      });
      setFinishing(false);
    }
  }

  const stepIndex = step === 'welcome' ? 0 : step === 'how' ? 1 : 2;

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <header className="border-b border-line bg-surface">
        <div className="app-container flex h-16 items-center justify-between">
          <Wordmark size="sm" />
          {step !== 'done' ? (
            <Button variant="ghost" size="sm" onClick={finish} disabled={finishing}>
              Skip setup
            </Button>
          ) : null}
        </div>
      </header>

      <main id="main-content" className="app-container flex flex-1 flex-col justify-center py-10">
        <div className="mx-auto w-full max-w-lg">
          {step !== 'done' ? (
            <div className="mb-8">
              <ol className="flex items-center gap-2" aria-label="Setup progress">
                {['Welcome', 'How it works', 'Add to home screen'].map((label, index) => (
                  <li key={label} className="flex flex-1 flex-col gap-1.5">
                    <span
                      aria-hidden="true"
                      className={`h-1.5 rounded-full transition-colors ${index <= stepIndex ? 'bg-green-600' : 'bg-ink-200'}`}
                    />
                    <span className={`text-2xs font-semibold ${index === stepIndex ? 'text-forest-800' : 'text-ink-400'}`}>
                      {index === stepIndex ? label : ''}
                      <span className="sr-only">
                        Step {index + 1}: {label}
                        {index === stepIndex ? ' (current)' : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {step === 'welcome' ? (
            <section className="animate-slide-up text-center">
              <span aria-hidden="true" className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-forest-700">
                <PartyPopper className="h-7 w-7" />
              </span>
              <h1 className="break-words text-3xl font-extrabold tracking-tight text-forest-900">Welcome, {firstName}!</h1>
              <p className="mt-3 text-ink-600 text-balance">
                <strong className="break-words font-semibold text-forest-800">{businessName}</strong> has its own private workspace.
                Only you can see what you file here.
              </p>
              <p className="mt-2 text-ink-600">{brand.tagline}</p>
              <Button size="lg" fullWidth className="mt-8" onClick={() => setStep('how')} iconRight={<ArrowRight className="h-4 w-4" />}>
                Show me how it works
              </Button>
            </section>
          ) : null}

          {step === 'how' ? (
            <section className="animate-slide-up">
              <h1 className="text-2xl font-extrabold tracking-tight text-forest-900">Three steps, that is all</h1>
              <ol className="mt-6 space-y-3">
                {HOW_IT_WORKS.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
                      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-forest-900 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-bold text-forest-900">
                          <span className="text-ink-400">{index + 1}. </span>
                          {item.title}
                        </h2>
                        <p className="mt-1 text-sm text-ink-600">{item.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                <Button variant="secondary" fullWidth onClick={() => setStep('welcome')}>
                  Back
                </Button>
                <Button fullWidth onClick={() => setStep('install')} iconRight={<ArrowRight className="h-4 w-4" />}>
                  Next
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'install' ? (
            <section className="animate-slide-up">
              <span aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mint-100 text-forest-700">
                <Smartphone className="h-6 w-6" />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight text-forest-900">
                {install.isInstalled ? 'You are all set' : `Put ${brand.name} on your home screen`}
              </h1>
              <p className="mt-2 text-ink-600">
                {install.isInstalled
                  ? `${brand.name} is already installed on this device.`
                  : 'Slips get filed fastest when the app is one tap away. You can do this later from More → Add to Home Screen.'}
              </p>

              <div className="mt-6">
                {install.isInstalled ? (
                  <div className="flex items-center gap-3 rounded-xl border border-mint-300 bg-mint-50 p-4">
                    <CheckCircle2 aria-hidden="true" className="h-6 w-6 shrink-0 text-green-600" />
                    <p className="text-sm font-medium text-forest-800">App installed and running in app mode.</p>
                  </div>
                ) : install.canPrompt ? (
                  <div className="rounded-xl border border-mint-300 bg-mint-50 p-5">
                    <p className="text-sm text-forest-800">
                      Your browser can install {brand.name} for you. Tap the button below and confirm.
                    </p>
                    <Button
                      className="mt-4"
                      fullWidth
                      onClick={async () => {
                        const outcome = await install.promptInstall();
                        if (outcome === 'accepted') {
                          toast({ title: 'Installed', description: `${brand.name} is on your home screen.`, tone: 'success' });
                        }
                      }}
                      icon={<Smartphone className="h-4 w-4" />}
                    >
                      Add to Home Screen
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                    <InstallSteps platform={install.platform} />
                  </div>
                )}
              </div>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                <Button variant="secondary" fullWidth onClick={() => setStep('how')} disabled={finishing}>
                  Back
                </Button>
                <Button fullWidth onClick={finish} loading={finishing} loadingText="Getting things ready…">
                  {install.isInstalled ? 'Start using Slipsy' : 'Done — take me in'}
                </Button>
              </div>
            </section>
          ) : null}

          {step === 'done' ? (
            <section role="status" className="flex flex-col items-center text-center">
              <SuccessCheck size={88} />
              <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-forest-900">Your workspace is ready</h1>
              <p className="mt-2 text-ink-600">Taking you to your dashboard…</p>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
