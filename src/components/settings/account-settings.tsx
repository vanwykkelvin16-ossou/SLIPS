'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useSession } from 'next-auth/react';
import { AlertCircle, CheckCircle2, Download, MailWarning, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Switch, TextField } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api-client';
import { MIN_PASSWORD_LENGTH } from '@/lib/validation';

export interface AccountUser {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  notifyByEmail: boolean;
  notifyOnExport: boolean;
  notifyMonthly: boolean;
}

export function ProfileSettings({ user }: { user: AccountUser }) {
  const router = useRouter();
  const { update } = useSession();
  const { toast } = useToast();
  const [form, setForm] = useState(user);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const result = await apiFetch<{ emailChanged: boolean }>('/api/account', {
        method: 'PATCH',
        json: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          email: form.email,
        },
      });
      await update();
      toast({
        title: 'Profile saved',
        description: result.emailChanged ? 'Confirm your new e-mail address using the link we just sent.' : undefined,
        tone: 'success',
      });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      else
        toast({
          title: 'We could not save that',
          description: error instanceof ApiError ? error.message : undefined,
          tone: 'error',
        });
    } finally {
      setSaving(false);
    }
  }

  async function resendVerification() {
    setResending(true);
    try {
      await apiFetch('/api/auth/verify-email', { method: 'PUT' });
      toast({ title: 'Confirmation e-mail sent', description: 'Check your inbox and spam folder.', tone: 'success' });
    } catch {
      toast({ title: 'We could not send that e-mail', tone: 'error' });
    } finally {
      setResending(false);
    }
  }

  return (
    <section aria-labelledby="profile-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 id="profile-heading" className="text-lg font-bold text-forest-900">
        Your details
      </h2>

      {!user.emailVerified ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-warning-500/40 bg-warning-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm font-medium text-warning-600">
            <MailWarning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Your e-mail address is not confirmed yet.
          </p>
          <Button size="sm" variant="secondary" onClick={resendVerification} loading={resending}>
            Send the link again
          </Button>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-600">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-green-600" />
          E-mail address confirmed
        </p>
      )}

      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="First name"
            value={form.firstName}
            onChange={(event) => setForm({ ...form, firstName: event.target.value })}
            error={errors.firstName}
            autoComplete="given-name"
            required
          />
          <TextField
            label="Last name"
            value={form.lastName}
            onChange={(event) => setForm({ ...form, lastName: event.target.value })}
            error={errors.lastName}
            autoComplete="family-name"
            hint="Optional"
          />
        </div>

        <TextField
          label="Telephone number"
          type="tel"
          value={form.phone}
          onChange={(event) => setForm({ ...form, phone: event.target.value })}
          error={errors.phone}
          autoComplete="tel"
          required
        />

        <TextField
          label="E-mail address"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          error={errors.email}
          autoComplete="email"
          hint="Changing this means confirming the new address before we use it."
          required
        />

        <div className="flex justify-end">
          <Button type="submit" loading={saving} loadingText="Saving…">
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}

