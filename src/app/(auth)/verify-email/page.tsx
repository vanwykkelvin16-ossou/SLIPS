import type { Metadata } from 'next';
import { VerifyEmailClient } from './verify-email-client';

export const metadata: Metadata = {
  title: 'Confirm your e-mail',
  robots: { index: false, follow: false },
};

export default function VerifyEmailPage({ searchParams }: { searchParams: { token?: string } }) {
  return <VerifyEmailClient token={searchParams.token ?? null} />;
}
