import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Camera, Download, FolderTree, Lock, Search, Sparkles } from 'lucide-react';
import { brand } from '@/config/brand';
import { Wordmark } from '@/components/brand/logo';
import { ButtonLink } from '@/components/ui/button';
import { getWorkspaceSession } from '@/lib/session';

const steps = [
  {
    icon: Camera,
    title: 'Snap it',
    body: 'Photograph the slip, upload an image, or drop in a PDF. It takes seconds.',
  },
  {
    icon: Sparkles,
    title: 'We read it',
    body: 'Merchant, date, VAT and total are pulled out for you. You check them and save.',
  },
  {
    icon: FolderTree,
    title: 'It files itself',
    body: 'Every slip lands in the right year and month folder, ready to find again.',
  },
];

const features = [
  { icon: Search, title: 'Find any slip in seconds', body: 'Search by shop, amount, note or tag. Filter by date, folder or category.' },
  { icon: Download, title: 'Ready for your accountant', body: 'Export a folder or a whole tax year as a tidy ZIP with a spreadsheet summary.' },
  { icon: Lock, title: 'Private by design', body: 'Documents are stored privately, served over time-limited links, and never shared.' },
];

export default async function LandingPage() {
  const session = await getWorkspaceSession();
  if (session) redirect(session.onboarded ? '/dashboard' : '/welcome');

  return (
    <div className="min-h-dvh bg-page">
      <header className="border-b border-line bg-surface">
        <div className="app-container flex h-16 items-center justify-between">
          <Wordmark size="sm" />
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-forest-800 transition-colors hover:bg-mint-100 focus-visible:ring-2 focus-visible:ring-green-600"
            >
              Sign in
            </Link>
            <ButtonLink href="/signup" size="sm">
              Get started
            </ButtonLink>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className="app-container py-14 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-mint-300 bg-mint-50 px-3.5 py-1.5 text-sm font-semibold text-forest-800">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
              {brand.tagline}
            </p>
            <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-forest-900 text-balance sm:text-5xl">
              No more piles of paper.
            </h1>
            <p className="mt-5 text-lg text-ink-600 text-balance">
              {brand.name} turns the receipts stuffed in your wallet, your van and your drawer into an organised,
              searchable record your accountant will thank you for.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg" iconRight={<ArrowRight className="h-4 w-4" />}>
                Create your free account
              </ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">
                I already have an account
              </ButtonLink>
            </div>
          </div>
        </section>

        <section aria-labelledby="how-it-works" className="app-container pb-16">
          <h2 id="how-it-works" className="text-center text-2xl font-bold tracking-tight text-forest-900">
            Three steps. That is the whole thing.
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="rounded-xl border border-line bg-surface p-6 shadow-card">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-lg bg-forest-900 text-white"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-bold text-forest-900">
                    <span className="text-ink-400">{index + 1}. </span>
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-ink-600">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        <section aria-labelledby="features" className="border-y border-line bg-surface py-16">
          <div className="app-container">
            <h2 id="features" className="text-center text-2xl font-bold tracking-tight text-forest-900">
              Built for real businesses
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-xl bg-page p-6">
                    <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg bg-mint-100 text-forest-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-bold text-forest-900">{feature.title}</h3>
                    <p className="mt-1.5 text-sm text-ink-600">{feature.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="app-container py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-forest-900">Ready when you are</h2>
          <p className="mx-auto mt-3 max-w-md text-ink-600">
            Add {brand.name} to your phone’s home screen and capture a slip the moment it lands in your hand.
          </p>
          <ButtonLink href="/signup" size="lg" className="mt-6">
            Start filing your slips
          </ButtonLink>
        </section>
      </main>

      <footer className="border-t border-line bg-surface py-8">
        <div className="app-container flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Wordmark size="sm" />
          <nav aria-label="Legal" className="flex items-center gap-5 text-sm text-ink-500">
            <Link href="/privacy" className="rounded hover:text-forest-800 hover:underline focus-visible:ring-2 focus-visible:ring-green-600">
              Privacy Policy
            </Link>
            <Link href="/terms" className="rounded hover:text-forest-800 hover:underline focus-visible:ring-2 focus-visible:ring-green-600">
              Terms of Use
            </Link>
            <span>
              © {new Date().getFullYear()} {brand.name}
            </span>
          </nav>
        </div>
      </footer>
    </div>
  );
}
