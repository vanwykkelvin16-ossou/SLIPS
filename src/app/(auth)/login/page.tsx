import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getWorkspaceSession } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Slipsy workspace.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string; reset?: string; verified?: string };
}) {
  const session = await getWorkspaceSession();
  if (session) redirect(session.onboarded ? '/dashboard' : '/welcome');

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-forest-900">Welcome back</h1>
      <p className="mt-2 text-ink-600">Sign in to get to your slips.</p>

      <LoginForm
        initialError={searchParams.error ? 'That e-mail address or password is not right.' : undefined}
        justReset={searchParams.reset === '1'}
        justVerified={searchParams.verified === '1'}
        nextPath={searchParams.next}
      />

      <p className="mt-8 text-center text-sm text-ink-600">
        New to Slipsy?{' '}
        <Link
          href="/signup"
          className="rounded font-semibold text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600"
        >
          Create a business account
        </Link>
      </p>
    </div>
  );
}
