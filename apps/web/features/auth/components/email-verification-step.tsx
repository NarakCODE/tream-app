'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useRequestEmailVerificationMutation } from '../hooks';
import { safeAuthRedirect } from '../redirect';

export function EmailVerificationStep({
   destination,
   email,
}: {
   destination: string;
   email: string;
}) {
   const resend = useRequestEmailVerificationMutation();
   const [error, setError] = useState<string | null>(null);
   const [notice, setNotice] = useState<string | null>(null);

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               Check your email
            </h1>
            <p className="text-sm text-muted-foreground">
               A verification email has been requested for{' '}
               <span className="font-medium text-foreground">{email}</span>. Open the link to verify
               your account, then sign in to continue.
            </p>
         </div>

         <div className="space-y-4">
            {error && (
               <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
               >
                  {error}
               </p>
            )}
            {notice && (
               <p
                  role="status"
                  className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
               >
                  {notice}
               </p>
            )}
            <Button asChild className="w-full font-medium">
               <Link href={`/login?redirect=${encodeURIComponent(safeAuthRedirect(destination))}`}>
                  Continue to sign in
               </Link>
            </Button>
            <Button
               className="w-full"
               variant="outline"
               disabled={resend.isPending}
               onClick={() => {
                  setError(null);
                  setNotice(null);
                  resend.mutate(
                     { email },
                     {
                        onSuccess: () =>
                           setNotice(
                              'A new verification email has been requested. Check your inbox.'
                           ),
                        onError: (cause) => setError(cause.message),
                     }
                  );
               }}
            >
               {resend.isPending ? 'Requesting…' : 'Resend verification email'}
            </Button>
         </div>
      </div>
   );
}
