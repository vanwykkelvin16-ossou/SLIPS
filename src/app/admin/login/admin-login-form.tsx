'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { ApiError, apiFetch } from '@/lib/client/api-client';

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);

    try {
      await apiFetch('/api/admin/login', { method: 'POST', json: { email, password } });
      router.replace('/admin');
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.fields) setFieldErrors(caught.fields);
        else if (caught.isOffline) setError('We could not reach the server. Check your connection and try again.');
        else if (caught.status === 429) setError('Too many attempts. Please wait a few minutes and try again.');
        else setError(caught.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <TextField
        label="E-mail address"
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
        placeholder="you@example.co.za"
      />

      <div className="relative">
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
          className="absolute right-2 top-[2.1rem] rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-charcoal focus-visible:ring-2 focus-visible:ring-green-600"
        >
          {showPassword ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
        </button>
      </div>

      <Button type="submit" size="lg" fullWidth loading={submitting} loadingText="Signing you in…">
        Sign in
      </Button>
    </form>
  );
}
