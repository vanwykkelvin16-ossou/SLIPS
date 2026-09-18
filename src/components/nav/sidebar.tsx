'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { Wordmark } from '@/components/brand/logo';
import { cn } from '@/lib/cn';
import { isActivePath, primaryNav, secondaryNav } from './nav-items';

export function Sidebar({ businessName, firstName, email }: { businessName: string; firstName: string; email: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-forest-800 bg-forest-900 px-3 py-5 lg:flex xl:w-72"
    >
      <Link href="/dashboard" className="mb-6 px-2 rounded-lg focus-visible:ring-2 focus-visible:ring-mint-300">
        <Wordmark tone="inverse" size="sm" />
      </Link>

      <div className="mb-5 rounded-lg bg-white/[0.06] px-3 py-2.5">
        <p className="truncate text-sm font-bold text-white" title={businessName}>
          {businessName}
        </p>
        <p className="truncate text-xs text-mint-200/80" title={email}>
          {firstName} · {email}
        </p>
      </div>

      <ul className="space-y-1">
        {primaryNav.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300',
                  active ? 'bg-green-600 text-white' : 'text-mint-100/85 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <hr className="my-4 border-white/10" />

      <ul className="space-y-1">
        {secondaryNav.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300',
                  active ? 'bg-green-600 text-white' : 'text-mint-100/85 hover:bg-white/[0.08] hover:text-white',
                )}
              >
                <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto pt-4">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-mint-100/85 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-300"
        >
          <LogOut aria-hidden="true" className="h-[18px] w-[18px] shrink-0" />
          Sign Out
        </button>
      </div>
    </nav>
  );
}
