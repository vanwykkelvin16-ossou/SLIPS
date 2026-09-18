'use client';

import type { ReactNode } from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export function SignOutButton({
  className,
  icon,
  label = 'Sign out',
  variant = 'secondary',
}: {
  className?: string;
  icon?: ReactNode;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  return (
    <Button variant={variant} className={className} icon={icon} onClick={() => signOut({ callbackUrl: '/login' })}>
      {label}
    </Button>
  );
}
