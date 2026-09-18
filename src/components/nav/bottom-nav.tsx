'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { isActivePath, mobileNav } from './nav-items';

/**
 * Mobile navigation. "Scan" is raised and coloured because capturing a slip is
 * the thing people open the app to do.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {mobileNav.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          const isScan = item.href === '/scan';

          if (isScan) {
            return (
              <li key={item.href} className="flex flex-1 justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  aria-label="Scan a slip"
                  className="group -mt-5 flex flex-col items-center gap-1 px-2 pb-1.5 focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-14 w-14 items-center justify-center rounded-full border-4 border-surface shadow-float transition-all',
                      'group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-green-600 group-focus-visible:ring-offset-2',
                      active ? 'bg-forest-900 text-white' : 'bg-green-600 text-white group-hover:bg-green-700',
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className={cn('text-2xs font-bold', active ? 'text-forest-900' : 'text-forest-800')}>
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset',
                  active ? 'text-forest-900' : 'text-ink-500 hover:text-forest-800',
                )}
              >
                <Icon aria-hidden="true" className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
                <span className={cn('text-2xs', active ? 'font-bold' : 'font-medium')}>{item.label}</span>
                {active ? <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-green-600" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
