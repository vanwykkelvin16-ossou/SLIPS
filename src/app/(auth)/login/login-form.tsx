'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { OfflineState } from '@/components/ui/states';

export function LoginForm({
  initialError,
  justReset,
  justVerified,
  nextPath,
}: {
  initialError?: string;
  justReset?: boolean;
  justVerified?: boolean;
  nextPath?: string;
}) {
  const router = useRouter();
  const { online } = useOnlineStatus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setSubmitting(true);

    try {
      const result = await signIn('credentials', { email, password, redirect: false });
      if (!result || result.error) {
        setError('That e-mail address or password is not right. Please try again.');
        setSubmitting(false);
        return;
      }
      // A full navigation so the new session cookie is picked up server-side.
      const destination = nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard';
      router.replace(destination);
      router.refresh();
    } catch {
      setError('We could not reach Slipsy. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      {justReset ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-mint-300 bg-mint-50 px-4 py-3 text-sm font-medium text-forest-800">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          Your password has been changed. Sign in with the new one.
        </p>
      ) : null}

      {justVerified ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-mint-300 bg-mint-50 px-4 py-3 text-sm font-medium text-forest-800">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          Your e-mail address is confirmed. Welcome aboard.
        </p>
      ) : null}

      {!online ? <OfflineState message="You are offline. Signing in needs a connection." /> : null}

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

      <div>
        <div className="relative">
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
        <div className="mt-2 text-right">
          <Link
            href="/forgot-password"
            className="rounded text-sm font-semibold text-green-700 underline underline-offset-2 hover:text-green-800 focus-visible:ring-2 focus-visible:ring-green-600"
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      <Button type="submit" size="lg" fullWidth loading={submitting} loadingText="Signing you in…" disabled={!online}>
        Sign in
      </Button>
    </form>
  );
}
