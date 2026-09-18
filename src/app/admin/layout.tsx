import type { Metadata } from 'next';
import { ToastProvider } from '@/components/ui/toast';

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/**
 * The admin portal renders outside the customer app shell: no workspace
 * navigation, no customer session provider, nothing that could blur the line
 * between the two.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
