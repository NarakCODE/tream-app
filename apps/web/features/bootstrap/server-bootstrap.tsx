import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@repo/query';
import { ApiError } from '@repo/api-client';
import { redirect } from 'next/navigation';
import { AppBootstrap } from './app-bootstrap';
import { createServerApiClient } from '@/lib/server-api';
import { bootstrapQueryOptions, seedBootstrap } from './queries';
import { verificationDestination } from '@/features/auth/redirect';

export async function ServerBootstrap({ children }: { children: React.ReactNode }) {
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 10_000);
   const api = await createServerApiClient(controller.signal);
   const queryClient = getQueryClient();
   let needsVerification = false;
   try {
      const bootstrap = await queryClient.fetchQuery(bootstrapQueryOptions(api));
      seedBootstrap(queryClient, bootstrap);
      needsVerification = !bootstrap.user.emailVerified;
   } catch (error) {
      if (error instanceof ApiError && error.status === 401) redirect('/login');
      return <AppBootstrap remainingMs={0}>{children}</AppBootstrap>;
   } finally {
      clearTimeout(timeout);
   }
   if (needsVerification) redirect(verificationDestination('/'));
   return (
      <HydrationBoundary state={dehydrate(queryClient)}>
         <AppBootstrap remainingMs={1}>{children}</AppBootstrap>
      </HydrationBoundary>
   );
}
