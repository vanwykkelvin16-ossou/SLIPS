'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { MIN_PASSWORD_LENGTH, resetPasswordSchema } from '@/lib/validation';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
    if (!parsed.success) {
      const fieldMap: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!fieldMap[key]) fieldMap[key] = issue.message;
      }
      setErrors(fieldMap);
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/auth/reset-password', { method: 'POST', json: { token, password, confirmPassword } });
      router.replace('/login?reset=1');
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'invalid_token') setExpired(true);
        else if (error.fields) setErrors(error.fields);
        else setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  if (expired) {
    return (
      <div role="alert" className="mt-8 rounded-xl border border-danger-500/40 bg-danger-50 p-6">
        <h2 className="text-lg font-bold text-forest-900">That link has expired</h2>
        <p className="mt-2 text-sm text-ink-600">
          Reset links last one hour and can only be used once. Request a fresh one and try again.
        </p>
        <Link
          href="/forgot-password"
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-green-600 px-5 font-semibold text-white transition-colors hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      {formError ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {formError}
        </p>
      ) : null}

      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={errors.password}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />

      <TextField
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={errors.confirmPassword}
      />

      <Button type="submit" size="lg" fullWidth loading={submitting} loadingText="Saving…">
        Save new password
      </Button>
    </form>
  );
}
