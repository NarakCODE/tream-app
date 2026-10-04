import * as React from 'react';
import type { Metadata } from 'next';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { MagicLinkConsumer } from '@/features/auth/components/auth-token-consumer';

export const metadata: Metadata = { title: 'Magic Link | Circle' };

export default function ConsumeMagicLinkPage() {
   return (
      <AuthPageShell>
         <React.Suspense
            fallback={<div className="h-72 w-full animate-pulse rounded-xl bg-muted/40" />}
         >
            <MagicLinkConsumer />
         </React.Suspense>
      </AuthPageShell>
   );
}
