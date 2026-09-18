import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  if (!token) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-forest-900">This link is not valid</h1>
        <p className="mt-2 text-ink-600">
          The reset link is missing its code. Ask for a new one and use the most recent e-mail.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-lg bg-green-600 px-5 font-semibold text-white shadow-card transition-colors hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-forest-900">Choose a new password</h1>
      <p className="mt-2 text-ink-600">Pick something you will remember. Every other device will be signed out.</p>
      <ResetPasswordForm token={token} />
    </div>
  );
}