export function PasswordSettings() {
  const { toast } = useToast();
  const [form, setForm] = useState({ currentPassword: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      await apiFetch('/api/account', { method: 'PUT', json: form });
      toast({
        title: 'Password changed',
        description: 'Every device has been signed out. Please sign in again.',
        tone: 'success',
      });
      setTimeout(() => signOut({ callbackUrl: '/login?reset=1' }), 1500);
    } catch (error) {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      else
        toast({
          title: 'We could not change your password',
          description: error instanceof ApiError ? error.message : undefined,
          tone: 'error',
        });
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="password-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 id="password-heading" className="text-lg font-bold text-forest-900">
        Password
      </h2>
      <p className="mt-1 text-sm text-ink-500">Changing your password signs you out everywhere, including this device.</p>

      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(event) => setForm({ ...form, currentPassword: event.target.value })}
          error={errors.currentPassword}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="flex justify-end">
          <Button type="submit" loading={saving} loadingText="Updating…">
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}

export function NotificationSettings({ user }: { user: AccountUser }) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState({
    notifyByEmail: user.notifyByEmail,
    notifyOnExport: user.notifyOnExport,
    notifyMonthly: user.notifyMonthly,
  });

  async function change(key: keyof typeof prefs, value: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      await apiFetch('/api/account', { method: 'PATCH', json: { [key]: value } });
    } catch {
      setPrefs(previous);
      toast({ title: 'We could not save that preference', tone: 'error' });
    }
  }

  return (
    <section aria-labelledby="notifications-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <h2 id="notifications-heading" className="text-lg font-bold text-forest-900">
        Notifications
      </h2>

      <div className="mt-3 divide-y divide-line">
        <div className="py-3">
          <Switch
            checked={prefs.notifyByEmail}
            onChange={(value) => change('notifyByEmail', value)}
            label="E-mail me"
            description="Turn this off and we will only send security e-mails you cannot opt out of."
          />
        </div>
        <div className="py-3">
          <Switch
            checked={prefs.notifyOnExport}
            onChange={(value) => change('notifyOnExport', value)}
            label="When an export is ready"
            description="Useful for big exports that take a moment to build."
            disabled={!prefs.notifyByEmail}
          />
        </div>
        <div className="py-3">
          <Switch
            checked={prefs.notifyMonthly}
            onChange={(value) => change('notifyMonthly', value)}
            label="Monthly summary"
            description="A short recap of what you filed each month."
            disabled={!prefs.notifyByEmail}
          />
        </div>
      </div>
    </section>
  );
}

export function DataAndDangerZone() {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    setErrors({});
    setDeleting(true);
    try {
      await apiFetch('/api/account', { method: 'DELETE', json: { password, confirmation } });
      toast({ title: 'Your account has been deleted', tone: 'info' });
      setTimeout(() => signOut({ callbackUrl: '/' }), 1200);
    } catch (error) {
      if (error instanceof ApiError && error.fields) setErrors(error.fields);
      else
        toast({
          title: 'We could not delete your account',
          description: error instanceof ApiError ? error.message : undefined,
          tone: 'error',
        });
      setDeleting(false);
    }
  }

  return (
    <>
      <section aria-labelledby="data-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
        <h2 id="data-heading" className="text-lg font-bold text-forest-900">
          Your data
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Your slips belong to you. Download everything we hold at any time, in a format you can keep.
        </p>

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <a
            href="/api/account/export"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-5 font-semibold text-forest-800 shadow-card transition-colors hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Download my account data (JSON)
          </a>
          <a
            href="/exports"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 font-semibold text-forest-800 transition-colors hover:bg-mint-100 focus-visible:ring-2 focus-visible:ring-green-600"
          >
            Download my documents
          </a>
        </div>

        <p className="mt-4 rounded-lg bg-page px-4 py-3 text-sm text-ink-600">
          <strong className="font-semibold text-forest-800">Where your documents live.</strong> Every file you upload is
          stored in private storage that is not publicly reachable. Documents are only served to your signed-in session
          through links that expire within minutes, and they are never shared with another business.
        </p>
      </section>

      <section aria-labelledby="danger-heading" className="rounded-xl border border-danger-500/40 bg-surface p-5 shadow-card">
        <h2 id="danger-heading" className="text-lg font-bold text-danger-600">
          Delete my account
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          This permanently removes your account, your business workspace and every document you have uploaded. It cannot
          be undone — download your data first if you want to keep it.
        </p>
        <Button variant="danger" className="mt-4" onClick={() => setConfirmOpen(true)} icon={<Trash2 className="h-4 w-4" />}>
          Delete my account
        </Button>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={deleteAccount}
        loading={deleting}
        tone="danger"
        title="Delete your account?"
        description="Every slip, folder and export will be destroyed. This cannot be undone."
        confirmLabel="Delete everything"
      >
        <div className="space-y-4 pb-2">
          <p className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            Confirm it is you, then type DELETE to be sure.
          </p>
          <TextField
            label="Your password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            required
          />
          <TextField
            label="Type DELETE to confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            error={errors.confirmation}
            required
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
