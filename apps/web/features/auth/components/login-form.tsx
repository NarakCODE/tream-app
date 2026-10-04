'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError } from '@repo/api-client';
import { loginInputSchema, type LoginInput } from '@repo/schemas';
import { useLoginMutation } from '../hooks';
import { postAuthDestination, safeAuthRedirect, verificationDestination } from '../redirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface LoginFormProps {
   redirectTo?: string;
}

export function LoginForm({ redirectTo }: LoginFormProps) {
   const router = useRouter();
   const searchParams = useSearchParams();
   const destination = safeAuthRedirect(redirectTo || searchParams.get('redirect'));

   const [serverError, setServerError] = React.useState<string | null>(null);

   const {
      register,
      handleSubmit,
      formState: { errors },
   } = useForm<LoginInput>({
      resolver: zodResolver(loginInputSchema),
      defaultValues: {
         email: '',
         password: '',
      },
   });

   const loginMutation = useLoginMutation();

   const onSubmit = async (data: LoginInput) => {
      setServerError(null);
      loginMutation.mutate(data, {
         onSuccess: (result) => {
            toast.success('Signed in successfully');
            router.push(postAuthDestination(result.user, destination));
         },
         onError: (err: unknown) => {
            if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
               router.push(verificationDestination(destination, data.email));
               return;
            }
            const message =
               (err instanceof Error && err.message) ||
               'Invalid email or password. Please try again.';
            setServerError(message);
            toast.error(message);
         },
      });
   };

   return (
      <div className="w-full space-y-6">
         <div className="space-y-1.5 text-left">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
               Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
               Enter your credentials to access your workspace
            </p>
         </div>

         <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
               <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive font-medium">
                  {serverError}
               </div>
            )}

            <div className="space-y-2">
               <Label htmlFor="email">Email</Label>
               <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="email"
                  disabled={loginMutation.isPending}
                  {...register('email')}
               />
               {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
               <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                     href="/password-recovery"
                     className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                     Forgot password?
                  </Link>
               </div>
               <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loginMutation.isPending}
                  {...register('password')}
               />
               {errors.password && (
                  <p className="text-xs text-destructive">{errors.password.message}</p>
               )}
            </div>

            <div className="pt-2 flex flex-col gap-4">
               <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={loginMutation.isPending}
               >
                  {loginMutation.isPending ? (
                     <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                     </>
                  ) : (
                     'Sign In'
                  )}
               </Button>

               <Link
                  href="/magic-link/request"
                  className="text-center text-xs text-primary font-medium hover:underline"
               >
                  Sign in with an email link
               </Link>

               <p className="text-center text-xs text-muted-foreground">
                  Don&apos;t have an account?{' '}
                  <Link
                     href={`/signup${destination !== '/' ? `?redirect=${encodeURIComponent(destination)}` : ''}`}
                     className="text-primary font-medium hover:underline"
                  >
                     Sign up
                  </Link>
               </p>
            </div>
         </form>
      </div>
   );
}
