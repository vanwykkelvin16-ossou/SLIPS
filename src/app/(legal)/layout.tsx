import Link from 'next/link';
import { brand } from '@/config/brand';
import { Wordmark } from '@/components/brand/logo';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-page">
      <header className="border-b border-line bg-surface">
        <div className="app-container flex h-16 items-center justify-between">
          <Link href="/" className="rounded-lg focus-visible:ring-2 focus-visible:ring-green-600">
            <Wordmark size="sm" />
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-forest-800 transition-colors hover:bg-mint-100 focus-visible:ring-2 focus-visible:ring-green-600"
          >
            Back to the app
          </Link>
        </div>
      </header>

      <main id="main-content" className="app-container max-w-3xl py-10">
        <article className="prose-slipsy">{children}</article>
      </main>

      <footer className="border-t border-line bg-surface py-8">
        <div className="app-container flex flex-wrap items-center justify-center gap-5 text-sm text-ink-500">
          <Link href="/privacy" className="rounded hover:text-forest-800 hover:underline focus-visible:ring-2 focus-visible:ring-green-600">
            Privacy Policy
          </Link>
          <Link href="/terms" className="rounded hover:text-forest-800 hover:underline focus-visible:ring-2 focus-visible:ring-green-600">
            Terms of Use
          </Link>
          <span>
            © {new Date().getFullYear()} {brand.name}
          </span>
          <Link
            href="/admin/login"
            className="rounded text-ink-400 hover:text-ink-600 hover:underline focus-visible:ring-2 focus-visible:ring-green-600"
          >
            Admin login
          </Link>
        </div>
      </footer>
    </div>
  );
}
