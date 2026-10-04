import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@repo/query';
import { ApiError } from '@repo/api-client';
import { redirect } from 'next/navigation';
import { createServerApiClient } from '@/lib/server-api';
import { activeWorkspaceQueryOptions, currentUserQueryOptions } from '@/features/auth/queries';
import { teamListQueryOptions } from '@/features/teams/queries';
import { Onboarding } from '@/features/onboarding/onboarding';
import { verificationDestination } from '@/features/auth/redirect';

export const metadata = { title: 'Get started | Circle' };

export default async function OnboardingPage() {
   const client = getQueryClient();
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), 10_000);
   try {
      const api = await createServerApiClient(controller.signal);
      const user = await client.fetchQuery(currentUserQueryOptions(api));
      if (!user.emailVerified) redirect(verificationDestination('/onboarding'));
      const active = await client.fetchQuery(activeWorkspaceQueryOptions(api));
      if (active) await client.fetchInfiniteQuery(teamListQueryOptions(api, active.workspaceId));
   } catch (error) {
      if (error instanceof ApiError && error.status === 401)
         redirect('/login?redirect=/onboarding');
      throw error;
   } finally {
      clearTimeout(timer);
   }
   return (
      <HydrationBoundary state={dehydrate(client)}>
         <Onboarding />
      </HydrationBoundary>
   );
}
