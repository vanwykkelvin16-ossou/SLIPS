import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-forest-900">Reset your password</h1>
      <p className="mt-2 text-ink-600">
        Enter the e-mail address you signed up with and we will send you a link to choose a new password.
      </p>

      <ForgotPasswordForm />

      <p className="mt-8 text-center text-sm text-ink-600">
        Remembered it?{' '}
        <Link
          href="/login"
          className="rounded font-semibold text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
