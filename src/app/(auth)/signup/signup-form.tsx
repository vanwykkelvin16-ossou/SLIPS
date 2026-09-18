'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, TextField } from '@/components/ui/field';
import { OfflineState } from '@/components/ui/states';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { MIN_PASSWORD_LENGTH, signupSchema } from '@/lib/validation';

interface FormState {
  firstName: string;
  businessName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

const EMPTY: FormState = {
  firstName: '',
  businessName: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  acceptTerms: false,
};

function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string; tone: string } {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 14 || (/[A-Z]/.test(password) && /\d/.test(password))) score += 1;
  if (password.length >= 16 || /[^A-Za-z0-9]/.test(password)) score += 1;

  if (!password) return { score: 0, label: '', tone: 'bg-ink-200' };
  if (score <= 1) return { score: 1, label: 'Keep going', tone: 'bg-warning-500' };
  if (score === 2) return { score: 2, label: 'Good', tone: 'bg-green-400' };
  return { score: 3, label: 'Strong', tone: 'bg-green-600' };
}

export function SignupForm() {
  const router = useRouter();
  const { online } = useOnlineStatus();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const strength = useMemo(() => passwordStrength(form.password), [form.password]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Same schema as the server, so the two can never drift apart.
    const parsed = signupSchema.safeParse(form);
    if (!parsed.success) {
      const fieldMap: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        if (!fieldMap[key]) fieldMap[key] = issue.message;
      }
      setErrors(fieldMap);
      const firstKey = Object.keys(fieldMap)[0];
      if (firstKey) document.getElementById(`signup-${firstKey}`)?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/auth/signup', { method: 'POST', json: form });

      const result = await signIn('credentials', {
        email: parsed.data.email,
        password: form.password,
        redirect: false,
      });

      if (!result || result.error) {
        // The account exists; only the automatic sign-in failed.
        router.replace('/login?created=1');
        return;
      }

      router.replace('/welcome');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields) setErrors(error.fields);
        setFormError(error.fields ? null : error.message);
        const firstKey = error.fields ? Object.keys(error.fields)[0] : undefined;
        if (firstKey) document.getElementById(`signup-${firstKey}`)?.focus();
      } else {
        setFormError('Something went wrong. Please try again.');
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      {!online ? <OfflineState message="You are offline. Creating an account needs a connection." /> : null}

      {formError ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {formError}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="signup-firstName"
          label="First name"
          name="firstName"
          autoComplete="given-name"
          required
          value={form.firstName}
          onChange={(event) => update('firstName', event.target.value)}
          error={errors.firstName}
          placeholder="Thandi"
        />
        <TextField
          id="signup-businessName"
          label="Business name"
          name="businessName"
          autoComplete="organization"
          required
          value={form.businessName}
          onChange={(event) => update('businessName', event.target.value)}
          error={errors.businessName}
          placeholder="Thandi's Trading"
        />
      </div>

      <TextField
        id="signup-phone"
        label="Telephone number"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        required
        value={form.phone}
        onChange={(event) => update('phone', event.target.value)}
        error={errors.phone}
        hint="South African numbers work as-is (082 123 4567). For other countries add the country code."
        placeholder="082 123 4567"
      />

      <TextField
        id="signup-email"
        label="E-mail address"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        value={form.email}
        onChange={(event) => update('email', event.target.value)}
        error={errors.email}
        placeholder="you@yourbusiness.co.za"
      />

      <div>
        <div className="relative">
          <TextField
            id="signup-password"
            label="Password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(event) => update('password', event.target.value)}
            error={errors.password}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters. A short phrase you will remember works well.`}
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

        {form.password ? (
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
              {[1, 2, 3].map((step) => (
                <span
                  key={step}
                  className={`h-full flex-1 rounded-full transition-colors ${step <= strength.score ? strength.tone : 'bg-ink-200'}`}
                />
              ))}
            </div>
            <span role="status" className="text-xs font-semibold text-ink-600">
              Password strength: {strength.label}
            </span>
          </div>
        ) : null}
      </div>

      <TextField
        id="signup-confirmPassword"
        label="Confirm password"
        name="confirmPassword"
        type={showPassword ? 'text' : 'password'}
        autoComplete="new-password"
        required
        value={form.confirmPassword}
        onChange={(event) => update('confirmPassword', event.target.value)}
        error={errors.confirmPassword}
      />

      <Checkbox
        id="signup-acceptTerms"
        checked={form.acceptTerms}
        onChange={(event) => update('acceptTerms', event.target.checked)}
        error={errors.acceptTerms}
        label={
          <>
            I accept the{' '}
            <Link href="/terms" target="_blank" className="font-semibold text-green-700 underline underline-offset-2 hover:text-green-800">
              Terms of Use
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" className="font-semibold text-green-700 underline underline-offset-2 hover:text-green-800">
              Privacy Policy
            </Link>
            .
          </>
        }
      />

      <Button type="submit" size="lg" fullWidth loading={submitting} loadingText="Creating your workspace…" disabled={!online}>
        Create my account
      </Button>
    </form>
  );
}
