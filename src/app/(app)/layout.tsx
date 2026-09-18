import { SessionProvider } from 'next-auth/react';
import { BottomNav } from '@/components/nav/bottom-nav';
import { Sidebar } from '@/components/nav/sidebar';
import { TopBar } from '@/components/nav/top-bar';
import { UploadQueueSync } from '@/components/scan/upload-queue-sync';
import { requireWorkspace } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireWorkspace();

  return (
    <SessionProvider>
      <div className="flex min-h-dvh bg-page">
        <Sidebar businessName={session.businessName} firstName={session.firstName} email={session.email} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar businessName={session.businessName} />

          <main
            id="main-content"
            className="flex-1 pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] lg:pb-10"
          >
            {children}
          </main>
        </div>

        <BottomNav />
        <UploadQueueSync />
      </div>
    </SessionProvider>
  );
}
