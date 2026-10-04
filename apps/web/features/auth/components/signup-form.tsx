'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { signupInputSchema, type SignupInput } from '@repo/schemas';
import { useSignupMutation } from '../hooks';
import { verificationDestination, safeAuthRedirect } from '../redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SignupFormProps {
   redirectTo?: string;
}

export function SignupForm({ redirectTo }: SignupFormProps) {
   const router = useRouter();
   const searchParams = useSearchParams();
   const destination = safeAuthRedirect(
      redirectTo || searchParams.get('redirect') || '/onboarding'
   );

   const [serverError, setServerError] = React.useState<string | null>(null);

   const {
      register,
      handleSubmit,
      formState: { errors },
   } = useForm<SignupInput>({
      resolver: zodResolver(signupInputSchema),
      defaultValues: {
         fullName: '',
         email: '',
         password: '',
      },
   });

   const signupMutation = useSignupMutation();

   const onSubmit = async (data: SignupInput) => {
      setServerError(null);
      signupMutation.mutate(data, {
         onSuccess: () => {
            toast.success('Account created. Check your email to verify it.');
            router.push(verificationDestination(destination, data.email));
         },
         onError: (err: unknown) => {
            const message =
               (err instanceof Error && err.message) ||
               'Failed to create account. Please try again.';
            setServerError(message);
            toast.error(message);
         },
      });
   };

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               Create an account
            </h1>
            <p className="text-sm text-muted-foreground">
               Get started with your collaborative workspace
            </p>
         </div>

         <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
               <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive font-medium">
                  {serverError}
               </div>
            )}

            <div className="space-y-2">
               <Label htmlFor="fullName">Full Name</Label>
               <Input
                  id="fullName"
                  placeholder="Alex Smith"
                  autoComplete="name"
                  disabled={signupMutation.isPending}
                  {...register('fullName')}
               />
               {errors.fullName && (
                  <p className="text-xs text-destructive">{errors.fullName.message}</p>
               )}
            </div>

            <div className="space-y-2">
               <Label htmlFor="email">Email</Label>
               <Input
                  id="email"
                  type="email"
                  placeholder="alex@company.com"
                  autoComplete="email"
                  disabled={signupMutation.isPending}
                  {...register('email')}
               />
               {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
               <Label htmlFor="password">Password</Label>
               <Input
                  id="password"
                  type="password"
                  placeholder="Minimum 12 characters"
                  autoComplete="new-password"
                  disabled={signupMutation.isPending}
                  {...register('password')}
               />
               <p className="text-[11px] text-muted-foreground">
                  Must be at least 12 characters long.
               </p>
               {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
               )}
            </div>

            <div className="pt-2 flex flex-col gap-4">
               <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={signupMutation.isPending}
               >
                  {signupMutation.isPending ? (
                     <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                     </>
                  ) : (
                     'Create Account'
                  )}
               </Button>

               <p className="text-center text-xs text-muted-foreground">
                  Already have an account?{' '}
                  <Link
                     href={`/login${destination !== '/' ? `?redirect=${encodeURIComponent(destination)}` : ''}`}
                     className="text-primary font-medium hover:underline"
                  >
                     Sign in
                  </Link>
               </p>
               <Link
                  href="/email-verification"
                  className="text-center text-xs text-primary font-medium hover:underline"
               >
                  Need a new verification link?
               </Link>
            </div>
         </form>
      </div>
   );
}
