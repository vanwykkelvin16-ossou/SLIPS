import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { brand } from '@/config/brand';
import { Wordmark } from '@/components/brand/logo';
import { getAdminSession } from '@/lib/admin/auth';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const session = await getAdminSession();
  if (session) redirect('/admin');

  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <main id="main-content" className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Wordmark size="md" />
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink-600">
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              Administrator
            </span>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6 shadow-card">
            <h1 className="text-xl font-extrabold tracking-tight text-forest-900">Sign in to the admin portal</h1>
            <p className="mt-1.5 text-sm text-ink-500">
              This area is for {brand.name} staff. Customer accounts cannot sign in here.
            </p>

            <AdminLoginForm />
          </div>

          <p className="mt-6 text-center text-sm text-ink-500">
            <Link href="/" className="rounded font-semibold text-green-700 underline underline-offset-2 hover:text-green-800">
              Back to {brand.name}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
