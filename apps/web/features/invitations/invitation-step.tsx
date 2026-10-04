'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createInvitationInputSchema } from '@repo/schemas';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/features/auth/hooks';
import { invitationAttempt } from './attempt';
import { useCreateInvitation } from './hooks';
import { invitationStorageError, readInvitationDraft, saveInvitationDraft } from './draft';

export function InvitationStep({
   workspaceId,
   onContinue,
}: {
   workspaceId: string;
   onContinue: () => void;
}) {
   const user = useCurrentUser();
   const create = useCreateInvitation(workspaceId);
   const [emails, setEmails] = useState('');
   const [busy, setBusy] = useState(false);
   const [queued, setQueued] = useState<string[]>([]);
   const [errors, setErrors] = useState<string[]>([]);
   const [readyScope, setReadyScope] = useState<string | null>(null);
   const submitting = useRef(false);
   const scope = user.data ? `${workspaceId}:${user.data.id}` : null;

   useEffect(() => {
      if (!scope) return;
      try {
         const draft = readInvitationDraft(scope);
         setEmails(draft.emails);
         setQueued(draft.queued);
         setErrors([]);
         setReadyScope(scope);
      } catch {
         setErrors([invitationStorageError]);
         setReadyScope(null);
      }
   }, [scope]);

   function changeEmails(value: string) {
      setEmails(value);
      if (!scope) return;
      try {
         saveInvitationDraft(scope, { emails: value, queued });
      } catch {
         setErrors([invitationStorageError]);
         setReadyScope(null);
      }
   }

   async function submit(event: FormEvent) {
      event.preventDefault();
      if (!user.data || !scope || readyScope !== scope || submitting.current) return;
      const addresses = [
         ...new Set(
            emails
               .split(/[\s,;]+/)
               .filter(Boolean)
               .map((email) => email.toLowerCase())
         ),
      ];
      if (!addresses.length) {
         return;
      }
      if (
         addresses.some(
            (email) => !createInvitationInputSchema.safeParse({ email, role: 'MEMBER' }).success
         )
      ) {
         setErrors(['Enter valid email addresses separated by commas or new lines.']);
         return;
      }
      try {
         saveInvitationDraft(scope, { emails: addresses.join('\n'), queued });
      } catch {
         setErrors([invitationStorageError]);
         setReadyScope(null);
         return;
      }
      submitting.current = true;
      setBusy(true);
      setErrors([]);
      const failures: string[] = [];
      const messages: string[] = [];
      const pending = [...addresses];
      let successful = [...queued];
      for (const email of addresses) {
         let key: string;
         try {
            key = invitationAttempt(`${scope}:${email}`);
         } catch (error) {
            setErrors([
               error instanceof Error && error.message.includes('invalid')
                  ? error.message
                  : invitationStorageError,
            ]);
            setReadyScope(null);
            setBusy(false);
            submitting.current = false;
            return;
         }
         try {
            await create.mutateAsync({ email, key });
            successful = [...new Set([...successful, email])];
            pending.splice(pending.indexOf(email), 1);
            setQueued(successful);
            setEmails(pending.join('\n'));
         } catch (error) {
            failures.push(email);
            messages.push(
               `${email}: ${error instanceof Error ? error.message : 'Could not queue invitation. Retry.'}`
            );
            continue;
         }
         try {
            saveInvitationDraft(scope, { emails: pending.join('\n'), queued: successful });
         } catch {
            setErrors([invitationStorageError]);
            setReadyScope(null);
            setBusy(false);
            submitting.current = false;
            return;
         }
      }
      setEmails(failures.join('\n'));
      setErrors(messages);
      setBusy(false);
      submitting.current = false;
   }

   return (
      <form onSubmit={submit} className="space-y-5">
         <div className="space-y-2">
            <Label htmlFor="onboarding-invitations">Email addresses (optional)</Label>
            <Textarea
               id="onboarding-invitations"
               value={emails}
               onChange={(event) => changeEmails(event.target.value)}
               disabled={busy || !scope || readyScope !== scope}
               placeholder="teammate@example.com"
               rows={4}
               autoCapitalize="none"
               spellCheck={false}
               className="min-h-28 resize-y"
               aria-describedby="invitation-help"
            />
            <p id="invitation-help" className="text-xs text-muted-foreground">
               Separate addresses with commas or new lines.
            </p>
         </div>
         {queued.length > 0 && (
            <p role="status" className="break-words text-sm text-muted-foreground">
               Invitations queued for {queued.join(', ')}.
            </p>
         )}
         {errors.length > 0 && (
            <div role="alert" className="space-y-1 break-words text-sm text-destructive">
               {errors.map((error) => (
                  <p key={error}>{error}</p>
               ))}
            </div>
         )}
         <div className="flex flex-col gap-2">
            <Button
               type="submit"
               disabled={busy || !user.data || readyScope !== scope || !emails.trim()}
            >
               {busy ? 'Queuing invitations…' : 'Send invitations'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onContinue}>
               {queued.length ? 'Continue to workspace' : 'Skip for now'}
            </Button>
         </div>
      </form>
   );
}
