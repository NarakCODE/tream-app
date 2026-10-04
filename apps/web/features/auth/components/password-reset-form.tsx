'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useResetPasswordMutation } from '../hooks';

const passwordFieldsSchema = z
   .object({
      password: z.string().min(12, 'Password must be at least 12 characters').max(256),
      confirmPassword: z.string().min(1, 'Please confirm your password'),
   })
   .refine((values) => values.password === values.confirmPassword, {
      path: ['confirmPassword'],
      message: 'Passwords do not match',
   });
type PasswordFields = z.infer<typeof passwordFieldsSchema>;

export function PasswordResetForm() {
   const searchParams = useSearchParams();
   const token = searchParams.get('token') ?? '';
   const mutation = useResetPasswordMutation();
   const [serverError, setServerError] = React.useState<string | null>(null);
   const {
      register,
      handleSubmit,
      formState: { errors },
   } = useForm<PasswordFields>({
      resolver: zodResolver(passwordFieldsSchema),
      defaultValues: { password: '', confirmPassword: '' },
   });

   const onSubmit = ({ password }: PasswordFields) => {
      setServerError(null);
      mutation.mutate(
         { token, password },
         {
            onSuccess: () => toast.success('Password updated. Sign in with your new password.'),
            onError: (error) => {
               setServerError(error.message || 'This reset link is invalid or expired.');
               toast.error(error.message || 'Password reset failed.');
            },
         }
      );
   };

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               Choose a new password
            </h1>
            <p className="text-sm text-muted-foreground">
               Use at least 12 characters for your new password.
            </p>
         </div>

         <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {!token && (
               <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
               >
                  This reset link is missing its token.
               </p>
            )}
            {serverError && (
               <p
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
               >
                  {serverError}
               </p>
            )}
            <div className="space-y-2">
               <Label htmlFor="password">New password</Label>
               <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  disabled={!token || mutation.isPending}
                  {...register('password')}
               />
               {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
               )}
            </div>
            <div className="space-y-2">
               <Label htmlFor="confirmPassword">Confirm new password</Label>
               <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  disabled={!token || mutation.isPending}
                  {...register('confirmPassword')}
               />
               {errors.confirmPassword && (
                  <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
               )}
            </div>

            <div className="pt-2">
               <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={!token || mutation.isPending}
               >
                  {mutation.isPending ? (
                     <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Updating…
                     </>
                  ) : (
                     'Update password'
                  )}
               </Button>
            </div>
         </form>
      </div>
   );
}
