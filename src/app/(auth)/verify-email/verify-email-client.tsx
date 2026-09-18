'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, MailCheck } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/states';
import { ApiError, apiFetch } from '@/lib/client/api-client';

type Status = 'idle' | 'verifying' | 'verified' | 'failed';

export function VerifyEmailClient({ token }: { token: string | null }) {
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;

    apiFetch('/api/auth/verify-email', { method: 'POST', json: { token } })
      .then(() => setStatus('verified'))
      .catch((error: unknown) => {
        setMessage(error instanceof ApiError ? error.message : 'We could not confirm that link.');
        setStatus('failed');
      });
  }, [token]);

  async function resend() {
    setResending(true);
    try {
      await apiFetch('/api/auth/verify-email', { method: 'PUT' });
      setResent(true);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 401
          ? 'Sign in first, then ask for a new confirmation e-mail from Settings.'
          : 'We could not send that just now. Please try again shortly.',
      );
    } finally {
      setResending(false);
    }
  }

  if (status === 'verifying') {
    return <LoadingState message="Confirming your e-mail address…" />;
  }

  if (status === 'verified') {
    return (
      <div className="text-center">
        <span aria-hidden="true" className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-mint-100 text-green-600">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900">E-mail confirmed</h1>
        <p className="mt-2 text-ink-600">Thank you. Your workspace is fully set up.</p>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <ButtonLink href="/dashboard">Go to my dashboard</ButtonLink>
          <ButtonLink href="/login?verified=1" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center">
      <span
        aria-hidden="true"
        className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${
          status === 'failed' ? 'bg-danger-50 text-danger-600' : 'bg-mint-100 text-forest-700'
        }`}
      >
        {status === 'failed' ? <AlertCircle className="h-8 w-8" /> : <MailCheck className="h-8 w-8" />}
      </span>

      <h1 className="text-2xl font-extrabold tracking-tight text-forest-900">
        {status === 'failed' ? 'That link did not work' : 'Confirm your e-mail address'}
      </h1>
      <p className="mt-2 text-ink-600">
        {message ??
          (status === 'failed'
            ? 'Confirmation links expire after 24 hours and can be used once.'
            : 'Open the link we e-mailed you. If it has not arrived, we can send another.')}
      </p>

      {resent ? (
        <p role="status" className="mt-4 rounded-lg border border-mint-300 bg-mint-50 px-4 py-3 text-sm font-medium text-forest-800">
          Sent. Check your inbox — and your spam folder, just in case.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
        <Button onClick={resend} loading={resending} loadingText="Sending…">
          Send a new link
        </Button>
        <ButtonLink href="/dashboard" variant="secondary">
          Continue to Slipsy
        </ButtonLink>
      </div>

      <p className="mt-6 text-sm text-ink-500">
        You can keep using Slipsy while your e-mail is unconfirmed.{' '}
        <Link href="/login" className="rounded font-semibold text-green-700 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  );
}
