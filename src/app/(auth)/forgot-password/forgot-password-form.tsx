'use client';

import { useState } from 'react';
import { AlertCircle, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/client/api-client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/auth/forgot-password', { method: 'POST', json: { email } });
      setSent(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="mt-8 rounded-xl border border-mint-300 bg-mint-50 p-6 text-center">
        <span aria-hidden="true" className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-green-600">
          <MailCheck className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-bold text-forest-900">Check your inbox</h2>
        <p className="mt-2 text-sm text-forest-800/80">
          If that e-mail address has an account, a reset link is on its way. The link works once and expires in an hour.
        </p>
        <Button variant="ghost" className="mt-4" onClick={() => setSent(false)}>
          Use a different address
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <TextField
        label="E-mail address"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@yourbusiness.co.za"
      />

      <Button type="submit" size="lg" fullWidth loading={submitting} loadingText="Sending…">
        Send reset link
      </Button>
    </form>
  );
}
