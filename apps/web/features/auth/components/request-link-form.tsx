'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { emailInputSchema, type EmailInput } from '@repo/schemas';
import {
   useRequestEmailVerificationMutation,
   useRequestMagicLinkMutation,
   useRequestPasswordRecoveryMutation,
} from '../hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type AuthLinkAction = 'password-recovery' | 'email-verification' | 'magic-link';

const copy: Record<
   AuthLinkAction,
   { title: string; description: string; submit: string; success: string }
> = {
   'password-recovery': {
      title: 'Reset your password',
      description:
         'Enter your account email and we’ll send a password reset link if the account is eligible.',
      submit: 'Send reset link',
      success: 'If the account is eligible, a password reset link will be sent.',
   },
   'email-verification': {
      title: 'Verify your email',
      description: 'Enter the email address you used to create your account.',
      submit: 'Send verification link',
      success: 'If the account is eligible, a verification link will be sent.',
   },
   'magic-link': {
      title: 'Sign in with a link',
      description: 'We’ll email you a one-time sign-in link if the account is eligible.',
      submit: 'Send sign-in link',
      success: 'If the account is eligible, a sign-in link will be sent.',
   },
};

export function RequestLinkForm({ action }: { action: AuthLinkAction }) {
   const recovery = useRequestPasswordRecoveryMutation();
   const verification = useRequestEmailVerificationMutation();
   const magic = useRequestMagicLinkMutation();
   const activeMutation =
      action === 'password-recovery'
         ? recovery
         : action === 'email-verification'
           ? verification
           : magic;
   const [sent, setSent] = React.useState(false);
   const {
      register,
      handleSubmit,
      formState: { errors },
   } = useForm<EmailInput>({
      resolver: zodResolver(emailInputSchema),
      defaultValues: { email: '' },
   });

   const onSubmit = (input: EmailInput) => {
      setSent(false);
      activeMutation.mutate(input, {
         onSuccess: () => {
            setSent(true);
            toast.success(copy[action].success);
         },
         onError: (error) => toast.error(error.message || 'Request failed. Please try again.'),
      });
   };

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               {copy[action].title}
            </h1>
            <p className="text-sm text-muted-foreground">{copy[action].description}</p>
         </div>

         <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {sent && (
               <p role="status" className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  {copy[action].success}
               </p>
            )}

            <div className="space-y-2">
               <Label htmlFor="email">Email</Label>
               <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  disabled={activeMutation.isPending}
                  {...register('email')}
               />
               {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="pt-2 flex flex-col gap-4">
               <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={activeMutation.isPending}
               >
                  {activeMutation.isPending ? (
                     <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Sending…
                     </>
                  ) : (
                     copy[action].submit
                  )}
               </Button>

               <p className="text-center text-xs text-muted-foreground">
                  <Link href="/login" className="text-primary hover:underline">
                     Back to sign in
                  </Link>
               </p>
            </div>
         </form>
      </div>
   );
}
