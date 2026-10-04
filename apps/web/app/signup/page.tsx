import * as React from 'react';
import type { Metadata } from 'next';
import { AuthPageShell } from '@/features/auth/components/auth-page-shell';
import { SignupForm } from '@/features/auth/components/signup-form';

export const metadata: Metadata = {
   title: 'Sign Up | Circle',
   description: 'Create an account to get started with Circle',
};

export default function SignupPage() {
   return (
      <AuthPageShell>
         <React.Suspense
            fallback={
               <div className="w-full max-w-md h-[450px] animate-pulse rounded-xl bg-muted/40" />
            }
         >
            <SignupForm />
         </React.Suspense>
      </AuthPageShell>
   );
}
