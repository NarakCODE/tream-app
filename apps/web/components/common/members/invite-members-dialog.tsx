'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createInvitationInputSchema, hasPermission, type MembershipRole } from '@repo/schemas';
import { useActiveWorkspace } from '@/features/auth/hooks';
import { useCreateInvitation } from '@/features/invitations/hooks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

export interface InviteMembersDialogProps {
   trigger?: React.ReactNode;
   workspaceId?: string;
   open?: boolean;
   onOpenChange?: (open: boolean) => void;
}

/* -------------------------------------------------------------------------- */
/*  Constants & helpers                                                       */
/* -------------------------------------------------------------------------- */

/** Guards against accidentally pasting a huge list. Adjust to match your API limits. */
const MAX_INVITES_PER_BATCH = 20;

/** Everyone invited through this dialog joins with this role. */
const INVITE_ROLE = 'MEMBER' as const satisfies MembershipRole;

/** Splits on whitespace, commas, and semicolons; lowercases and de-duplicates. */
function parseInvitationEmails(value: string): string[] {
   return [...new Set(value.toLowerCase().split(/[\s,;]+/).filter(Boolean))];
}

function getErrorMessage(error: unknown): string {
   return error instanceof Error && error.message ? error.message : 'Failed to send invitation.';
}

const inviteMembersFormSchema = z
   .object({
      emailInput: z.string(),
   })
   .superRefine(({ emailInput }, context) => {
      const emails = parseInvitationEmails(emailInput);

      if (emails.length === 0) {
         context.addIssue({
            code: 'custom',
            path: ['emailInput'],
            message: 'Please enter at least one email address.',
         });
         return;
      }

      if (emails.length > MAX_INVITES_PER_BATCH) {
         context.addIssue({
            code: 'custom',
            path: ['emailInput'],
            message: `You can invite up to ${MAX_INVITES_PER_BATCH} people at a time.`,
         });
         return;
      }

      // Report every invalid address at once instead of making the user fix them one by one.
      const invalid = emails.filter(
         (email) => !createInvitationInputSchema.safeParse({ email, role: INVITE_ROLE }).success
      );

      if (invalid.length > 0) {
         const preview = invalid.slice(0, 3).join(', ');
         const rest = invalid.length > 3 ? ` and ${invalid.length - 3} more` : '';
         context.addIssue({
            code: 'custom',
            path: ['emailInput'],
            message:
               invalid.length === 1
                  ? `"${invalid[0]}" is not a valid email address.`
                  : `These are not valid email addresses: ${preview}${rest}.`,
         });
      }
   });

type InviteMembersFormValues = z.infer<typeof inviteMembersFormSchema>;

