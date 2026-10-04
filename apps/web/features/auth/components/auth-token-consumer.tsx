'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useConfirmEmailVerificationMutation, useConsumeMagicLinkMutation } from '../hooks';

export function EmailVerificationConsumer() {
   const token = useSearchParams().get('token') ?? '';
   const mutation = useConfirmEmailVerificationMutation();
   const submitted = React.useRef('');
   const [confirmed, setConfirmed] = React.useState(false);

   React.useEffect(() => {
      if (!token || submitted.current === token) return;
      submitted.current = token;
      mutation.mutate(
         { token },
         {
            onSuccess: () => {
               setConfirmed(true);
               toast.success('Your email has been verified.');
            },
            onError: (error) =>
               toast.error(error.message || 'This verification link is invalid or expired.'),
         }
      );
   }, [mutation, token]);

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               Email verification
            </h1>
            <p className="text-sm text-muted-foreground">
               {confirmed
                  ? 'Your email address is verified.'
                  : token
                    ? 'We’re checking your one-time verification link.'
                    : 'This link is missing its verification token.'}
            </p>
         </div>

         <div className="space-y-4">
            {mutation.isPending && (
               <p
                  role="status"
                  className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
               >
                  Verifying…
               </p>
            )}
            {mutation.isError && (
               <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
               >
                  {mutation.error.message}
               </p>
            )}

            <div className="pt-2 flex flex-col gap-3">
               {(confirmed || mutation.isError || !token) && (
                  <Button asChild className="w-full font-medium">
                     <Link href="/login">Continue to sign in</Link>
                  </Button>
               )}
               {(mutation.isError || !token) && (
                  <Button asChild variant="outline" className="w-full">
                     <Link href="/email-verification">Request another link</Link>
                  </Button>
               )}
            </div>
         </div>
      </div>
   );
}

export function MagicLinkConsumer() {
   const token = useSearchParams().get('token') ?? '';
   const mutation = useConsumeMagicLinkMutation();
   const submitted = React.useRef('');

   React.useEffect(() => {
      if (!token || submitted.current === token) return;
      submitted.current = token;
      mutation.mutate(
         { token },
         {
            onError: (error) =>
               toast.error(error.message || 'This sign-in link is invalid or expired.'),
         }
      );
   }, [mutation, token]);

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               Signing you in
            </h1>
            <p className="text-sm text-muted-foreground">
               {token
                  ? 'We’re checking your one-time sign-in link.'
                  : 'This link is missing its sign-in token.'}
            </p>
         </div>

         <div className="space-y-4">
            {mutation.isPending && (
               <p
                  role="status"
                  className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
               >
                  Signing in…
               </p>
            )}
            {mutation.isError && (
               <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
               >
                  {mutation.error.message}
               </p>
            )}

            <div className="pt-2 flex flex-col gap-3">
               {(mutation.isError || !token) && (
                  <Button asChild className="w-full font-medium">
                     <Link href="/magic-link/request">Request another sign-in link</Link>
                  </Button>
               )}
               {(mutation.isError || !token) && (
                  <Button asChild variant="outline" className="w-full">
                     <Link href="/login">Use your password</Link>
                  </Button>
               )}
            </div>
         </div>
      </div>
   );
}
