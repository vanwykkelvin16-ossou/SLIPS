import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, CircleHelp, Download, FileText, LogOut, Shield, Store, Settings as SettingsIcon } from 'lucide-react';
import { brand } from '@/config/brand';
import { Wordmark } from '@/components/brand/logo';
import { InstallStatusRow } from '@/components/pwa/install-card';
import { SignOutButton } from '@/components/settings/sign-out-button';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'More' };

const LINKS = [
  { href: '/exports', label: 'Exports', description: 'Download packs for your accountant', icon: Download },
  { href: '/business', label: 'Business profile', description: 'Name, currency, categories', icon: Store },
  { href: '/settings', label: 'Settings', description: 'Your details, password, notifications', icon: SettingsIcon },
  { href: '/help', label: 'Help', description: 'How Slipsy works', icon: CircleHelp },
];

const LEGAL = [
  { href: '/privacy', label: 'Privacy Policy', icon: Shield },
  { href: '/terms', label: 'Terms of Use', icon: FileText },
];

export default async function MorePage() {
  const session = await requireOnboardedWorkspace();

  return (
    <div className="app-container max-w-2xl py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900">More</h1>
        <p className="mt-1 text-ink-600">
          {session.businessName} · {session.email}
        </p>
      </header>

      <div className="space-y-5">
        <section aria-label="Install Slipsy">
          <InstallStatusRow />
        </section>

        <nav aria-label="More options">
          <ul className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href} className="border-b border-line last:border-0">
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
                  >
                    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mint-100 text-forest-700">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-forest-900">{item.label}</span>
                      <span className="block truncate text-sm text-ink-500">{item.description}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <ul className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            {LEGAL.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href} className="border-b border-line last:border-0">
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-forest-800 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
                  >
                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <SignOutButton className="w-full" icon={<LogOut className="h-4 w-4" />} />

        <footer className="flex flex-col items-center gap-2 pt-4 text-center">
          <Wordmark size="sm" />
          <p className="text-sm text-ink-500">{brand.tagline}</p>
        </footer>
      </div>
    </div>
  );
}