const DEFAULT_VALUES: InviteMembersFormValues = { emailInput: '' };

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function InviteMembersDialog({
   trigger,
   workspaceId: customWorkspaceId,
   open: controlledOpen,
   onOpenChange: setControlledOpen,
}: InviteMembersDialogProps) {
   const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
   const isControlled = controlledOpen !== undefined;
   const open = isControlled ? controlledOpen : uncontrolledOpen;
   const setOpen = isControlled ? (setControlledOpen ?? (() => {})) : setUncontrolledOpen;

   const activeWorkspace = useActiveWorkspace();
   const effectiveWorkspaceId = customWorkspaceId ?? activeWorkspace.data?.workspaceId ?? '';
   const userRole = activeWorkspace.data?.membership?.role ?? null;
   const canInvite = hasPermission(userRole, 'membership.invite');

   const createInvitation = useCreateInvitation(effectiveWorkspaceId);

   const form = useForm<InviteMembersFormValues>({
      resolver: zodResolver(inviteMembersFormSchema),
      defaultValues: DEFAULT_VALUES,
   });
   const emailInput = form.watch('emailInput');
   // Stays true for the whole batch. `createInvitation.isPending` flips back to false
   // between sequential requests, which would briefly re-enable the form and close button.
   const isSubmitting = form.formState.isSubmitting;

   const [submitErrors, setSubmitErrors] = React.useState<string[]>([]);

   const recipientCount = React.useMemo(
      () => parseInvitationEmails(emailInput).length,
      [emailInput]
   );

   // Idempotency keys must survive retries, otherwise re-sending after a partial failure
   // creates duplicate invitations. Keyed by email, cleared when the dialog closes.
   const idempotencyKeys = React.useRef(new Map<string, string>());
   const getIdempotencyKey = (email: string) => {
      let key = idempotencyKeys.current.get(email);
      if (!key) {
         key = crypto.randomUUID();
         idempotencyKeys.current.set(email, key);
      }
      return key;
   };

   // Reset on close regardless of who closed it (user, success, or a controlling parent).
   React.useEffect(() => {
      if (!open) {
         form.reset(DEFAULT_VALUES);
         setSubmitErrors([]);
         idempotencyKeys.current.clear();
      }
   }, [open, form]);

   const handleOpenChange = (nextOpen: boolean) => {
      if (!isSubmitting) setOpen(nextOpen);
   };

   const handleSubmit = form.handleSubmit(async ({ emailInput }) => {
      setSubmitErrors([]);

      if (!effectiveWorkspaceId) {
         setSubmitErrors(['No active workspace selected.']);
         return;
      }

      if (!canInvite) {
         setSubmitErrors(['You do not have permission to invite members.']);
         return;
      }

      const emails = parseInvitationEmails(emailInput);
      const failures: { email: string; message: string }[] = [];

      // Sequential on purpose: keeps ordering predictable and avoids rate limits.
      for (const email of emails) {
         try {
            await createInvitation.mutateAsync({
               email,
               role: INVITE_ROLE,
               key: getIdempotencyKey(email),
            });
            idempotencyKeys.current.delete(email);
         } catch (error) {
            failures.push({ email, message: getErrorMessage(error) });
         }
      }

      const sentCount = emails.length - failures.length;

      if (failures.length === 0) {
         toast.success(
            sentCount === 1 ? `Invitation sent to ${emails[0]}.` : `${sentCount} invitations sent.`
         );
         setOpen(false);
         return;
      }

      // Partial or total failure: keep the dialog open with only the addresses that still need
      // sending, so a retry doesn't re-invite people who already received one.
      if (sentCount > 0) {
         toast.success(`${sentCount} of ${emails.length} invitations sent.`);
      }
      form.setValue('emailInput', failures.map((failure) => failure.email).join('\n'));
      setSubmitErrors(
         emails.length === 1
            ? [failures[0].message]
            : failures.map((failure) => `${failure.email}: ${failure.message}`)
      );
   });

   const submitLabel = isSubmitting
      ? 'Sending…'
      : recipientCount > 1
        ? `Send ${recipientCount} invitations`
        : 'Send invitation';

   return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
         <DialogTrigger asChild>
            {trigger ?? (
               <Button size="sm">
                  <span>Invite</span>
               </Button>
            )}
         </DialogTrigger>

         <DialogContent className="sm:max-w-md">
            <Form {...form}>
               <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
                  <DialogHeader>
                     <DialogTitle className="flex items-center">
                        <span>Invite people to workspace</span>
                     </DialogTitle>
                  </DialogHeader>

                  {!canInvite ? (
                     <Alert variant="destructive">
                        <AlertDescription>
                           You do not have permission to invite members to this workspace. Contact a
                           workspace admin or owner.
                        </AlertDescription>
                     </Alert>
                  ) : (
                     <div className="flex flex-col gap-4 py-2">
                        <FormField
                           control={form.control}
                           name="emailInput"
                           render={({ field }) => (
                              <FormItem>
                                 <FormLabel>Email</FormLabel>
                                 <FormControl>
                                    <Textarea
                                       {...field}
                                       disabled={isSubmitting}
                                       placeholder={'colleague@example.com\nteammate@example.com'}
                                       rows={4}
                                       spellCheck={false}
                                       autoComplete="off"
                                       onChange={(event) => {
                                          field.onChange(event);
                                          if (submitErrors.length > 0) setSubmitErrors([]);
                                       }}
                                    />
                                 </FormControl>
                                 <FormMessage />
                              </FormItem>
                           )}
                        />

                        {submitErrors.length > 0 && (
                           <Alert variant="destructive">
                              <AlertDescription>
                                 {submitErrors.length === 1 ? (
                                    submitErrors[0]
                                 ) : (
                                    <div className="flex flex-col gap-1">
                                       <p>Some invitations could not be sent:</p>
                                       <ul className="list-disc pl-4">
                                          {submitErrors.map((message) => (
                                             <li key={message}>{message}</li>
                                          ))}
                                       </ul>
                                    </div>
                                 )}
                              </AlertDescription>
                           </Alert>
                        )}
                     </div>
                  )}

                  <DialogFooter>
                     <Button
                        type="submit"
                        disabled={
                           isSubmitting || !canInvite || !effectiveWorkspaceId || recipientCount === 0
                        }
                        className="gap-2"
                     >
                        {isSubmitting && <Spinner className="size-4" />}
                        <span>{submitLabel}</span>
                     </Button>
                  </DialogFooter>
               </form>
            </Form>
         </DialogContent>
      </Dialog>
   );
}
