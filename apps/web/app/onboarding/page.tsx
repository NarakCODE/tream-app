import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { getQueryClient } from '@repo/query';
import { ApiError } from '@repo/api-client';
import { redirect } from 'next/navigation';
import { createServerApiClient } from '@/lib/server-api';
import { bootstrapQueryOptions, seedBootstrap } from '@/features/bootstrap/queries';
import { Onboarding } from '@/features/onboarding/onboarding';
import { verificationDestination } from '@/features/auth/redirect';

export const metadata = { title: 'Get started | Circle' };

export default async function OnboardingPage() {
   const client = getQueryClient();
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), 10_000);
   try {
      const api = await createServerApiClient(controller.signal);
      const bootstrap = await client.fetchQuery(bootstrapQueryOptions(api));
      seedBootstrap(client, bootstrap);
      if (bootstrap.onboarding.nextStep === 'VERIFY_EMAIL')
         redirect(verificationDestination('/onboarding'));
      if (bootstrap.onboarding.nextStep === 'DONE' && bootstrap.activeWorkspace)
         redirect(`/${encodeURIComponent(bootstrap.activeWorkspace.workspace.slug)}/my-issues`);
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
