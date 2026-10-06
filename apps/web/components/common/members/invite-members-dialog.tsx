'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
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
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   DialogTrigger,
} from '@/components/ui/dialog';
import {
   Form,
   FormControl,
   FormDescription,
   FormField,
   FormItem,
   FormLabel,
   FormMessage,
} from '@/components/ui/form';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

export interface InviteMembersDialogProps {
   trigger?: React.ReactNode;
   workspaceId?: string;
   open?: boolean;
   onOpenChange?: (open: boolean) => void;
}

const ROLES: {
   value: MembershipRole;
   label: string;
   description: string;
   requiresOwner?: boolean;
}[] = [
   {
      value: 'MEMBER',
      label: 'Member',
      description: 'Can view, create, and edit issues, projects, and documents',
   },
   {
      value: 'ADMIN',
      label: 'Admin',
      description: 'Can invite members and manage workspace settings',
      requiresOwner: true,
   },
   {
      value: 'GUEST',
      label: 'Guest',
      description: 'Limited read-only access to assigned items',
   },
];

function parseInvitationEmails(value: string) {
   return [
      ...new Set(
         value
            .split(/[\s,;]+/)
            .filter(Boolean)
            .map((email) => email.trim().toLowerCase())
      ),
   ];
}

const inviteMembersFormSchema = z
   .object({
      emailInput: z.string(),
      role: z.enum(['MEMBER', 'ADMIN', 'GUEST']),
   })
   .superRefine(({ emailInput, role }, context) => {
      const emails = parseInvitationEmails(emailInput);
      if (emails.length === 0) {
         context.addIssue({
            code: 'custom',
            path: ['emailInput'],
            message: 'Please enter at least one email address.',
         });
         return;
      }

      for (const email of emails) {
         const validation = createInvitationInputSchema.safeParse({ email, role });
         if (!validation.success) {
            context.addIssue({
               code: 'custom',
               path: ['emailInput'],
               message: `"${email}" is not a valid email address.`,
            });
            return;
         }
      }
   });

type InviteMembersFormValues = z.infer<typeof inviteMembersFormSchema>;

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
   const isOwner = userRole === 'OWNER';
   const canInvite = hasPermission(userRole, 'membership.invite');

   const createInvitation = useCreateInvitation(effectiveWorkspaceId);

   const form = useForm<InviteMembersFormValues>({
      resolver: zodResolver(inviteMembersFormSchema),
      defaultValues: { emailInput: '', role: 'MEMBER' },
   });
   const emailInput = form.watch('emailInput');
   const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

   const handleOpenChange = (nextOpen: boolean) => {
      if (!createInvitation.isPending) {
         setOpen(nextOpen);
         if (!nextOpen) {
            form.reset({ emailInput: '', role: 'MEMBER' });
            setErrorMessage(null);
         }
      }
   };

   const handleSubmit = form.handleSubmit(async ({ emailInput, role }) => {
      if (!effectiveWorkspaceId) {
         setErrorMessage('No active workspace selected.');
         return;
      }

      if (!canInvite) {
         setErrorMessage('You do not have permission to invite members.');
         return;
      }

      const emails = parseInvitationEmails(emailInput);

      setErrorMessage(null);

      try {
         for (const email of emails) {
            await createInvitation.mutateAsync({
               email,
               role,
               key: crypto.randomUUID(),
            });
         }

         toast.success(
            emails.length === 1
               ? `Invitation sent to ${emails[0]}.`
               : `${emails.length} invitations sent.`
         );
         handleOpenChange(false);
      } catch (error) {
         const message = error instanceof Error ? error.message : 'Failed to send invitation.';
         setErrorMessage(message);
         toast.error(message);
      }
   });

   return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
         {trigger ? (
            <DialogTrigger asChild>{trigger}</DialogTrigger>
         ) : (
            <DialogTrigger asChild>
               <Button size="xs" variant="secondary" className="gap-1.5">
                  <UserPlus className="size-4" />
                  <span>Invite</span>
               </Button>
            </DialogTrigger>
         )}

         <DialogContent className="sm:max-w-md">
            <Form {...form}>
               <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <DialogHeader>
                     <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="size-5 text-primary" />
                        <span>Invite people to workspace</span>
                     </DialogTitle>
                     <DialogDescription>
                        Send an email invitation to join your workspace and collaborate on issues
                        and projects.
                     </DialogDescription>
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
                                 <FormLabel>Email addresses</FormLabel>
                                 <FormControl>
                                    <Textarea
                                       {...field}
                                       autoFocus
                                       disabled={createInvitation.isPending}
                                       placeholder="colleague@example.com&#10;teammate@example.com"
                                       rows={4}
                                       onChange={(event) => {
                                          field.onChange(event);
                                          if (errorMessage) setErrorMessage(null);
                                       }}
                                    />
                                 </FormControl>
                                 <FormDescription>
                                    Enter one address per line, or separate addresses with commas or
                                    semicolons.
                                 </FormDescription>
                                 <FormMessage />
                              </FormItem>
                           )}
                        />

                        <FormField
                           control={form.control}
                           name="role"
                           render={({ field }) => (
                              <FormItem>
                                 <FormLabel>Role</FormLabel>
                                 <Select
                                    value={field.value}
                                    onValueChange={field.onChange}
                                    disabled={createInvitation.isPending}
                                 >
                                    <FormControl>
                                       <SelectTrigger className="w-full">
                                          <SelectValue placeholder="Select a role" />
                                       </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                       {ROLES.map((role) => {
                                          const disabled = role.requiresOwner && !isOwner;
                                          return (
                                             <SelectItem
                                                key={role.value}
                                                value={role.value}
                                                disabled={disabled}
                                                className="flex flex-col items-start py-2"
                                             >
                                                <div className="flex items-center gap-1.5 font-medium">
                                                   <span>{role.label}</span>
                                                   {disabled && (
                                                      <span className="text-[10px] text-muted-foreground font-normal">
                                                         (Requires owner)
                                                      </span>
                                                   )}
                                                </div>
                                                <span className="text-xs text-muted-foreground mt-0.5">
                                                   {role.description}
                                                </span>
                                             </SelectItem>
                                          );
                                       })}
                                    </SelectContent>
                                 </Select>
                                 <FormMessage />
                              </FormItem>
                           )}
                        />

                        {errorMessage && (
                           <Alert variant="destructive">
                              <AlertDescription>{errorMessage}</AlertDescription>
                           </Alert>
                        )}
                     </div>
                  )}

                  <DialogFooter className="gap-2 sm:gap-0">
                     <DialogClose asChild>
                        <Button type="button" variant="ghost" disabled={createInvitation.isPending}>
                           Cancel
                        </Button>
                     </DialogClose>
                     <Button
                        type="submit"
                        disabled={createInvitation.isPending || !canInvite || !emailInput.trim()}
                        className="gap-2"
                     >
                        {createInvitation.isPending && <Spinner className="size-3.5" />}
                        <span>{createInvitation.isPending ? 'Sending…' : 'Send invitation'}</span>
                     </Button>
                  </DialogFooter>
               </form>
            </Form>
         </DialogContent>
      </Dialog>
   );
}
