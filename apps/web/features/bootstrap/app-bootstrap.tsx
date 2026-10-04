'use client';

import { useQuery } from '@tanstack/react-query';
import { SplashScreen } from '@repo/ui/splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { verificationDestination } from '@/features/auth/redirect';

function CircleMark() {
   return (
      <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-xl font-bold text-primary-foreground shadow-md">
         C
      </div>
   );
}

export function AppBootstrap({
   children,
   remainingMs = 10_000,
}: {
   children: ReactNode;
   remainingMs?: number;
}) {
   const router = useRouter();
   const user = useQuery(currentUserQueryOptions(api));
   const workspace = useQuery(activeWorkspaceQueryOptions(api));
   const [timedOut, setTimedOut] = useState(false);

   useEffect(() => {
      if (user.data && !user.data.emailVerified)
         router.replace(
            verificationDestination(`${window.location.pathname}${window.location.search}`)
         );
   }, [user.data, router]);

   useEffect(() => {
      const timer = window.setTimeout(() => setTimedOut(true), Math.max(0, remainingMs));
      return () => window.clearTimeout(timer);
   }, [remainingMs]);

   const ready = user.isSuccess && user.data.emailVerified && workspace.isSuccess;
   if (user.data && !user.data.emailVerified)
      return <SplashScreen brand={<CircleMark />} label="Opening email verification…" />;
   const failed = user.isError || workspace.isError || timedOut;
   if (failed && !ready) {
      return (
         <div className="flex min-h-svh items-center justify-center bg-background p-6">
            <div className="flex max-w-sm flex-col items-center gap-4 text-center">
               <CircleMark />
               <h1 className="text-xl font-semibold">Circle could not start</h1>
               <p className="text-sm text-muted-foreground">
                  We couldn’t load your session and workspace. Try again.
               </p>
               <button
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                  onClick={() => window.location.reload()}
               >
                  Retry
               </button>
            </div>
         </div>
      );
   }
   if (!ready) {
      return (
         <>
            <div inert={true} aria-hidden="true">
               {children}
            </div>
            <SplashScreen brand={<CircleMark />} label="Loading Circle…" />
         </>
      );
   }
   return <>{children}</>;
}
