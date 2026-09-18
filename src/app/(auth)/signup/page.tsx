import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getWorkspaceSession } from '@/lib/session';
import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a Slipsy business account and stop losing receipts.',
};

export default async function SignupPage() {
  const session = await getWorkspaceSession();
  if (session) redirect(session.onboarded ? '/dashboard' : '/welcome');

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-forest-900">Your slips, sorted</h1>
      <p className="mt-2 text-ink-600">Create your business account. It takes about a minute.</p>

      <SignupForm />

      <p className="mt-8 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="rounded font-semibold text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
