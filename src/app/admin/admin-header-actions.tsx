'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, LogOut, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation';

export function AdminHeader({
  email,
  name,
  mustChangePassword,
}: {
  email: string;
  name: string;
  /** Renders the standing warning below the header when still true. */
  mustChangePassword: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await apiFetch('/api/admin/logout', { method: 'POST' });
    } catch {
      // Even if the call fails, sending the admin to sign-in is the right move.
    } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  }

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="app-container flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 sm:h-16 sm:flex-nowrap sm:py-0">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-lg focus-visible:ring-2 focus-visible:ring-green-600">
              <Wordmark size="sm" />
            </Link>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-page px-2.5 py-1 text-2xs font-bold uppercase tracking-wide text-ink-600">
              <ShieldCheck aria-hidden="true" className="h-3 w-3" />
              Admin
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="mr-1 hidden min-w-0 flex-col text-right sm:flex">
              <span className="truncate text-sm font-semibold text-forest-900">{name}</span>
              <span className="truncate text-xs text-ink-500">{email}</span>
            </span>

            <Button size="sm" variant="secondary" onClick={() => setPasswordOpen(true)} icon={<KeyRound className="h-4 w-4" />}>
              Password
            </Button>
            <Button size="sm" variant="ghost" onClick={signOut} loading={signingOut} icon={<LogOut className="h-4 w-4" />}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {mustChangePassword ? <InitialPasswordWarning onChange={() => setPasswordOpen(true)} /> : null}

      <ChangePasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onChanged={() => {
          toast({
            title: 'Password changed',
            description: 'Sign in again with your new password.',
            tone: 'success',
          });
          setTimeout(() => {
            router.replace('/admin/login');
            router.refresh();
          }, 1200);
        }}
      />
    </>
  );
}

/** Sits in the page flow under the header rather than floating over it. */
function InitialPasswordWarning({ onChange }: { onChange: () => void }) {
  return (
    <div role="alert" className="border-b border-warning-500/40 bg-warning-50">
      <div className="app-container flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning-600">
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          This account still uses the password it was created with.
        </p>
        <Button size="sm" onClick={onChange} className="ml-auto">
          Change it now
        </Button>
      </div>
    </div>
  );
}

function ChangePasswordDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState({ currentPassword: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch('/api/admin/password', { method: 'POST', json: form });
      onChanged();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      else setFormError(error instanceof ApiError ? error.message : 'We could not change that password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change admin password"
      description="You will be signed out of the admin portal everywhere once it changes."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving} fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button onClick={submit} loading={saving} loadingText="Saving…" fullWidth className="sm:w-auto">
            Change password
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        {formError ? (
          <p role="alert" className="rounded-lg border border-danger-500/40 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-600">
            {formError}
          </p>
        ) : null}

        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
          error={errors.currentPassword}
          required
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
          error={errors.confirmPassword}
          required
        />
      </div>
    </Dialog>
  );
}
