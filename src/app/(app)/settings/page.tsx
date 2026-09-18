import type { Metadata } from 'next';
import { LogOut } from 'lucide-react';
import { InstallStatusRow } from '@/components/pwa/install-card';
import {
  DataAndDangerZone,
  NotificationSettings,
  PasswordSettings,
  ProfileSettings,
  type AccountUser,
} from '@/components/settings/account-settings';
import { SignOutButton } from '@/components/settings/sign-out-button';
import { prisma } from '@/lib/db';
import { requireOnboardedWorkspace } from '@/lib/session';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireOnboardedWorkspace();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      emailVerifiedAt: true,
      notifyByEmail: true,
      notifyOnExport: true,
      notifyMonthly: true,
    },
  });

  const accountUser: AccountUser = {
    firstName: user.firstName,
    lastName: user.lastName ?? '',
    email: user.email,
    phone: user.phone,
    emailVerified: Boolean(user.emailVerifiedAt),
    notifyByEmail: user.notifyByEmail,
    notifyOnExport: user.notifyOnExport,
    notifyMonthly: user.notifyMonthly,
  };

  return (
    <div className="app-container max-w-3xl py-6 lg:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-forest-900 lg:text-3xl">Settings</h1>
        <p className="mt-1 text-ink-600">Your details, your password and how Slipsy behaves on this device.</p>
      </header>

      <div className="space-y-5">
        <ProfileSettings user={accountUser} />

        <section aria-labelledby="app-heading" className="rounded-xl border border-line bg-surface p-5 shadow-card">
          <h2 id="app-heading" className="text-lg font-bold text-forest-900">
            This device
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Install Slipsy so it opens like a normal app, straight from your home screen.
          </p>
          <div className="mt-4">
            <InstallStatusRow />
          </div>
        </section>

        <NotificationSettings user={accountUser} />
        <PasswordSettings />
        <DataAndDangerZone />

        <section className="rounded-xl border border-line bg-surface p-5 shadow-card lg:hidden">
          <h2 className="text-lg font-bold text-forest-900">Sign out</h2>
          <p className="mt-1 text-sm text-ink-500">Sign out of Slipsy on this device.</p>
          <SignOutButton className="mt-4" icon={<LogOut className="h-4 w-4" />} />
        </section>
      </div>
    </div>
  );
}
