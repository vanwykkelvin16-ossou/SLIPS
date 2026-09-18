import type { Metadata } from 'next';
import { brand } from '@/config/brand';
import { requireAdmin } from '@/lib/admin/auth';
import { directoryQuerySchema, getDirectoryStats, listRegisteredUsers } from '@/lib/admin/directory';
import { AdminHeader } from './admin-header-actions';
import { UserDirectory } from './user-directory';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  const [directory, stats] = await Promise.all([
    listRegisteredUsers(directoryQuerySchema.parse({})),
    getDirectoryStats(),
  ]);

  return (
    <div className="min-h-dvh bg-page">
      <AdminHeader email={admin.email} name={admin.name} mustChangePassword={admin.mustChangePassword} />

      <main id="main-content" className="app-container py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold tracking-tight text-forest-900">Registered users</h1>
          <p className="mt-1 text-ink-600">
            Everyone who has signed up for {brand.name}, with their contact details. This is a read-only directory — no
            receipts, amounts or documents are shown here.
          </p>
        </div>

        <UserDirectory
          initial={{
            users: directory.users,
            total: directory.total,
            page: directory.page,
            pageCount: directory.pageCount,
            stats,
          }}
        />
      </main>
    </div>
  );
}
