import * as React from 'react';
import type { Metadata } from 'next';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { LoginForm } from '@/features/auth/components/login-form';

export const metadata: Metadata = {
   title: 'Sign In | Circle',
   description: 'Sign in to access your workspace',
};

export default function LoginPage() {
   return (
      <AuthPageShell>
         <React.Suspense
            fallback={<div className="w-full max-w-md h-96 animate-pulse rounded-xl bg-muted/40" />}
         >
            <LoginForm />
         </React.Suspense>
      </AuthPageShell>
   );
}
