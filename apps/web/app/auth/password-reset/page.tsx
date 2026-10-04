import * as React from 'react';
import type { Metadata } from 'next';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { PasswordResetForm } from '@/features/auth/components/password-reset-form';

export const metadata: Metadata = { title: 'Reset Password | Circle' };

export default function PasswordResetPage() {
   return (
      <AuthPageShell>
         <React.Suspense
            fallback={<div className="h-96 w-full animate-pulse rounded-xl bg-muted/40" />}
         >
            <PasswordResetForm />
         </React.Suspense>
      </AuthPageShell>
   );
}
