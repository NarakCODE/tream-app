'use client';

import { useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@repo/api-client';
import { acceptInvitationInputSchema } from '@repo/schemas';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/hooks';
import { useSelectWorkspace } from '@/features/workspaces/hooks';
import { invitationAttempt } from './attempt';
import { useAcceptInvitation } from './hooks';

export function AcceptInvitation() {
   const token = useSearchParams().get('token') ?? '';
   const router = useRouter();
   const user = useCurrentUser();
   const accept = useAcceptInvitation();
   const select = useSelectWorkspace();
   const [error, setError] = useState<string | null>(null);
   const [busy, setBusy] = useState(false);
   const submitting = useRef(false);
   const valid = acceptInvitationInputSchema.safeParse({ token }).success;

   async function join() {
      if (!user.data || !valid || submitting.current) return;
      submitting.current = true;
      setBusy(true);
      setError(null);
      try {
         const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
         const tokenHash = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, '0')
         ).join('');
         const scope = `accept:${user.data.id}:${tokenHash}`;
         const member = await accept.mutateAsync({ token, key: invitationAttempt(scope) });
         await select.mutateAsync({
            id: member.workspaceId,
            key: invitationAttempt(`${scope}:select`),
         });
         router.replace('/');
         router.refresh();
      } catch (cause) {
         setError(
            cause instanceof ApiError && cause.status === 403
               ? 'Sign in with the invited email address and verify that email before accepting.'
               : cause instanceof Error
                 ? cause.message
                 : 'Could not accept this invitation. Try again.'
         );
      } finally {
         submitting.current = false;
         setBusy(false);
      }
   }

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               Join your workspace
            </h1>
            <p className="text-sm text-muted-foreground">
               Accept your invitation using the verified email address it was sent to.
            </p>
         </div>

         <div className="space-y-4">
            {user.data && (
               <p className="text-sm text-muted-foreground">
                  Signed in as{' '}
                  <span className="font-medium text-foreground">{user.data.email}</span>.
               </p>
            )}
            {!valid && (
               <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
               >
                  This invitation link is invalid. Ask your workspace administrator for a new
                  invitation.
               </p>
            )}
            {error && (
               <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
               >
                  {error}
               </p>
            )}
            <div className="pt-2">
               <Button
                  className="w-full font-medium"
                  disabled={!valid || busy || !user.data}
                  onClick={() => void join()}
               >
                  {busy ? 'Joining…' : 'Accept invitation'}
               </Button>
            </div>
         </div>
      </div>
   );
}
