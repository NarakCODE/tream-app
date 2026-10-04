import * as React from 'react';
import type { Metadata } from 'next';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { EmailVerificationConsumer } from '@/features/auth/components/auth-token-consumer';

export const metadata: Metadata = { title: 'Confirm Email | Circle' };

export default function ConfirmEmailPage() {
   return (
      <AuthPageShell>
         <React.Suspense
            fallback={<div className="h-72 w-full animate-pulse rounded-xl bg-muted/40" />}
         >
            <EmailVerificationConsumer />
         </React.Suspense>
      </AuthPageShell>
   );
}
