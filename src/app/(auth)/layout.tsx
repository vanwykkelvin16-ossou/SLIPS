import Link from 'next/link';
import { CheckCircle2, FolderTree, Sparkles } from 'lucide-react';
import { brand } from '@/config/brand';
import { Wordmark } from '@/components/brand/logo';

const highlights = [
  { icon: <Sparkles className="h-4 w-4" />, text: 'Snap a slip and we read the details for you.' },
  { icon: <FolderTree className="h-4 w-4" />, text: 'Everything files itself by year and month.' },
  { icon: <CheckCircle2 className="h-4 w-4" />, text: 'Export a tidy pack for your accountant in one tap.' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Brand panel: decorative on small screens, full storytelling on large. */}
      <aside className="relative hidden bg-forest-900 px-10 py-12 lg:flex lg:w-[42%] lg:flex-col lg:justify-between xl:px-14">
        <Link href="/" className="inline-flex w-fit rounded-lg focus-visible:ring-2 focus-visible:ring-mint-300">
          <Wordmark tone="inverse" size="md" />
        </Link>

        <div className="max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight text-white text-balance">
            No more piles of paper.
          </h2>
          <p className="mt-4 text-lg text-mint-200">
            {brand.name} turns a shoebox of slips into a searchable, accountant-ready record — in seconds a slip.
          </p>

          <ul className="mt-8 space-y-3">
            {highlights.map((item) => (
              <li key={item.text} className="flex items-start gap-3 text-mint-100">
                <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10">
                  {item.icon}
                </span>
                <span className="text-sm leading-relaxed">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-mint-200/70">
          Your documents are private to your business, stored securely, and never shared.
        </p>
      </aside>

      <main id="main-content" className="flex flex-1 flex-col px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <div className="lg:hidden">
          <Link href="/" className="inline-flex rounded-lg focus-visible:ring-2 focus-visible:ring-green-600">
            <Wordmark size="sm" />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">{children}</div>
        </div>

        <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-ink-500">
          <Link href="/privacy" className="rounded hover:text-forest-800 hover:underline focus-visible:ring-2 focus-visible:ring-green-600">
            Privacy Policy
          </Link>
          <Link href="/terms" className="rounded hover:text-forest-800 hover:underline focus-visible:ring-2 focus-visible:ring-green-600">
            Terms of Use
          </Link>
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
        </footer>
      </main>
    </div>
  );
}
