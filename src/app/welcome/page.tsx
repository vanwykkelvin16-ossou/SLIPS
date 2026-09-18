import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { WelcomeFlow } from './welcome-flow';

export const metadata: Metadata = {
  title: 'Welcome',
  robots: { index: false, follow: false },
};

export default async function WelcomePage({ searchParams }: { searchParams: { again?: string } }) {
  const session = await requireWorkspace();

  // Finished already? Straight to work — unless the user asked to see it again.
  if (session.onboarded && searchParams.again !== '1') redirect('/dashboard');

  return <WelcomeFlow firstName={session.firstName} businessName={session.businessName} />;
}
