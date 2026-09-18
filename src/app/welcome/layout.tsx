import { SessionProvider } from 'next-auth/react';

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
